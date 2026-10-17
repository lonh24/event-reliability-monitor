# Môi trường thực thi — chặng 0
Ngày kiểm tra: 2026-10-17 (Asia/Saigon).
Đây là container Linux của Codex, KHÔNG phải laptop Windows của người dùng.
Working directory ban đầu: `/workspace/scratch/a5e980969f01`.
Repo mới: `/workspace/scratch/a5e980969f01/event-reliability-monitor`.
`git rev-parse --show-toplevel` tại thư mục ban đầu trả exit 128: không thuộc repository nào. Không có source repository cũ trong workspace được khảo sát; không sửa `sba301-clothing-shop`.

| Lệnh | Kết quả thực tế | Exit | Đánh giá |
|---|---|---|---|
| `git --version` | git version 2.51.1 | 0 | TESTED |
| `java -version` | OpenJDK 17.0.20 | 0 | TESTED; chưa đúng target Java 21 cho Backend tương lai |
| `node -v` | v24.19.0 | 0 | TESTED; chưa thử tương thích Vite |
| `npm -v` | 11.9.0 | 0 | TESTED; có cảnh báo cấu hình http-proxy |
| `docker --version` | command not found | 127 | DEFERRED; không chặn frontend mock |
| `git status --short` trước init | not a git repository | 128 | Trạng thái dự kiến của thư mục cha |
| `git config --get user.name` | Codex | 0 | Identity môi trường, không phải xác nhận danh tính người dùng |
| `git config --get user.email` | codex@openai.com | 0 | Identity môi trường |

Không sửa cấu hình hệ thống, không cài công cụ. Cảnh báo npm: `Unknown env config "http-proxy". This will stop working in the next major version of npm.` Chưa điều tra/sửa vì không chặn lệnh kiểm tra phiên bản.
Java 17 không chặn phạm vi frontend mock; Java 21 phải được chuẩn bị khi bắt đầu Backend. Docker hoãn đến giai đoạn Backend.
Các số Git/Java/Node/npm trong prompt là thông tin lịch sử máy người dùng, không dùng làm bằng chứng kiểm chứng ở đây.

Kiểm tra laptop (NOT VERIFIED): mở PowerShell chạy `git --version`, `java -version`, `node -v`, `npm -v`, `docker --version`. Không suy ra laptop đã sẵn sàng từ container này.
