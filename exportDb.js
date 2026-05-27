import fs from 'fs';
import path from 'path';
import { client, connectDB, disconnectDB } from './db/client.js';
import { outputDir } from './config.js';

async function exportData() {
    await connectDB();
    try {
        console.log('Đang truy vấn dữ liệu từ database...');
        const res = await client.query('SELECT * FROM standardized_jobs');
        const jobs = res.rows;
        
        const outputPath = path.join(outputDir, 'all_standardized_jobs.json');
        fs.mkdirSync(path.dirname(outputPath), { recursive: true });
        
        fs.writeFileSync(outputPath, JSON.stringify(jobs, null, 2));
        console.log(`\n✅ Đã xuất thành công ${jobs.length} jobs ra file:`);
        console.log(`   ${outputPath}`);
    } catch (err) {
        console.error('Lỗi khi export:', err);
    } finally {
        await disconnectDB();
    }
}

exportData();
