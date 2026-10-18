# Event Reliability Monitor (ERM)

ERM là dashboard dành cho backend developer điều tra sự kiện bất đồng bộ, các lần xử lý và bằng chứng về tác động nghiệp vụ.

Ví dụ mục tiêu: sự kiện `OrderPaid` có thể được giao lại nhiều lần, nhưng nghiệp vụ chỉ được cộng điểm loyalty một lần. Monitor dự kiến nhận processing reports và đối chiếu bằng chứng chỉ đọc; thiếu bằng chứng phải được thể hiện là `UNKNOWN`.

## Trạng thái hiện tại

Repository đang ở giai đoạn thiết kế. Các tài liệu phạm vi, yêu cầu, kiến trúc, mô hình dữ liệu, API Contract, Mock Data Specification và Architecture Decision Records đã được xây dựng. Chưa triển khai frontend, backend, Kafka hoặc PostgreSQL runtime; các thư mục ứng dụng và hạ tầng hiện vẫn là placeholder.

## Cấu trúc

| Đường dẫn | Mục đích |
|---|---|
| [docs/01-product-scope.md](docs/01-product-scope.md) | Phạm vi và mục tiêu sản phẩm |
| [docs/02-use-cases.md](docs/02-use-cases.md) | Các luồng chức năng |
| [docs/03-demo-scenarios.md](docs/03-demo-scenarios.md) | Tình huống minh họa và kết quả kỳ vọng |
| [docs/03a-screen-requirements.md](docs/03a-screen-requirements.md) | Yêu cầu giao diện |
| [docs/03b-traceability.md](docs/03b-traceability.md) | Truy vết yêu cầu |
| [docs/04-architecture.md](docs/04-architecture.md) | Kiến trúc hệ thống và các quyết định thiết kế |
| [docs/05-data-model.md](docs/05-data-model.md) | Mô hình dữ liệu PostgreSQL |
| [docs/06-api-contract.md](docs/06-api-contract.md) | REST API Contract, DTO, validation và JSON Schema |
| [docs/07-mock-data-spec.md](docs/07-mock-data-spec.md) | Đặc tả dữ liệu mẫu và hành vi mock adapter |
| [docs/08-decisions.md](docs/08-decisions.md) | Bản ghi quyết định kiến trúc (ADR) |
| [docs/environment.md](docs/environment.md) | Yêu cầu môi trường phát triển |
| [demo-service/](demo-service/README.md) | Placeholder cho ứng dụng order/loyalty và xử lý event |
| [monitor-service/](monitor-service/README.md) | Placeholder cho quan sát event, rules và incidents |
| [infrastructure/](infrastructure/README.md) | Placeholder cho cấu hình hạ tầng |

## Bắt đầu

Đọc [yêu cầu môi trường](docs/environment.md). Hiện chưa có ứng dụng hoặc lệnh khởi chạy; hướng dẫn sẽ được bổ sung khi các thành phần được triển khai.

## Phạm vi

Giao diện dự kiến sử dụng React + TypeScript + Vite, trước mắt làm việc với dữ liệu mô phỏng. Kiến trúc backend mục tiêu sử dụng Spring Boot với Java 21, Apache Kafka và PostgreSQL để xử lý, quan sát và đánh giá sự kiện bất đồng bộ. ERM không tự sửa dữ liệu hoặc replay event trên production.
