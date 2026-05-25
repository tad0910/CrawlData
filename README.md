# Unified Job Scraper & Standardizer

Hệ thống cào và chuẩn hóa dữ liệu tuyển dụng tự động (Job Scraper & Standardizer) được thiết kế để linh hoạt mở rộng, tự động thu thập tin tuyển dụng từ nhiều nguồn khác nhau, đồng nhất dữ liệu và lưu trữ vào cơ sở dữ liệu PostgreSQL.

## Kiến trúc Hệ thống

Dự án áp dụng mô hình **Decoupled Architecture** và **Strategy Pattern** giúp dễ dàng mở rộng, nâng cấp:

1. **Scraping Layer (`scrapers/`)**: Cào dữ liệu thô (Raw JSON) từ các trang web (ITViec, TopCV, LinkedIn,...).
2. **Message Broker (`RabbitMQ`)**: Đóng vai trò làm hàng đợi (`jobs_queue`), giúp giảm tải và xử lý bất đồng bộ.
3. **Consumer & Standardization Layer (`localConsumer.js` & `mappers/`)**: 
   - Consumer lắng nghe dữ liệu liên tục từ RabbitMQ.
   - Gọi `MapperFactory` để tự động điều hướng dữ liệu thô vào class Mapper tương ứng (kế thừa từ `BaseMapper`).
   - Sử dụng **Deterministic UUID** (Băm ID dựa vào Nguồn + ID Gốc) để sinh ra `internal_job_id` cố định, chống duplicate triệt để.
4. **Database Layer (`db/client.js`)**: Module quản lý độc lập việc kết nối PostgreSQL và lưu trữ batch, hỗ trợ `ON CONFLICT DO NOTHING` chặn trùng lặp data.

## Cài đặt Môi trường

1. Copy file `.env.example` thành `.env` và cấu hình các thông số:
```env
PUSH_TO_RABBITMQ=true
RABBITMQ_URL=amqp://localhost:5672
RABBITMQ_QUEUE=jobs_queue

# Database
DB_HOST=localhost
DB_PORT=5433
DB_USER=postgres
DB_PASSWORD=123456
DB_DATABASE=student_360
```
2. Cài đặt các thư viện phụ thuộc:
```bash
npm install
```

## Hướng dẫn Chạy Dự án

Dự án có 2 luồng xử lý tùy theo nhu cầu:

### Luồng 1: Real-time Data Streaming (Khuyên dùng)
Luồng này cho phép vừa cào vừa xử lý dữ liệu và lưu ngay vào Database thông qua RabbitMQ. Bạn cần bật 2 cửa sổ terminal:

**Terminal 1 (Bật Consumer):**
Khởi động tiến trình lắng nghe ngầm:
```bash
node localConsumer.js
```

**Terminal 2 (Chạy Scrapers):**
Khởi chạy lệnh cào dữ liệu:
```bash
node index.js
```

### Luồng 2: Offline Batch Import
Nếu bạn có sẵn các file dữ liệu (ví dụ: `itviec-jobs.json`) được tải về thủ công và chỉ muốn nạp một lần vào Database mà không dùng RabbitMQ:
```bash
node import_jobs.js
```
Script sẽ tự động quét, chuẩn hóa, lọc trùng và chèn toàn bộ vào CSDL.

## Hướng dẫn mở rộng (Thêm nguồn cào mới)

Để tích hợp thêm nguồn tuyển dụng mới (Ví dụ: `VietnamWorks`), bạn **chỉ cần làm 2 bước** mà không phải sửa đổi Consumer cốt lõi:
1. Tạo file `mappers/VietnamWorksMapper.js` kế thừa `BaseMapper` và implement hàm `map(job)`.
2. Đăng ký tên class mới này vào hàm `getMapper(scraperName)` trong file `mappers/MapperFactory.js`.

Hệ thống sẽ tự động phát hiện, chuẩn hóa và lưu trữ các nguồn mới này!
