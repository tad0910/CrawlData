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
  if (pushToRabbitMQ && process.env.TEST_MODE !== 'true') {
    console.log(`🐰 [${scraperName}] NOTE: Raw jobs are not pushed directly to RabbitMQ anymore.`);
    console.log(`   --> Please use the ETL Mapping Studio & Data Review UI to standardize and push to RabbitMQ.`);
  }
}
