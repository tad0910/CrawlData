import cron from 'node-cron';
import fs from 'fs';
import path from 'path';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const archiver = require('archiver');
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { outputDir } from './config.js';
import dotenv from 'dotenv';
dotenv.config();

const ENABLE_CLOUD_BACKUP = process.env.ENABLE_CLOUD_BACKUP === 'true';
const CLOUD_BACKUP_CRON = process.env.CLOUD_BACKUP_CRON || '0 2 * * *';

const s3Client = new S3Client({
  region: process.env.AWS_REGION || 'ap-southeast-1',
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID || '',
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || ''
  },
  ...(process.env.AWS_ENDPOINT ? {
    endpoint: process.env.AWS_ENDPOINT,
    forcePathStyle: true // Bắt buộc khi dùng MinIO hoặc các S3-compatible storage tự build
  } : {})
});

export async function runBackup() {
  console.log(`\n☁️ [BackupWorker] Bắt đầu quá trình backup lên Cloud...`);
  const files = fs.readdirSync(outputDir).filter(f => f.endsWith('.json'));
  
  if (files.length === 0) {
    console.log(`☁️ [BackupWorker] Không có file .json nào để backup. Bỏ qua.`);
    return;
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const zipFilename = `backup-${timestamp}.zip`;
  const zipFilePath = path.join(outputDir, zipFilename);

  console.log(`☁️ [BackupWorker] Đang nén ${files.length} files vào ${zipFilename}...`);
  
  try {
    await new Promise((resolve, reject) => {
      const output = fs.createWriteStream(zipFilePath);
      const archive = archiver('zip', { zlib: { level: 9 } });

      output.on('close', () => resolve());
      archive.on('error', err => reject(err));

      archive.pipe(output);
      files.forEach(file => {
        archive.file(path.join(outputDir, file), { name: file });
      });
      archive.finalize();
    });

    console.log(`☁️ [BackupWorker] Nén thành công. Bắt đầu upload lên S3...`);
    const fileStream = fs.createReadStream(zipFilePath);
    
    await s3Client.send(new PutObjectCommand({
      Bucket: process.env.AWS_BUCKET_NAME || 'my-bucket',
      Key: `backups/${zipFilename}`,
      Body: fileStream
    }));

    console.log(`✅ [BackupWorker] Upload thành công lên S3.`);

    // Xoá file .json cũ và file zip ở local
    console.log(`☁️ [BackupWorker] Đang dọn dẹp file local...`);
    fs.unlinkSync(zipFilePath);
    files.forEach(file => fs.unlinkSync(path.join(outputDir, file)));
    console.log(`✅ [BackupWorker] Đã xoá các file local để giải phóng dung lượng.`);

  } catch (err) {
    console.error(`❌ [BackupWorker] Lỗi trong quá trình backup:`, err.message);
  }
}

export function startBackupWorker() {
  if (!ENABLE_CLOUD_BACKUP) {
    console.log(`ℹ️ [BackupWorker] Tính năng Cloud Backup đã bị vô hiệu hóa trong .env.`);
    return;
  }
  
  console.log(`⏰ [BackupWorker] Khởi chạy cron job backup với lịch trình: "${CLOUD_BACKUP_CRON}"`);
  cron.schedule(CLOUD_BACKUP_CRON, async () => {
    await runBackup();
  });
}
