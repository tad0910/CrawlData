import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { outputDir } from './config.js';
import { connectDB, disconnectDB, createTable, insertBatch } from './db/client.js';
import { MapperFactory } from './mappers/MapperFactory.js';

/**
 * Process a scraped JSON file and insert standardized jobs into the database.
 * @param {string} filename 
 */
async function processFile(filename) {
    const fullPath = path.isAbsolute(filename) ? filename : path.join(outputDir, filename);
    console.log(`Processing ${fullPath}...`);
    try {
        if (!fs.existsSync(fullPath)) {
            console.log(`File ${filename} not found, skipping.`);
            return;
        }
        
        const rawData = fs.readFileSync(fullPath, 'utf8');
        const items = JSON.parse(rawData);
        console.log(`Loaded ${items.length} items from ${filename}`);
        
        const mapper = MapperFactory.getMapper(filename);
        let batch = [];
        const BATCH_SIZE = 500;
        
        function assessJobStatus(job) {
            let nullCount = 0;
            if (!job.basic_info || !job.basic_info.title) nullCount++;
            if (!job.company_info || !job.company_info.name) nullCount++;
            if (!job.display_content || !job.display_content.description) nullCount++;
            if (!job.basic_info || !job.basic_info.salary) nullCount++;
            if (!job.basic_info || !job.basic_info.location) nullCount++;
            if (!job.basic_info || !job.basic_info.major) nullCount++;
            
            if (nullCount >= 2 || !job.basic_info?.title || !job.display_content?.description || !job.basic_info?.major) {
                return 'error';
            }
            return 'pending';
        }

        for (let i = 0; i < items.length; i++) {
            try {
                const stdJob = mapper.map(items[i]);
                if (stdJob && stdJob.internal_job_id) {
                    stdJob.status = assessJobStatus(stdJob);
                    batch.push(stdJob);
                }
                
                if (batch.length >= BATCH_SIZE || i === items.length - 1) {
                    await insertBatch(batch);
                    batch = [];
                }
            } catch (err) {
                console.error(`Error mapping item ${i} in ${filename}:`, err.message);
            }
        }
        
        console.log(`Successfully processed ${filename}.`);
    } catch (e) {
        console.error(`Failed to process ${filename}:`, e.message);
    }
}

async function main() {
    try {
        await connectDB();
        await createTable();
        
        await processFile('itviec-jobs.json');
        await processFile('topcv-jobs.json');
        await processFile('topdev-jobs.json');
        await processFile('linkedin.json');
        await processFile('mbbank-jobs.json');
        
        console.log("All data successfully standardized and inserted.");
    } catch (e) {
        console.error("Main error:", e);
    } finally {
        await disconnectDB();
    }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
    main();
}
