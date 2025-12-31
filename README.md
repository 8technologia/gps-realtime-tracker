# 🚗 GPS Realtime Tracker

Ứng dụng theo dõi GPS thời gian thực với giao diện bản đồ hiện đại, tích hợp [Traccar](https://www.traccar.org/) và [Mapbox](https://www.mapbox.com/).

![Node.js](https://img.shields.io/badge/Node.js-18+-green?logo=nodedotjs)
![Docker](https://img.shields.io/badge/Docker-Ready-blue?logo=docker)
![License](https://img.shields.io/badge/License-MIT-yellow)

## ✨ Tính năng

- 🗺️ **Bản đồ thời gian thực** - Hiển thị vị trí xe trên bản đồ Mapbox
- 📡 **WebSocket** - Cập nhật vị trí tức thời không cần refresh
- 📊 **Lịch sử lộ trình** - Xem lại hành trình với gradient màu theo thời gian
- 🚘 **Theo dõi xe** - Chế độ Follow tự động canh giữa bản đồ theo xe
- 📱 **Responsive** - Giao diện tương thích mọi thiết bị

## 📸 Demo

![GPS Tracker Interface](https://via.placeholder.com/800x400?text=GPS+Tracker+Interface)

---

## 🚀 Triển khai với Docker (Khuyên dùng)

### Yêu cầu

- [Docker](https://docs.docker.com/get-docker/) (phiên bản 20.10+)
- [Docker Compose](https://docs.docker.com/compose/install/) (phiên bản 2.0+)

### Bước 1: Clone dự án

```bash
git clone https://github.com/8technologia/gps-realtime-tracker.git
cd gps-realtime-tracker
```

### Bước 2: Cấu hình biến môi trường

```bash
# Sao chép file mẫu
cp .env.example .env

# Chỉnh sửa file .env với thông tin của bạn
nano .env
```

Điền các thông tin sau vào file `.env`:

| Biến | Mô tả | Bắt buộc |
|------|-------|----------|
| `TRACCAR_URL` | URL của Traccar server | ✅ |
| `TRACCAR_EMAIL` | Email đăng nhập Traccar | ✅ |
| `TRACCAR_PASSWORD` | Mật khẩu Traccar | ✅ |
| `MAPBOX_TOKEN` | Access token từ Mapbox | ✅ |
| `PORT` | Port chạy ứng dụng (mặc định: 8801) | ❌ |

### Bước 3: Khởi chạy

```bash
# Build và chạy container
docker-compose up -d

# Xem logs (optional)
docker-compose logs -f
```

### Bước 4: Truy cập ứng dụng

Mở trình duyệt và truy cập: **<http://localhost:8801>**

### Các lệnh Docker hữu ích

```bash
# Dừng ứng dụng
docker-compose down

# Khởi động lại
docker-compose restart

# Rebuild khi có thay đổi code
docker-compose up -d --build

# Xem trạng thái container
docker-compose ps

# Xem logs realtime
docker-compose logs -f gps-tracker
```

---

## 💻 Chạy trực tiếp (Development)

### Yêu cầu

- [Node.js](https://nodejs.org/) (phiên bản 18+)
- npm hoặc yarn

### Cài đặt

```bash
# Clone dự án
git clone https://github.com/8technologia/gps-realtime-tracker.git
cd gps-realtime-tracker

# Cài đặt dependencies
npm install

# Cấu hình môi trường
cp .env.example .env
nano .env  # Điền thông tin của bạn

# Chạy ứng dụng
npm start
```

---

## 📁 Cấu trúc dự án

```
gps-realtime-tracker/
├── public/                 # Static files
│   ├── css/
│   │   └── styles.css      # Stylesheet chính
│   ├── js/
│   │   ├── api.js          # API helper functions
│   │   ├── app.js          # Main application logic
│   │   ├── config.js       # Frontend configuration
│   │   ├── devices.js      # Device management
│   │   ├── history.js      # Route history logic
│   │   ├── map.js          # Mapbox integration
│   │   └── websocket.js    # WebSocket handling
│   └── index.html          # Main HTML file
├── server.js               # Express server & Traccar proxy
├── package.json            # Node.js dependencies
├── Dockerfile              # Docker build instructions
├── docker-compose.yml      # Docker Compose configuration
├── .env.example            # Environment variables template
└── README.md               # Documentation (file này)
```

---

## 🔧 Cấu hình Traccar Server

Dự án này yêu cầu một Traccar server để hoạt động. Bạn có thể:

1. **Sử dụng Traccar Demo**: <https://demo.traccar.org> (chỉ để test)
2. **Self-host Traccar**: [Hướng dẫn cài đặt Traccar](https://www.traccar.org/documentation/)

---

## 🔍 Troubleshooting

### Container không khởi động được

```bash
# Kiểm tra logs
docker-compose logs gps-tracker

# Kiểm tra cấu hình .env
cat .env
```

### Lỗi kết nối Traccar

- Kiểm tra `TRACCAR_URL` có đúng không
- Kiểm tra credentials (email/password)
- Đảm bảo Traccar server đang chạy

### Bản đồ không hiển thị

- Kiểm tra `MAPBOX_TOKEN` trong file `.env`
- Đăng ký token mới tại [Mapbox](https://www.mapbox.com/)

### Port đã được sử dụng

```bash
# Đổi port trong .env
PORT=8802

# Restart container
docker-compose down && docker-compose up -d
```

---

## 📄 API Endpoints

| Endpoint | Method | Mô tả |
|----------|--------|-------|
| `/api/devices` | GET | Danh sách thiết bị GPS |
| `/api/positions` | GET | Vị trí hiện tại các thiết bị |
| `/api/reports/route` | GET | Lịch sử lộ trình |
| `/api/health` | GET | Health check |
| `/api/config` | GET | Frontend configuration |
| `/ws` | WebSocket | Realtime updates |

---

## 🤝 Đóng góp

Pull requests luôn được chào đón! Với những thay đổi lớn, vui lòng mở issue trước để thảo luận.

---

## 📝 License

[MIT](LICENSE)

---

## 👨‍💻 Tác giả

**8technologia (Tám Công Nghệ)**

- GitHub: [@8technologia](https://github.com/8technologia)
