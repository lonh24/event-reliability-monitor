# Yêu cầu môi trường phát triển

Tài liệu này mô tả công cụ cần chuẩn bị cho Event Reliability Monitor (ERM). Các yêu cầu dưới đây là định hướng phát triển, không phải xác nhận ứng dụng đã được build hoặc chạy trên một máy cụ thể.

## Hiện trạng

Repository mới có cấu trúc ban đầu và tài liệu. Frontend, Backend và cấu hình Docker Compose chưa được triển khai; chưa có lệnh khởi chạy ứng dụng.

## Frontend dùng mock data

| Công cụ | Yêu cầu hoặc khuyến nghị |
|---|---|
| Git | Cần để clone và quản lý phiên bản |
| Node.js | Khuyến nghị bản LTS được phiên bản Vite của dự án hỗ trợ; sẽ khóa yêu cầu cụ thể khi khởi tạo frontend |
| npm | Dùng phiên bản đi kèm Node.js tương thích; dependency sẽ được khóa bằng package-lock.json khi có frontend |
| Trình duyệt | Trình duyệt hiện đại để mở và kiểm tra giao diện |
| IDE/editor | VS Code hoặc IDE hỗ trợ TypeScript và React |

Frontend dự kiến dùng React + TypeScript + Vite và dữ liệu giả lập. Chạy mock frontend không yêu cầu Java, PostgreSQL, Kafka hoặc Docker.

## Backend và hạ tầng tương lai

| Công cụ | Vai trò dự kiến |
|---|---|
| JDK 21 | Target Java cho hai Spring Boot services |
| Maven | Build và kiểm thử Backend; hướng dẫn hoặc wrapper được bổ sung khi có service |
| PostgreSQL | Database nghiệp vụ và database monitoring tách biệt |
| Kafka | Truyền event bất đồng bộ trong giai đoạn Backend |
| Docker với Compose | Khởi chạy hạ tầng local khi cấu hình được bổ sung |

Không cần cài toàn bộ hạ tầng Backend để chuẩn bị frontend mock. Chưa có phiên bản Spring Boot, database hoặc broker được khóa trong source hiện tại.

## Tự kiểm tra máy phát triển

Mở terminal và chạy các lệnh tương ứng với giai đoạn đang làm:

```sh
git --version
node -v
npm -v
java -version
docker --version
docker compose version
```

Với Backend dùng Maven cài sẵn, kiểm tra thêm `mvn -v` và Java runtime Maven đang sử dụng. IDE và terminal cần chọn đúng JDK 21 khi bắt đầu phát triển Backend.

Khi source frontend được khởi tạo, xem yêu cầu phiên bản và lệnh cài đặt/chạy trong README của frontend; không suy ra khả năng tương thích chỉ từ việc máy đã có Node.js.
