import 'dotenv/config';
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import { spawn } from 'child_process';
import { client, connectDB } from './db/client.js';
import { sniffApi, callAI } from './scrapers/apiSniffer.js';
import dataMapper from './mapper.js';
import amqp from 'amqplib';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Start local consumer automatically to process RabbitMQ messages
const consumerProcess = spawn('node', ['localConsumer.js'], {
    cwd: process.cwd(),
    stdio: 'pipe'
});
consumerProcess.stdout.on('data', (data) => console.log(`[Consumer] ${data}`));
consumerProcess.stderr.on('data', (data) => console.error(`[Consumer Error] ${data}`));
consumerProcess.on('close', (code) => console.log(`[Consumer] Exited with code ${code}`));

const app = express();
app.use(express.json());
const PORT = process.env.PORT || 3000;

// Connect to DB once when server starts
connectDB().then(() => {
    console.log('✅ Connected to database for Dashboard API');
}).catch(console.error);

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
        const { limit, scraper_id } = req.query;
        let query = 'SELECT * FROM standardized_jobs';
        let params = [];
        let conditions = ["status = 'approved'"];

        if (scraper_id) {
            conditions.push(`source_metadata::text ILIKE $${params.length + 1}`);
            params.push(`%${scraper_id}%`);
        }
        
        if (conditions.length > 0) {
            query += ' WHERE ' + conditions.join(' AND ');
        }
        
        query += " ORDER BY (timestamps->>'crawled_at') DESC NULLS LAST";

        if (limit) {
            query += ` LIMIT $${params.length + 1}`;
            params.push(parseInt(limit, 10));
        } else if (Object.keys(req.query).length === 0) {
            // Prevent freezing the browser by capping the dashboard view at 2000 latest jobs
            query += ' LIMIT 2000';
        }

        // Bỏ cache nếu có filter cụ thể (cho Test/AI)
        if (Object.keys(req.query).length > 0) {
            const result = await client.query(query, params);
            return res.json(result.rows);
        }

        // Dùng cache cho Dashboard mặc định
        const now = Date.now();
        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Cache-Control', 'public, max-age=60'); 

        if (cachedJobsJson && (now - lastCacheTime < CACHE_TTL)) {
            console.log('[Dashboard] Phục vụ /api/jobs từ RAM Cache (Siêu nhanh)');
            return res.send(cachedJobsJson);
        }

        console.log('[Dashboard] Query DB /api/jobs (Truy xuất mới, max 2000)');
        const result = await client.query(query, params);
        cachedJobsJson = JSON.stringify(result.rows);
        lastCacheTime = now;
        res.send(cachedJobsJson);
    } catch (err) {
        console.error('Error fetching jobs:', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

// Lấy kết quả Test thô từ file JSON (chưa qua chuẩn hóa PostgreSQL)
app.get('/api/test-result/:id', (req, res) => {
    const id = req.params.id;
    const jsonPath = path.join(process.cwd(), 'dbs', `${id}-test-jobs.json`);
    
    if (fs.existsSync(jsonPath)) {
        res.sendFile(jsonPath);
    } else {
        res.json([]);
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
        const domainMatch = url.match(/:\/\/(www\.)?([^/]+)/);
        const domain = domainMatch ? domainMatch[2] : 'unknown';
        const safeDomain = domain.replace(/[^a-zA-Z0-9]/g, '');
        
        // 1. Chống trùng lặp (Duplicate Check)
        const scrapersDir = path.join(__dirname, 'scrapers');
        if (fs.existsSync(scrapersDir)) {
            const files = fs.readdirSync(scrapersDir).filter(f => f.endsWith('.js'));
            const existing = files.find(f => f.startsWith(`auto_${safeDomain}_`));
            if (existing) {
                const existingId = existing.replace('.js', '');
                return res.status(400).json({ 
                    error: `Hệ thống đã có Scraper quản lý domain này (ID: ${existingId}). Vui lòng dùng tính năng 'AI Tự Sửa' trên Scraper hiện tại thay vì tạo mới để tránh xung đột dữ liệu.` 
                });
            }
        }

        // Smart Routing for hardcoded scrapers
        const lowerUrl = url.toLowerCase();
        let hardcodedId = null;
        if (!lowerUrl.includes('force_dynamic=true')) {
            if (lowerUrl.includes('itviec')) hardcodedId = 'itviec';
            else if (lowerUrl.includes('topcv')) hardcodedId = 'topcv';
            else if (lowerUrl.includes('topdev')) hardcodedId = 'topdev';
            else if (lowerUrl.includes('mbbank')) hardcodedId = 'mbbank';
        }

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

const activeScrapers = new Map(); // Store active scraper processes and logs

// API endpoint to run a scraper
app.post('/api/run-scraper', (req, res) => {
    const { id, real } = req.body;
    if (!id) return res.status(400).json({ error: 'Scraper ID is required' });

    if (activeScrapers.has(id)) {
        // Báo success để giao diện UI có thể tiếp tục tự động móc (reattach) vào tiến trình đang chạy
        return res.json({ success: true, message: 'Already running, reattaching...' });
    }

    const logEntry = {
        logs: `Starting scraper: ${id} (Mode: ${real ? 'REAL' : 'TEST'})...\n`,
        status: 'running',
        process: null
    };
    activeScrapers.set(id, logEntry);

    // Clear old test JSON file if it exists so we don't append to old test results
    const testJsonPath = path.join(process.cwd(), 'dbs', `${id}-test-jobs.json`);
    if (fs.existsSync(testJsonPath)) {
        try { fs.unlinkSync(testJsonPath); } catch (e) {}
    }

    // Spawn the node process with TEST_MODE explicitly overridden
    const envVars = { ...process.env };
    envVars.TEST_MODE = real ? 'false' : 'true';

    const child = spawn('node', ['index.js', id], { 
        cwd: process.cwd(),
        env: envVars
    });
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

// --- VAULT CREDENTIALS API (PostgreSQL) ---
app.get('/api/vault', async (req, res) => {
    try {
        const result = await client.query('SELECT id, domain, username, status, created_at FROM vault_credentials ORDER BY domain ASC');
        res.json(result.rows);
    } catch (err) {
        console.error('Error fetching vault:', err);
        res.status(500).json({ error: 'Database error' });
    }
});

app.post('/api/vault', async (req, res) => {
    const { domain, username, password } = req.body;
    if (!domain || !username || !password) return res.status(400).json({ error: 'Missing fields' });
    
    try {
        // Upsert logic based on domain
        await client.query(`
            INSERT INTO vault_credentials (domain, username, password_encrypted, updated_at)
            VALUES ($1, $2, $3, CURRENT_TIMESTAMP)
            ON CONFLICT (domain) DO UPDATE 
            SET username = EXCLUDED.username, 
                password_encrypted = EXCLUDED.password_encrypted,
                updated_at = CURRENT_TIMESTAMP
        `, [domain.toLowerCase(), username, password]); // Storing plain text currently, should be encrypted in prod
        
        res.json({ success: true });
    } catch (err) {
        console.error('Error saving vault:', err);
        res.status(500).json({ error: 'Database error' });
    }
});

app.delete('/api/vault/:id', async (req, res) => {
    try {
        await client.query('DELETE FROM vault_credentials WHERE id = $1', [req.params.id]);
        res.json({ success: true });
    } catch (err) {
        console.error('Error deleting vault:', err);
        res.status(500).json({ error: 'Database error' });
    }
});

// --- SCRAPERS LIST API ---
app.get('/api/scrapers', (req, res) => {
    const scrapersDir = path.join(__dirname, 'scrapers');
    if (!fs.existsSync(scrapersDir)) return res.json([]);
    
    const files = fs.readdirSync(scrapersDir).filter(f => f.endsWith('.js') && f !== 'apiSniffer.js' && f !== 'base');
    const result = files.map(f => {
        const id = f.replace('.js', '');
        const active = activeScrapers.get(id);
        
        // Try to read type from file
        let type = 'Unknown';
        try {
            const content = fs.readFileSync(path.join(scrapersDir, f), 'utf8');
            if (content.includes('BaseHtmlScraper')) type = 'HTML';
            if (content.includes('BaseApiScraper')) type = 'API';
        } catch(e) {}
        
        return {
            id,
            file: `scrapers/${f}`,
            type,
            status: active ? active.status : 'idle'
        };
    });
    res.json(result);
});

// Xóa Scraper
app.delete('/api/scrapers/:id', (req, res) => {
    const id = req.params.id;
    if (!id) return res.status(400).json({ error: 'Missing ID' });

    // 1. Kiểm tra tiến trình đang chạy
    if (activeScrapers.has(id)) {
        const active = activeScrapers.get(id);
        if (active.status === 'running') {
            if (active.process) {
                try { process.kill(active.process.pid); } catch(e) {}
            }
            activeScrapers.delete(id);
        }
    }

    // 2. Xóa các file cứng
    const filesToDelete = [
        path.join(__dirname, 'scrapers', `${id}.js`),
        path.join(process.cwd(), 'dbs', `${id}-jobs.json`),
        path.join(process.cwd(), 'dbs', `${id}-test-jobs.json`),
        path.join(process.cwd(), 'state', `${id}-state.json`),
        path.join(process.cwd(), 'cookies', `${id}-cookies.json`)
    ];

    let deletedCount = 0;
    for (const f of filesToDelete) {
        if (fs.existsSync(f)) {
            try {
                fs.unlinkSync(f);
                deletedCount++;
            } catch (err) {
                console.error(`Không thể xóa file ${f}:`, err);
            }
        }
    }

    res.json({ success: true, deleted_files: deletedCount });
});

// --- AI ASSISTED FIX API ---
app.post('/api/ai-fix-scraper', async (req, res) => {
    const { id, prompt, aiProvider = 'gemini' } = req.body;
    if (!id || !prompt) return res.status(400).json({ error: 'Missing scraper ID or prompt' });

    const scraperFile = path.join(__dirname, 'scrapers', `${id}.js`);
    if (!fs.existsSync(scraperFile)) return res.status(404).json({ error: 'Scraper not found' });

    try {
        const currentCode = fs.readFileSync(scraperFile, 'utf8');
        
        let contextData = '';
        const htmlContextPath = path.join(__dirname, 'scratch', `${id}_last_detail.html`);
        const jsonContextPath = path.join(__dirname, 'scratch', `${id}_last_detail.json`);
        
        if (fs.existsSync(htmlContextPath)) {
            const htmlContent = fs.readFileSync(htmlContextPath, 'utf8');
            contextData = `\nHere is the actual HTML of the target page the scraper is trying to parse:\n\`\`\`html\n${htmlContent.substring(0, 100000)}\n\`\`\`\n`;
        } else if (fs.existsSync(jsonContextPath)) {
            const jsonContent = fs.readFileSync(jsonContextPath, 'utf8');
            contextData = `\nHere is the actual JSON API response the scraper is trying to parse:\n\`\`\`json\n${jsonContent.substring(0, 100000)}\n\`\`\`\n`;
        }

        const aiPrompt = `You are an expert Javascript Data Engineer.
I have a web scraper script written in Node.js (Puppeteer/Playwright + Cheerio style).
Here is the CURRENT CODE:
\`\`\`javascript
${currentCode}
\`\`\`
${contextData}
The user has reported an issue and wants you to fix the script. 
USER INSTRUCTION: "${prompt}"

Analyze the code, the user instruction, and the provided HTML/JSON structure (if any) carefully. Rewrite the script to fix the issue.
CRITICAL RULES:
1. Preserve the class structure, imports, and execution method at the bottom!
2. Do not change the class name or constructor unless necessary.
3. Fix ONLY what the user asked for (e.g. updating a CSS selector, fixing a regex).
4. Return ONLY a valid JSON object containing a "changelog" field (briefly explaining what changed in Vietnamese) and a "code" field with the FULL ENTIRE new script content. NO Markdown wrappers outside the JSON!

Example Response Format:
{
  "changelog": "Đã sửa lại CSS selector của biến requirements thành '.job-requirements'",
  "code": "import { BaseHtmlScraper } from ... \\n ..."
}`;

        const aiResponse = await callAI(aiPrompt, aiProvider);
        if (aiResponse && aiResponse.code) {
            fs.writeFileSync(scraperFile, aiResponse.code);
            res.json({ success: true, changelog: aiResponse.changelog || 'Không có mô tả thay đổi.', message: 'Script updated successfully' });
        } else {
            throw new Error('AI returned invalid format');
        }
    } catch (err) {
        console.error('AI Fix Error:', err);
        res.status(500).json({ error: 'Failed to fix script with AI', details: err.message });
    }
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

// ==========================================
// DATA REVIEW PIPELINE APIs
// ==========================================

app.get('/api/review-jobs', async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 20;
        const offset = (page - 1) * limit;
        const statuses = req.query.status ? req.query.status.split(',') : ['pending', 'error'];

        // Build parameterized IN clause
        const statusPlaceholders = statuses.map((_, i) => `$${i + 1}`).join(',');
        
        const countQuery = `SELECT COUNT(*) FROM standardized_jobs WHERE status IN (${statusPlaceholders})`;
        const countResult = await client.query(countQuery, statuses);
        const total = parseInt(countResult.rows[0].count);

        const dataQuery = `
            SELECT * FROM standardized_jobs 
            WHERE status IN (${statusPlaceholders}) 
            ORDER BY (timestamps->>'scraped_at') DESC NULLS LAST
            LIMIT $${statuses.length + 1} OFFSET $${statuses.length + 2}
        `;
        const dataResult = await client.query(dataQuery, [...statuses, limit, offset]);

        res.json({
            data: dataResult.rows,
            total,
            page,
            limit,
            totalPages: Math.ceil(total / limit)
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'DB error' });
    }
});

app.post('/api/review-jobs/approve-all', async (req, res) => {
    try {
        await client.query(`UPDATE standardized_jobs SET status = 'approved' WHERE status = 'pending'`);
        cachedJobsJson = null;
        res.json({ success: true });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'DB error' });
    }
});

app.post('/api/review-jobs/:id/approve', async (req, res) => {
    try {
        await client.query(`UPDATE standardized_jobs SET status = 'approved' WHERE internal_job_id = $1`, [req.params.id]);
        cachedJobsJson = null;
        res.json({ success: true });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'DB error' });
    }
});

app.post('/api/review-jobs/:id/decline', async (req, res) => {
    try {
        await client.query(`UPDATE standardized_jobs SET status = 'declined' WHERE internal_job_id = $1`, [req.params.id]);
        cachedJobsJson = null;
        res.json({ success: true });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'DB error' });
    }
});

app.put('/api/review-jobs/:id', async (req, res) => {
    const { basic_info, company_info, display_content, salary, location, major } = req.body;
    try {
        // Fetch current job
        const jobRes = await client.query(`SELECT * FROM standardized_jobs WHERE internal_job_id = $1`, [req.params.id]);
        if (jobRes.rows.length === 0) return res.status(404).json({ error: 'Not found' });
        
        let job = jobRes.rows[0];
        
        // Cập nhật các trường
        if (basic_info) job.basic_info = { ...job.basic_info, ...basic_info };
        if (company_info) job.company_info = { ...job.company_info, ...company_info };
        if (display_content) job.display_content = { ...job.display_content, ...display_content };
        
        // Gán cứng một số trường hay sửa vào basic_info cho tiện
        if (salary !== undefined) {
            job.basic_info = job.basic_info || {};
            job.basic_info.salary = salary;
        }
        if (location !== undefined) {
            job.basic_info = job.basic_info || {};
            job.basic_info.location = location;
        }
        if (major !== undefined) {
            job.basic_info = job.basic_info || {};
            job.basic_info.major = major;
        }

        // Kiểm tra tính hợp lệ mới
        const isValid = 
            (job.basic_info.title || job.basic_info.raw_title) && 
            (job.basic_info.locations?.length > 0 || job.basic_info.location) &&
            job.basic_info.major;
            
        const newStatus = isValid ? 'pending' : 'error';

        await client.query(`
            UPDATE standardized_jobs 
            SET basic_info = $1, company_info = $2, display_content = $3, status = $4
            WHERE internal_job_id = $5
        `, [
            JSON.stringify(job.basic_info), 
            JSON.stringify(job.company_info), 
            JSON.stringify(job.display_content), 
            newStatus,
            req.params.id
        ]);
        
        cachedJobsJson = null;
        res.json({ success: true, updated: job });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'DB error' });
    }
});

