import fs from 'fs';
import path from 'path';
import amqp from 'amqplib';
import { saveToJson, pushToRabbitMQ, rabbitMQUrl, rabbitMQQueue, rabbitMQBatchSize } from './config.js';

export async function saveData(scraperName, jobsArray, outputFile) {
  // 1. Save to JSON if enabled
  if (saveToJson) {
    try {
      fs.mkdirSync(path.dirname(outputFile), { recursive: true });
      fs.writeFileSync(outputFile, JSON.stringify(jobsArray, null, 2));
      console.log(`💾 [${scraperName}] Saved ${jobsArray.length} jobs to JSON: ${outputFile}`);
    } catch (err) {
      console.error(`❌ [${scraperName}] Failed to save JSON:`, err.message);
    }
  }

  // 2. Push to RabbitMQ if enabled
  if (pushToRabbitMQ) {
    try {
      console.log(`🐰 [${scraperName}] Pushing ${jobsArray.length} jobs to RabbitMQ (${rabbitMQQueue})...`);
      const connection = await amqp.connect(rabbitMQUrl);
      const channel = await connection.createChannel();
      await channel.assertQueue(rabbitMQQueue, { durable: true });

      let batchesSent = 0;
      for (let i = 0; i < jobsArray.length; i += rabbitMQBatchSize) {
        const batch = jobsArray.slice(i, i + rabbitMQBatchSize);
        const message = {
          scraper: scraperName,
          timestamp: new Date().toISOString(),
          jobs: batch
        };
        channel.sendToQueue(rabbitMQQueue, Buffer.from(JSON.stringify(message)), {
          persistent: true
        });
        batchesSent++;
      }

      console.log(`✅ [${scraperName}] Sent ${batchesSent} batches (batch size: ${rabbitMQBatchSize}) to RabbitMQ.`);
      
      setTimeout(() => {
        connection.close();
      }, 500);
    } catch (err) {
      console.error(`❌ [${scraperName}] Failed to push to RabbitMQ:`, err);
    }
  }
}
