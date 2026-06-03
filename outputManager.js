import fs from 'fs';
import path from 'path';
import amqp from 'amqplib';
import { saveToJson, pushToRabbitMQ, rabbitMQUrl } from './config.js';

export async function saveData(scraperName, jobsArray, outputFile) {
  // 1. Save to JSON if enabled
  if (saveToJson) {
    try {
      fs.mkdirSync(path.dirname(outputFile), { recursive: true });
      fs.writeFileSync(outputFile, JSON.stringify(jobsArray, null, 2));
      console.log(`\n💾 [${scraperName}] Saved ${jobsArray.length} raw jobs to JSON: ${outputFile}`);
    } catch (err) {
      console.error(`❌ [${scraperName}] Failed to save JSON:`, err.message);
    }
  }

  // 2. Đẩy raw jobs vào RabbitMQ để etlWorker xử lý
  if (pushToRabbitMQ && process.env.TEST_MODE !== 'true') {
      try {
          console.log(`\n🐰 [${scraperName}] Đang đẩy ${jobsArray.length} RAW jobs vào RabbitMQ (raw_jobs_queue)...`);
          const connection = await amqp.connect(rabbitMQUrl);
          const channel = await connection.createChannel();
          const queueName = 'raw_jobs_queue';
          await channel.assertQueue(queueName, { durable: true });
          
          // Chunk data to avoid overly large messages
          const chunkSize = 1000;
          for (let i = 0; i < jobsArray.length; i += chunkSize) {
              const chunk = jobsArray.slice(i, i + chunkSize);
              const payload = {
                  scraperId: scraperName,
                  jobs: chunk
              };
              channel.sendToQueue(queueName, Buffer.from(JSON.stringify(payload)), { persistent: true });
          }
          
          await channel.close();
          await connection.close();
          console.log(`✅ [${scraperName}] Đã đẩy toàn bộ RAW jobs lên RabbitMQ thành công. ETL Worker sẽ xử lý tiếp.`);
      } catch (err) {
          console.error(`❌ [${scraperName}] Lỗi khi đẩy lên RabbitMQ:`, err);
      }
  }
}