app.post('/api/review-jobs/:id/ai-fix', async (req, res) => {
    try {
        const jobRes = await client.query(`SELECT * FROM standardized_jobs WHERE internal_job_id = $1`, [req.params.id]);
        if (jobRes.rows.length === 0) return res.status(404).json({ error: 'Not found' });
        const job = jobRes.rows[0];
        
        const apiKey = process.env.GEMINI_API_KEY;
        if (!apiKey) return res.status(500).json({ error: 'GEMINI_API_KEY is missing' });
        
        const prompt = `
Tôi có một object công việc bị thiếu một số trường quan trọng (salary, location, title, major...).
Hãy đọc source_metadata và description bên dưới để trích xuất ra các thông tin bị thiếu.
Lưu ý "major" là chuyên ngành hoặc lĩnh vực công việc (ví dụ: IT, Marketing, Kế toán, Cơ khí...). Nếu không rõ, hãy dựa vào title hoặc description để suy đoán ngắn gọn.
Trả về KẾT QUẢ DUY NHẤT LÀ ĐỊNH DẠNG JSON hợp lệ. Bắt buộc có các key sau (nếu không tìm thấy thì để null):
{ "title": "...", "company": "...", "location": "...", "salary": "...", "major": "..." }

Dữ liệu hiện tại:
source_metadata: ${JSON.stringify(job.source_metadata)}
description: ${job.display_content?.description?.substring(0, 3000)}
        `;

        const geminiRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
        });
        
        const geminiData = await geminiRes.json();
        const textResponse = geminiData.candidates?.[0]?.content?.parts?.[0]?.text || '';
        
        // Parse JSON from textResponse
        const jsonMatch = textResponse.match(/\\{.*\\}/s);
        if (!jsonMatch) throw new Error('AI did not return valid JSON');
        const extracted = JSON.parse(jsonMatch[0]);
        
        res.json({ success: true, aiData: extracted });
    } catch (err) {
        console.error('AI Fix error:', err);
        res.status(500).json({ error: err.message });
    }
});

