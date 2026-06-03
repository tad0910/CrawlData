import pg from 'pg';
const { Client } = pg;
import dotenv from 'dotenv';

dotenv.config();

const client = new Client({
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432', 10),
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || '123456',
    database: process.env.DB_DATABASE || 'student_360'
});

async function connectDB() {
    try {
        await client.connect();
        console.log("[*] Đã kết nối tới PostgreSQL DB.");
    } catch (error) {
        console.error("[!] Lỗi khi kết nối tới PostgreSQL DB:", error.message);
        throw error;
    }
}

async function disconnectDB() {
    try {
        await client.end();
        console.log("[*] Đã đóng kết nối PostgreSQL DB.");
    } catch (error) {
        console.error("[!] Lỗi khi đóng kết nối PostgreSQL DB:", error.message);
    }
}

async function createTable() {
    console.log("Dropping old table if exists...");
    await client.query(`DROP TABLE IF EXISTS standardized_jobs;`);
    
    console.log("Creating new table 'standardized_jobs' with columns corresponding directly to top-level JSON keys...");
    await client.query(`
        CREATE TABLE IF NOT EXISTS standardized_jobs (
            internal_job_id UUID PRIMARY KEY,
            source_metadata JSONB,
            company_info JSONB,
            basic_info JSONB,
            working_conditions JSONB,
            display_content JSONB,
            contact_info JSONB,
            timestamps JSONB,
            status VARCHAR(20) DEFAULT 'pending'
        );
        
        -- Create indexes on critical sub-fields for efficient querying
        CREATE INDEX IF NOT EXISTS idx_provider ON standardized_jobs ((source_metadata->>'provider'));
        CREATE INDEX IF NOT EXISTS idx_original_id ON standardized_jobs ((source_metadata->>'original_id'));
    `);
    console.log("Table 'standardized_jobs' successfully created.");
}

async function insertBatch(batch) {
    if (!batch || batch.length === 0) return;
    
    let query = `
        INSERT INTO standardized_jobs (
            internal_job_id,
            source_metadata,
            company_info,
            basic_info,
            working_conditions,
            display_content,
            contact_info,
            timestamps,
            status
        ) VALUES 
    `;
    let values = [];
    let count = 1;
    
    for (const job of batch) {
        query += `($${count++}, $${count++}, $${count++}, $${count++}, $${count++}, $${count++}, $${count++}, $${count++}, $${count++}),`;
        values.push(
            job.internal_job_id,
            JSON.stringify(job.source_metadata),
            JSON.stringify(job.company_info),
            JSON.stringify(job.basic_info),
            JSON.stringify(job.working_conditions),
            JSON.stringify(job.display_content),
            JSON.stringify(job.contact_info),
            JSON.stringify(job.timestamps),
            job.status || 'pending'
        );
    }
    
    query = query.slice(0, -1) + ' ON CONFLICT (internal_job_id) DO NOTHING;';
    
    try {
        await client.query(query, values);
    } catch (e) {
        console.error('Error inserting batch:', e.message);
        throw e;
    }
}

export {
    client,
    connectDB,
    disconnectDB,
    createTable,
    insertBatch
};
