# Unified Job Scraper & Standardizer

Hệ thống cào và chuẩn hóa dữ liệu tuyển dụng tự động (Job Scraper & Standardizer) được thiết kế để linh hoạt mở rộng, tự động thu thập tin tuyển dụng từ nhiều nguồn khác nhau, chuẩn hóa tự động thông qua các Mapper tĩnh, và **sử dụng AI (Mô hình GLiNER)** để tiếp tục bóc tách sâu các thông tin chuyên ngành (Ngành nghề, Kỹ năng,...) trước khi đưa vào kho dữ liệu PostgreSQL.

Hệ thống cung cấp một **Dashboard Quản Trị Trực Quan** để theo dõi, quản lý tiến trình cào dữ liệu, kiểm duyệt tin rác, và sửa thông tin thủ công/AI.

## Kiến trúc Hệ thống

Dự án áp dụng mô hình **Decoupled Architecture** kết hợp hệ thống đa luồng (Queue-based):

1. **Scraping Layer**: Cào dữ liệu từ các trang (ITViec, TopCV, LinkedIn,...). Có thể chạy trên giao diện bằng tay.
2. **Message Broker (`RabbitMQ`)**: Luân chuyển dữ liệu từ Scraper qua ETL Worker. Giúp giảm tải và chống nghẽn.
3. **AI Extraction Layer (`api.py`)**: Web Server Python (FastAPI/Flask) chạy mô hình GLiNER-NER để trích xuất Ngành nghề (Majors) và Kỹ năng từ nội dung tin tuyển dụng thô.
4. **ETL Worker (`etlWorker.js`)**: Lắng nghe hàng đợi RabbitMQ, gửi yêu cầu trích xuất cho AI, chuẩn hóa lần cuối, và lưu vào Database.
5. **Database Layer (`db/client.js`)**: Quản lý PostgreSQL với UUID phân tách để chống trùng lặp dữ liệu tuyệt đối (Upsert `ON CONFLICT`).
6. **Dashboard & API (`dashboardServer.js`)**: Cung cấp giao diện trực quan và API phục vụ quản lý hệ thống.

## Cài đặt Môi trường

1. Đảm bảo bạn đã cài đặt Node.js và Python (>= 3.9). Cài đặt môi trường Python cho mô hình AI.
2. Cấu hình file `.env`:
```env
PUSH_TO_RABBITMQ=true
RABBITMQ_URL=amqp://localhost:5672
RABBITMQ_QUEUE=jobs_queue

# Database PostgreSQL
DB_HOST=localhost
DB_PORT=5433
DB_USER=postgres
DB_PASSWORD=
DB_DATABASE=student_360

# API Key Google Gemini (Phục vụ AI Fix / Review thông minh)
GEMINI_API_KEY=your_api_key_here
```
3. Cài đặt các thư viện Node.js:
```bash
npm install
```
4. Cài đặt các thư viện Python:
```bash
pip install -r requirements.txt
```

## Hướng dẫn Chạy Hệ Thống

Để hệ thống vận hành trơn tru toàn bộ luồng từ Cào dữ liệu -> AI Trích Xuất -> Kiểm duyệt trên giao diện, bạn cần chạy ngầm (hoặc mở các Terminal) các module sau:

### 1. Khởi chạy Giao diện Quản trị (Dashboard)
Chạy server giao diện trên cổng 3000:
```bash
node dashboardServer.js
```
👉 Sau đó truy cập vào trình duyệt: **http://localhost:3000**

### 2. Khởi chạy Mô hình AI (GLiNER)
Bạn có thể chạy trực tiếp bằng file bat (trên Windows):
```bash
start-gliner.bat
```
Hoặc chạy lệnh Python:
```bash
python api.py
```
*(Đảm bảo server Python AI chạy ở cổng 5000 để Worker có thể giao tiếp)*

### 3. Khởi chạy ETL Worker
Khởi chạy Worker để tiêu thụ dữ liệu từ RabbitMQ, chuyển qua AI bóc tách và lưu trữ vào PostgreSQL:
```bash
node etlWorker.js
```

---

## Tính năng Giao diện Quản Trị (Dashboard)

- **Job Data**: Quản lý các công việc đã được chuẩn hóa và duyệt thành công. Hỗ trợ lọc theo Ngành nghề, Địa điểm, Mức lương, v.v.
- **Kiểm duyệt Data (Review)**: Các công việc AI nhận diện thiếu (hoặc thiếu title, ngành nghề) sẽ rơi vào luồng chờ duyệt. Cung cấp tính năng **AI Fix** để tự động suy luận lại hoặc **Sửa Tay** bằng Form hiện đại.
- **Scraper / ETL**: Quản lý các tiến trình Scraper (Chạy thử/Chạy thật), theo dõi Log hệ thống Real-time trực tiếp trên web thay vì phải nhìn vào Terminal. Hỗ trợ "AI Auto-Fix Scraper" tự động phát hiện và viết lại mã bộ cào nếu layout web đích thay đổi!
- **Playwright Split & Mapping**: Tính năng cho phép mapping dữ liệu trực quan bằng thao tác kéo-thả (Drag & Drop) siêu nhanh.