// --- ETL MAPPING STUDIO APIs ---

app.get('/api/scrapers/:id/sample-job', (req, res) => {
    const { id } = req.params;
    const jobsPath = path.join(process.cwd(), 'dbs', `${id}-jobs.json`);
    if (!fs.existsSync(jobsPath)) return res.status(404).json({ error: 'No scraped data found. Please run the scraper first.' });
    
    try {
        const jobs = JSON.parse(fs.readFileSync(jobsPath, 'utf8'));
        if (jobs.length === 0) return res.status(404).json({ error: 'Data file is empty' });
        // Return the first job as sample
        res.json(jobs[0]);
    } catch (e) {
        res.status(500).json({ error: 'Error reading sample job' });
    }
});

app.get('/api/scrapers/:id/mapping', (req, res) => {
    const { id } = req.params;
    const mapPath = path.join(process.cwd(), 'mappings', `${id}_mapping.json`);
    if (fs.existsSync(mapPath)) {
        res.json(JSON.parse(fs.readFileSync(mapPath, 'utf8')));
    } else {
        res.json(null);
    }
});

app.post('/api/scrapers/:id/mapping', (req, res) => {
    const { id } = req.params;
    const mappingData = req.body;
    try {
        const mappingsDir = path.join(process.cwd(), 'mappings');
        if (!fs.existsSync(mappingsDir)) fs.mkdirSync(mappingsDir);
        fs.writeFileSync(path.join(mappingsDir, `${id}_mapping.json`), JSON.stringify(mappingData, null, 2));
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: 'Failed to save mapping' });
    }
});

