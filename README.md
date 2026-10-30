# VTC Sport Lead Hunter & CRM

> Hệ thống Quét Học Viên Tiềm Năng & CRM Tuyển Sinh Chứng Chỉ Cục TDTT - Học Viện Thể Thao VTC

---

## 🌟 Giới thiệu

**VTC Sport Lead Hunter & CRM** là giải pháp toàn diện phục vụ công tác tuyển sinh và tiếp thị cho các khóa đào tạo, cấp chứng chỉ chuyên môn thể thao (Gym, Yoga, Dance, Võ thuật...) của Cục Thể dục Thể thao:
- **Đa nền tảng:** Quét và thu thập dữ liệu tự động từ Facebook, TikTok, Instagram, X (Twitter), Telegram và Google Maps.
- **Phân loại thông minh:** Tự động nhận diện khách hàng Doanh nghiệp/Phòng tập (B2B) và Huấn luyện viên/Cá nhân (B2C).
- **Phân tích ý định (Intent Detection):** Nhận diện nhu cầu học chứng chỉ (`cert_hunter`), tìm việc làm PT (`job_seeker`), hoặc HLV tự do (`freelance_coach`).
- **Xử lý danh tính linh hoạt:** Chuẩn hóa số điện thoại Việt Nam (10 số), hỗ trợ định danh theo `@username` hoặc link cá nhân khi người dùng ẩn SĐT trên MXH.
- **CRM Tuyển sinh & Xuất Excel:** Quản lý phễu tiếp cận, lịch sử nhắn tin/tư vấn, và xuất danh sách học viên theo định dạng Excel tiêu chuẩn.

---

## 🛠️ Công nghệ sử dụng

- **Runtime:** [Node.js](https://nodejs.org/) (hỗ trợ `node:sqlite` tích hợp)
- **Backend:** Express.js, CORS
- **Cơ sở dữ liệu:** SQLite (WAL mode, lưu trữ tại `data/vtc_sport_crm.sqlite`)
- **Web Scraping & Automation:** Playwright, Cheerio
- **Tiện ích:** XLSX (SheetJS)

---

## 📁 Cấu trúc thư mục

```text
Crawler_data_hocvien/
├── data/                    # Thư mục cơ sở dữ liệu SQLite & backups tự động
├── public/                  # Giao diện Web Dashboard (HTML, CSS, JS)
│   ├── index.html
│   └── app.js
├── src/
│   ├── crawlers/            # Bộ máy quét Google Maps & Mạng xã hội B2C
│   │   ├── crawlerEngine.js
│   │   └── socialB2CCrawler.js
│   ├── db/                  # Khởi tạo bảng, schema & logic CRM SQLite
│   │   └── database.js
│   ├── routes/              # Các REST API endpoints
│   │   └── api.js
│   ├── utils/               # Tiện ích chuẩn hóa SĐT, phân loại MXH
│   │   └── phoneParser.js
│   └── server.js            # Khởi chạy Express server
├── tests/                   # Kiểm thử logic phân loại & chống trùng lặp
│   └── verify.js
├── .gitignore
├── package.json
├── README.md
└── START_VTC_CRM.bat        # File khởi động 1-click trên Windows
```

---

## 🚀 Hướng dẫn cài đặt & Chạy ứng dụng

### 1. Yêu cầu hệ thống
- Đã cài đặt [Node.js](https://nodejs.org/) (khuyên dùng Node.js 22 LTS trở lên).
- Trình duyệt Web (Chrome, Edge, Cốc Cốc...).

### 2. Cài đặt thư viện dependencies
Mở terminal tại thư mục dự án và chạy:
```bash
npm install
```

*(Nếu cần tải trình duyệt cho Playwright)*:
```bash
npx playwright install chromium
```

### 3. Khởi chạy hệ thống

- **Cách 1: Khởi động nhanh (Khuyên dùng trên Windows)**
  Nhấp đúp chuột vào file:
  ```text
  START_VTC_CRM.bat
  ```
  Hệ thống sẽ tự động bật server và mở trình duyệt tại địa chỉ `http://localhost:3000`.

- **Cách 2: Khởi động bằng dòng lệnh**
  ```bash
  # Chế độ Production
  npm start

  # Hoặc chế độ Development (tự động reload khi sửa code)
  npm run dev
  ```

---

## 🧪 Kiểm thử (Testing)

Chạy bộ kiểm thử phân loại và nhận diện mạng xã hội:
```bash
npm test
```
