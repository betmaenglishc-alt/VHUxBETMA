# BETMA CHALLENGE – Hướng dẫn triển khai & sử dụng

## Công nghệ
Node.js ≥ 18 · Express · SQLite (better-sqlite3) · HTML/CSS/JS thuần (không cần build).

## Chạy thử
```bash
npm install
cp .env.example .env     # sửa ADMIN_PASS và SESSION_SECRET
npm start                # http://localhost:3000   |   Admin: /admin.html
```
Dữ liệu nằm trong `data/` (`betma.db` + `uploads/`). **Sao lưu thư mục này** thường xuyên.

## Triển khai thật
1. Thuê VPS (Ubuntu) hoặc dịch vụ có ổ đĩa bền (Railway/Render + Volume, Fly.io + Volume). Không dùng nền tảng ổ đĩa tạm thời (dữ liệu sẽ mất).
2. Cài Node 20, copy mã nguồn, `npm install --omit=dev`, tạo `.env`.
3. Chạy bằng `pm2 start server.js --name betma` (hoặc systemd).
4. Đặt Nginx/Caddy phía trước để có **HTTPS** (bắt buộc vì có thông tin cá nhân). Nếu sau proxy, thêm `app.set('trust proxy',1)` vào server.js.
5. Tại sự kiện: mở trang chủ trên máy tính bảng/điện thoại; mỗi người chơi xong bấm HOÀN TẤT để về người chơi mới.

## Sử dụng Admin (`/admin.html`)
- **Tổng quan:** 6 chỉ số, biểu đồ phân bố điểm, tỷ lệ hoàn thành.
- **Người tham gia:** tìm kiếm, lọc (năm học, ngày, điểm, trạng thái), bấm vào dòng để xem lịch sử trả lời, **Xuất CSV** (mở bằng Excel, đã hỗ trợ tiếng Việt).
- **Câu hỏi:** đổi hình (PNG/JPG/WebP ≤ 5MB, khuyến nghị tỉ lệ 16:10), sửa 4 mô tả, chọn đáp án đúng, sắp thứ tự, bật/tắt. Game lấy 10 câu đang bật đầu tiên. **10 câu hiện tại là câu mẫu — hãy thay bằng nội dung thật trước sự kiện.**
- Phân quyền: `admin` (toàn quyền) và `staff` (chỉ xem, không xuất dữ liệu/sửa câu hỏi). Tạo tài khoản: `POST /api/admin/users {username,password,role}` khi đã đăng nhập admin.

## Bảo mật đã áp dụng
Đáp án đúng chỉ nằm ở server (chỉ trả về sau khi người chơi xác nhận từng câu; xem lại toàn bộ chỉ sau khi hoàn thành) · mật khẩu băm scrypt · cookie phiên HttpOnly + chữ ký HMAC · giới hạn thử đăng nhập · chống CSV injection · SQL tham số hóa · `/admin.html` không chứa dữ liệu, mọi API quản trị đều yêu cầu đăng nhập.

## Ghi chú
Logo BETMA ENGLISH chưa được chèn vì chưa có file chính thức: đặt file vào `public/` và thêm thẻ `<img>` ở màn hình chào.