app.post('/api/scrapers/:id/apply-mapping', (req, res) => {
    const { id } = req.params;
    const jobsPath = path.join(process.cwd(), 'dbs', `${id}-jobs.json`);
    const mapPath = path.join(process.cwd(), 'mappings', `${id}_mapping.json`);
    
    if (!fs.existsSync(jobsPath)) return res.status(404).json({ error: 'No raw data found.' });
    if (!fs.existsSync(mapPath)) return res.status(400).json({ error: 'No mapping found. Please configure mapping first.' });

    try {
        const rawJobs = JSON.parse(fs.readFileSync(jobsPath, 'utf8'));
        const mappingConfig = JSON.parse(fs.readFileSync(mapPath, 'utf8'));
        
        const successJobs = [];
        const errorJobs = [];
        
        for (const rawJob of rawJobs) {
            const stdJob = dataMapper.mapJob(rawJob, id, mappingConfig);
            // Validation criteria: raw_title, location, salary, description must not be null/empty
            const isValid = 
                stdJob.basic_info.raw_title && 
                (stdJob.basic_info.locations && stdJob.basic_info.locations.length > 0) &&
                (stdJob.working_conditions.salary_raw_text || (stdJob.working_conditions.salary_min && stdJob.working_conditions.salary_max) || stdJob.working_conditions.salary_raw_text === null) &&
                stdJob.display_content.raw_description;
                
            if (isValid) {
                stdJob.timestamps.status = 'PENDING_PUSH'; // Temporary status
                successJobs.push({ raw: rawJob, std: stdJob });
            } else {
                stdJob.timestamps.status = 'ERROR';
                errorJobs.push({ raw: rawJob, std: stdJob });
            }
        }
        
        // Save the staging results
        const stagingDir = path.join(process.cwd(), 'staging');
        if (!fs.existsSync(stagingDir)) fs.mkdirSync(stagingDir);
        fs.writeFileSync(path.join(stagingDir, `${id}_staging.json`), JSON.stringify({ successJobs, errorJobs }, null, 2));

        res.json({ success: true, summary: { success: successJobs.length, error: errorJobs.length } });
    } catch (e) {
        console.error('Error applying mapping:', e);
        res.status(500).json({ error: 'Failed to apply mapping', details: e.message });
    }
});

