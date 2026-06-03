import { client, connectDB } from './db/client.js';

async function createVaultTable() {
    try {
        await connectDB();
        await client.query(`
            CREATE TABLE IF NOT EXISTS vault_credentials (
                id SERIAL PRIMARY KEY,
                domain VARCHAR(255) UNIQUE NOT NULL,
                username VARCHAR(255) NOT NULL,
                password_encrypted TEXT NOT NULL,
                status VARCHAR(50) DEFAULT 'active',
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            );
        `);
        console.log('✅ Created vault_credentials table in PostgreSQL.');
    } catch (err) {
        console.error('Error creating table:', err);
    } finally {
        process.exit(0);
    }
}

createVaultTable();
