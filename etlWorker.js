import amqp from 'amqplib';
import fs from 'fs';
import path from 'path';
import { rabbitMQUrl } from './config.js';
import dataMapper from './mapper.js';
import { connectDB, insertBatch } from './db/client.js';

const QUEUE_NAME = 'raw_jobs_queue';

async function extractEntitiesWithAI(text) {
    if (!text || text.length < 10) return null;
    try {
        const res = await fetch('http://127.0.0.1:7777/predict', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                text: text,
                labels: ["skill", "major", "experience"],
                threshold: 0.3
            })
        });
        if (!res.ok) {
            console.error('⚠️ [AI GLiNER] Error:', await res.text());
            return null;
        }
        const data = await res.json();
        const majors = data.entities.filter(e => e.label.toUpperCase() === 'MAJOR');
        if (majors.length > 0) {
            const uniqueMajors = [...new Set(majors.map(e => e.text))];
            return uniqueMajors.join(', ');
        }
    } catch (err) {
        console.error('⚠️ [AI GLiNER] Connection Error:', err.message);
    }
    return null;
}

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
                
                // Xử lý song song (Concurrency) để tăng tốc độ gọi AI
                const CONCURRENCY_LIMIT = 10;
                let inserted = 0;
                let pendingInsert = [];
                const chunkSize = 20; // Chunk nhỏ để thấy dữ liệu lên UI nhanh hơn
                
                for (let i = 0; i < jobs.length; i += CONCURRENCY_LIMIT) {
                    const batch = jobs.slice(i, i + CONCURRENCY_LIMIT);
                    
                    const mappedBatch = await Promise.all(batch.map(async (rawJob) => {
                        const stdJob = dataMapper.mapJob(rawJob, scraperId, mappingConfig);
                        
                        // --- Tích hợp AI GLiNER ---
                        if (!stdJob.basic_info.major || stdJob.basic_info.major.trim() === '') {
                            const fullText = [
                                stdJob.display_content.raw_description || '',
                                stdJob.display_content.raw_requirements || ''
                            ].join('\n\n').trim();
                            
                            if (fullText) {
                                const aiMajor = await extractEntitiesWithAI(fullText);
                                if (aiMajor) {
                                    stdJob.basic_info.major = aiMajor;
                                    console.log(`✨ [AI] Trích xuất Major: "${aiMajor}" cho Job "${stdJob.basic_info.raw_title}"`);
                                }
                            }
                        }

                        // Validation: các trường quan trọng không được rỗng
                        const isValid = 
                            stdJob.basic_info.raw_title && 
                            (stdJob.basic_info.locations && stdJob.basic_info.locations.length > 0) &&
                            (stdJob.working_conditions.salary_raw_text || (stdJob.working_conditions.salary_min && stdJob.working_conditions.salary_max) || stdJob.working_conditions.salary_raw_text === null) &&
                            stdJob.display_content.raw_description &&
                            stdJob.basic_info.major;
                            
                        stdJob.status = isValid ? 'pending' : 'error';
                        return stdJob;
                    }));
                    
                    pendingInsert.push(...mappedBatch);
                    
                    // Insert ngay khi gom đủ chunkSize
                    if (pendingInsert.length >= chunkSize) {
                        await insertBatch(pendingInsert);
                        inserted += pendingInsert.length;
                        console.log(`📦 [ETL Worker] Đã chèn ${inserted}/${jobs.length} jobs vào Postgres...`);
                        pendingInsert = []; // Clear mảng
                    }
                }
                
                // Insert phần còn lại (nếu có)
                if (pendingInsert.length > 0) {
                    await insertBatch(pendingInsert);
                    inserted += pendingInsert.length;
                }
                
                console.log(`✅ [ETL Worker] Hoàn tất Mapping và chèn tổng cộng ${inserted} jobs vào Postgres.`);
                
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
