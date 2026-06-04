import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import pg from 'pg';
import fs from 'fs';
import { sniffApi } from './scrapers/apiSniffer.js';
const { Client } = pg;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(cors());
app.use(express.json());
const PORT = 3333;

// Connection string matches backend
const client = new Client({
    connectionString: process.env.DATABASE_URL || 'postgresql://postgres:000259@localhost:5433/student_360'
});

async function connectDB() {
    await client.connect();
    console.log('✅ Connected to database for Dashboard API');
}

// Connect to DB once when server starts
connectDB().catch(console.error);

// Serve static dashboard
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'dashboard.html'));
});

let cachedJobsJson = null;
let lastCacheTime = 0;
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

// API endpoint to fetch jobs
app.get('/api/jobs', async (req, res) => {
    try {
        const now = Date.now();
        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Cache-Control', 'public, max-age=60');

        if (cachedJobsJson && (now - lastCacheTime < CACHE_TTL)) {
            return res.send(cachedJobsJson);
        }

        // Query job_postings from the new schema
        const result = await client.query(`
            SELECT id, source_metadata, company_info, basic_info, working_conditions, 
                   created_at, updated_at, draft_extracted_metadata
            FROM job_postings 
            ORDER BY created_at DESC LIMIT 500
        `);

        // Map it to match the old standardized_jobs structure expected by dashboard.html
        const mappedJobs = result.rows.map(row => {
            // draft_extracted_metadata has { text, label } objects. Extract skills for the dashboard charts
            let skills = [];
            if (row.draft_extracted_metadata && Array.isArray(row.draft_extracted_metadata)) {
                skills = row.draft_extracted_metadata
                    .filter(m => m.label === 'SKILL' || m.label === 'EXPERIENCE' || m.label === 'MAJOR')
                    .map(m => m.text);
            }

            return {
                internal_job_id: row.id,
                source_metadata: row.source_metadata,
                company_info: row.company_info,
                basic_info: row.basic_info,
                working_conditions: row.working_conditions,
                timestamps: { posted_at: row.created_at, crawled_at: row.created_at },
                extracted_skills: skills
            };
        });

        cachedJobsJson = JSON.stringify(mappedJobs);
        lastCacheTime = now;
        res.send(cachedJobsJson);
    } catch (err) {
        console.error('Error fetching jobs:', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

// Cache Invalidators API (Clear cache instantly)
app.post('/api/clear-cache', (req, res) => {
    cachedJobsJson = null;
    res.json({ success: true });
});

// API endpoint to discover a new scraper
app.post('/api/discover-scraper', async (req, res) => {
    const { url, requireLogin, aiProvider } = req.body;
    if (!url) return res.status(400).json({ error: 'URL is required' });
    
    try {
        // Smart Routing for hardcoded scrapers
        const lowerUrl = url.toLowerCase();
        let hardcodedId = null;
        if (lowerUrl.includes('itviec')) hardcodedId = 'itviec';
        else if (lowerUrl.includes('topcv')) hardcodedId = 'topcv';
        else if (lowerUrl.includes('topdev')) hardcodedId = 'topdev';
        else if (lowerUrl.includes('mbbank')) hardcodedId = 'mbbank';

        let config;
        if (hardcodedId) {
            console.log(`[Dashboard] 🚦 Phát hiện URL quen thuộc. Chuyển hướng tới Hardcoded Scraper: ${hardcodedId}`);
            config = { id: hardcodedId, type: 'HARDCODED', url: url };
        } else {
            // New site, run AI Discovery
            config = await sniffApi(url, requireLogin, aiProvider);
        }
        
        // Trả về thông báo thành công và đường dẫn file
        console.log(`[Dashboard] 🎉 Đã sinh code thành công tại ${config.file}. Vui lòng chạy lệnh: node index.js ${config.id}`);
        res.json({ success: true, config });
    } catch (err) {
        console.error('Discovery error:', err);
        res.status(500).json({ error: 'Failed to discover API or HTML', details: err.message });
    }
});

// API endpoint to list dynamic scrapers
app.get('/api/dynamic-scrapers', (req, res) => {
    const configPath = path.join(__dirname, 'dynamic_scrapers.json');
    if (fs.existsSync(configPath)) {
        const data = JSON.parse(fs.readFileSync(configPath, 'utf8'));
        res.json(data.scrapers || {});
    } else {
        res.json({});
    }
});

import { spawn } from 'child_process';
const activeScrapers = new Map(); // Store active scraper processes and logs

// API endpoint to run a scraper
app.post('/api/run-scraper', (req, res) => {
    const { id } = req.body;
    if (!id) return res.status(400).json({ error: 'Scraper ID is required' });

    if (activeScrapers.has(id)) {
        return res.status(400).json({ error: 'Scraper is already running' });
    }

    const logEntry = {
        status: 'running',
        logs: `🚀 Starting execution for scraper: ${id}...\n`,
        process: null
    };
    activeScrapers.set(id, logEntry);

    // Spawn the node process
    const child = spawn('node', ['index.js', id], { cwd: process.cwd() });
    logEntry.process = child;

    const handleOutput = (data) => {
        logEntry.logs += data.toString();
        // Limit log size to prevent memory leaks (keep last 50KB)
        if (logEntry.logs.length > 50000) {
            logEntry.logs = '... [Log truncated due to size] ...\n' + logEntry.logs.slice(-45000);
        }
    };

    child.stdout.on('data', handleOutput);
    child.stderr.on('data', handleOutput);

    child.on('close', (code) => {
        logEntry.status = code === 0 ? 'completed' : 'error';
        logEntry.logs += `\n✅ Process exited with code ${code}`;
        
        // Auto invalidate cache when scraper finishes
        cachedJobsJson = null;

        // Auto cleanup after 5 minutes
        setTimeout(() => {
            activeScrapers.delete(id);
        }, 5 * 60 * 1000);
    });

    res.json({ success: true, message: 'Scraper started' });
});

// API endpoint to get scraper logs
app.get('/api/scraper-logs/:id', (req, res) => {
    const { id } = req.params;
    const entry = activeScrapers.get(id);
    
    if (!entry) {
        return res.json({ status: 'not_found', logs: 'No active logs found for this scraper or it has expired.' });
    }
    
    res.json({ status: entry.status, logs: entry.logs });
});

app.post('/api/stop-scraper', (req, res) => {
    const { id } = req.body;
    const entry = activeScrapers.get(id);
    
    if (entry && entry.process) {
        entry.process.kill('SIGKILL');
        entry.status = 'error';
        entry.logs += '\n🛑 Process was forcefully terminated by user.';
        res.json({ success: true });
    } else {
        res.status(404).json({ error: 'Process not found' });
    }
});

app.listen(PORT, () => {
    console.log(`\n=================================================`);
    console.log(`🚀 Dashboard server running at:`);
    console.log(`   http://localhost:${PORT}`);
    console.log(`=================================================\n`);
});
