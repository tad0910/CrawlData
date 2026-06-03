import amqp from 'amqplib';
import fs from 'fs';
import path from 'path';
import { rabbitMQUrl } from './config.js';
import dataMapper from './mapper.js';
import { connectDB, insertBatch } from './db/client.js';

const QUEUE_NAME = 'raw_jobs_queue';

async function startWorker() {
    await connectDB();
    const connection = await amqp.connect(rabbitMQUrl);
    const channel = await connection.createChannel();
    await channel.assertQueue(QUEUE_NAME, { durable: true });
    
    // Prefetch 1 message to distribute load evenly and not overwhelm memory
    channel.prefetch(1);
    
    console.log(`\n👷‍♂️ [ETL Worker] Đang lắng nghe hàng đợi ${QUEUE_NAME} tại ${rabbitMQUrl}...`);
    
    channel.consume(QUEUE_NAME, async (msg) => {
        if (msg !== null) {
            try {
                const payload = JSON.parse(msg.content.toString());
                const { scraperId, jobs } = payload;
                console.log(`\n📥 [ETL Worker] Nhận được ${jobs.length} raw jobs từ scraper [${scraperId}]`);
                
                const mapPath = path.join(process.cwd(), 'mappings', `${scraperId}_mapping.json`);
                if (!fs.existsSync(mapPath)) {
                    console.log(`⚠️ [ETL Worker] Bỏ qua ${scraperId} vì chưa cấu hình file Mapping.`);
                    channel.ack(msg);
                    return;
                }
                
                const mappingConfig = JSON.parse(fs.readFileSync(mapPath, 'utf8'));
                const jobsToInsert = [];
                
                for (const rawJob of jobs) {
                    const stdJob = dataMapper.mapJob(rawJob, scraperId, mappingConfig);
                    // Validation: các trường quan trọng không được rỗng
                    const isValid = 
                        stdJob.basic_info.raw_title && 
                        (stdJob.basic_info.locations && stdJob.basic_info.locations.length > 0) &&
                        (stdJob.working_conditions.salary_raw_text || (stdJob.working_conditions.salary_min && stdJob.working_conditions.salary_max) || stdJob.working_conditions.salary_raw_text === null) &&
                        stdJob.display_content.raw_description &&
                        stdJob.basic_info.major; // CẬP NHẬT: Thêm major vào điều kiện hợp lệ
                        
                    stdJob.status = isValid ? 'pending' : 'error';
                    jobsToInsert.push(stdJob);
                }
                
                // Chunk to avoid Postgres maximum parameters limit
                const chunkSize = 500;
                let inserted = 0;
                for (let i = 0; i < jobsToInsert.length; i += chunkSize) {
                    await insertBatch(jobsToInsert.slice(i, i + chunkSize));
                    inserted += Math.min(chunkSize, jobsToInsert.length - i);
                }
                
                console.log(`📦 [ETL Worker] Đã Mapping và chèn ${inserted} jobs vào Postgres (Chờ Kiểm Duyệt).`);
                
                // Xác nhận hoàn thành với RabbitMQ
                channel.ack(msg);
                
            } catch (err) {
                console.error('❌ [ETL Worker] Lỗi khi xử lý message từ hàng đợi:', err);
                channel.nack(msg, false, false); // Nack không đẩy lại queue để tránh lỗi loop
            }
        }
    });
}

startWorker().catch(err => {
    console.error('Worker failed to start:', err);
    process.exit(1);
});
