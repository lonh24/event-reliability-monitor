# Event Reliability Monitor (ERM)

ERM là dashboard dành cho backend developer điều tra sự kiện bất đồng bộ, các lần xử lý và bằng chứng về tác động nghiệp vụ.

Ví dụ mục tiêu: sự kiện `OrderPaid` có thể được giao lại nhiều lần, nhưng nghiệp vụ chỉ được cộng điểm loyalty một lần. Monitor dự kiến nhận processing reports và đối chiếu bằng chứng chỉ đọc; thiếu bằng chứng phải được thể hiện là `UNKNOWN`.

## Trạng thái hiện tại

Repository hiện có cấu trúc ban đầu và tài liệu yêu cầu môi trường. Chưa triển khai frontend, Backend, Kafka hoặc hệ thống monitoring chạy thật.

Starter kit dự kiến gồm tài liệu thiết kế, giao diện React + TypeScript + Vite dùng mock data và roadmap phát triển Backend. Hai service và hạ tầng hiện chỉ là placeholder.

## Cấu trúc

| Đường dẫn | Mục đích |
|---|---|
| [docs/environment.md](docs/environment.md) | Yêu cầu môi trường phát triển |
| [demo-service/](demo-service/README.md) | Placeholder cho order/loyalty và xử lý event |
| [monitor-service/](monitor-service/README.md) | Placeholder cho quan sát event, rules và incidents |
| [infrastructure/](infrastructure/README.md) | Placeholder cho Docker Compose về sau |

## Bắt đầu

Đọc [yêu cầu môi trường](docs/environment.md). Hiện chưa có ứng dụng hoặc lệnh khởi chạy; hướng dẫn frontend sẽ được bổ sung khi có source chạy được.

## Phạm vi

Giao diện trong starter kit sẽ dùng dữ liệu giả lập. Backend Spring Boot Java 21, PostgreSQL và Kafka thuộc giai đoạn phát triển tiếp theo. ERM không tự sửa dữ liệu hoặc replay event trên production.