app.get('/api/scrapers/:id/staging', (req, res) => {
    const { id } = req.params;
    const stagingPath = path.join(process.cwd(), 'staging', `${id}_staging.json`);
    if (fs.existsSync(stagingPath)) {
        res.json(JSON.parse(fs.readFileSync(stagingPath, 'utf8')));
    } else {
        res.json({ successJobs: [], errorJobs: [] });
    }
});

app.post('/api/scrapers/:id/push-rabbitmq', async (req, res) => {
    const { id } = req.params;
    const stagingPath = path.join(process.cwd(), 'staging', `${id}_staging.json`);
    if (!fs.existsSync(stagingPath)) return res.status(404).json({ error: 'No staging data found.' });

    try {
        const stagingData = JSON.parse(fs.readFileSync(stagingPath, 'utf8'));
        const jobsToPush = stagingData.successJobs.map(j => j.std); // Only push standardized schema
        
        if (jobsToPush.length === 0) return res.status(400).json({ error: 'No successful jobs to push.' });

        const connection = await amqp.connect('amqp://localhost');
        const channel = await connection.createChannel();
        const queueName = 'jobs_queue';
        await channel.assertQueue(queueName, { durable: true });
        
        channel.sendToQueue(queueName, Buffer.from(JSON.stringify(jobsToPush)), { persistent: true });
        
        await channel.close();
        await connection.close();
        
        // Clear staging file after successful push
        fs.unlinkSync(stagingPath);
        
        res.json({ success: true, count: jobsToPush.length });
    } catch (err) {
        console.error('RabbitMQ push error:', err);
        res.status(500).json({ error: 'Failed to push to RabbitMQ', details: err.message });
    }
});

app.listen(PORT, () => {
    console.log(`\n=================================================`);
    console.log(`🚀 Dashboard server running at:`);
    console.log(`   http://localhost:${PORT}`);
    console.log(`=================================================\n`);
});
