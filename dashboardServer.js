import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { client, connectDB } from './db/client.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
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

app.listen(PORT, () => {
    console.log(`\n=================================================`);
    console.log(`🚀 Dashboard server running at:`);
    console.log(`   http://localhost:${PORT}`);
    console.log(`=================================================\n`);
});
