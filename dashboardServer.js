import 'dotenv/config';
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import { client, connectDB } from './db/client.js';
import { sniffApi } from './scrapers/apiSniffer.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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

// API endpoint to fetch jobs
app.get('/api/jobs', async (req, res) => {
    try {
        const result = await client.query('SELECT * FROM standardized_jobs');
        res.json(result.rows);
    } catch (err) {
        console.error('Error fetching jobs:', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
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

app.listen(PORT, () => {
    console.log(`\n=================================================`);
    console.log(`🚀 Dashboard server running at:`);
    console.log(`   http://localhost:${PORT}`);
    console.log(`=================================================\n`);
});
