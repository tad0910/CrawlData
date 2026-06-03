import amqp from 'amqplib';
import dotenv from 'dotenv';
import { connectDB, insertBatch } from './db/client.js';
import { MapperFactory } from './mappers/MapperFactory.js';

dotenv.config();

const rabbitMQUrl = process.env.RABBITMQ_URL || 'amqp://localhost:5672';
const rabbitMQQueue = process.env.RABBITMQ_QUEUE || 'jobs_queue';

async function startConsumer() {
  try {
    // Kết nối CSDL trước khi tiêu thụ message
    await connectDB();

    const connection = await amqp.connect(rabbitMQUrl);
    const channel = await connection.createChannel();

    await channel.assertQueue(rabbitMQQueue, { durable: true });
    
    // Thiết lập prefetch(1) để nhận 1 message (batch) mỗi lần
    channel.prefetch(1);

    console.log(`[*] Đang chờ messages trong queue: ${rabbitMQQueue}. Nhấn CTRL+C để thoát.`);

    channel.consume(rabbitMQQueue, async (msg) => {
      if (msg !== null) {
        console.log(`\n[x] Đã nhận một message mới.`);
        try {
          const payload = JSON.parse(msg.content.toString());
          const jobs = payload.jobs || []; 
          
          console.log(`[i] Bắt đầu chuẩn hóa và chèn ${jobs.length} công việc từ nguồn ${payload.scraper} vào DB...`);

          const standardizedJobs = [];

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

          try {
            const mapper = MapperFactory.getMapper(payload.scraper);
            for (let i = 0; i < jobs.length; i++) {
              const rawJob = jobs[i];
              try {
                const job = mapper.map(rawJob);
                if (job && job.internal_job_id) {
                  job.status = assessJobStatus(job);
                  standardizedJobs.push(job);
                }
              } catch (mapErr) {
                console.error(`[!] Lỗi khi chuẩn hóa công việc thứ ${i}:`, mapErr.message);
              }
            }
          } catch (factoryErr) {
            console.error(`[!] Lỗi khi lấy mapper:`, factoryErr.message);
          }

          // Chèn vào DB
          if (standardizedJobs.length > 0) {
            await insertBatch(standardizedJobs);
            console.log(`[v] Đã chèn thành công ${standardizedJobs.length} jobs vào Database.`);
          }

          // Xác nhận đã xử lý xong message
          channel.ack(msg);
          console.log(`[v] Đã Ack message với RabbitMQ.`);
          
        } catch (error) {
          console.error(`[!] Lỗi khi xử lý message:`, error);
          // Nack để message quay lại queue nếu có lỗi
          // channel.nack(msg);
        }
      }
    }, { noAck: false });

  } catch (error) {
    console.error("Lỗi khi khởi chạy Consumer:", error);
  }
}

startConsumer();
