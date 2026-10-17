# ERM — Báo cáo chặng 00: Khảo sát máy và tạo workspace

## 1. Kết luận
- Trạng thái: PASS (DoD chặng 0 trong môi trường Codex).
- Mục tiêu: khảo sát công cụ, tạo workspace độc lập và Git, ghi tiến độ rồi dừng.
- Đã đọc toàn bộ Master Prompt (357 dòng) và kế hoạch 5 ngày (458 dòng) từ hai bản đính kèm có hậu tố `(1)`/`(1)(1)`. Master Prompt điều khiển thứ tự; kế hoạch dùng đối chiếu yêu cầu. Đã tạo repo mới, tài liệu môi trường và placeholder, chưa triển khai frontend hoặc Backend.

## 2. Đã hoàn thành
| ID task | Công việc | File/đường dẫn | Bằng chứng | Trạng thái |
|---|---|---|---|---|
| 00-1 | Xác định workspace an toàn | Repo `event-reliability-monitor/` | Thư mục cha không thuộc Git; repo mới init main | TESTED |
| 00-2 | Khảo sát 5 công cụ và Git identity | docs/environment.md | Lệnh phiên bản chạy thực tế, có exit code | TESTED |
| 00-3 | Phân biệt máy Codex với laptop | docs/environment.md | Ghi rõ Java 17 và Docker DEFERRED | CREATED |
| 00-4 | Tạo tài liệu và placeholder | README.md, ba module, docs/ | Đã liệt kê cây file | CREATED |
| 00-5 | Khởi tạo Git và ignore | .gitignore, .git/ | git init và check-ignore | TESTED |
| 00-6 | Theo dõi đủ 13 chặng | docs/progress/STATUS.md | 00 PASS; 12 chặng TODO | CREATED |
| 00-7 | Kiểm tra và lưu mốc local | Git | Xem mục 5 và 8 | TESTED |

## 3. Chưa hoàn thành / chưa kiểm chứng
| Việc | Nguyên nhân | Mức độ P0/P1/P2 | Ảnh hưởng | Cách xử lý đề xuất |
|---|---|---|---|---|
| Môi trường laptop: NOT VERIFIED | Chỉ truy cập được container Codex | P2 | Không xác nhận công cụ trên Windows | Chạy 5 lệnh phiên bản trên laptop |
| Docker: DEFERRED | Không có executable, exit 127 | P2 | Không chặn frontend mock | Chuẩn bị khi làm Backend |
| Java 21: chưa có bằng chứng | Runtime hiện tại Java 17 | P2 | Chưa chạy Backend target 21 | Kiểm tra/cài đúng JDK ở giai đoạn Backend |
| npm cảnh báo http-proxy | Cấu hình môi trường có key npm cảnh báo | P2 | Lệnh phiên bản vẫn exit 0 | Xử lý nếu ảnh hưởng cài frontend ở 3A |
| GitHub: NOT CONFIGURED | Chưa xác nhận owner/name/visibility | P2 | Chưa push, chỉ có repo local | Chờ user quyết định khi cần |
| Build, browser, frontend | Ngoài chặng 0 | P2 | Chưa có UI chạy | Chỉ làm đúng chặng sau khi duyệt |

Không phát hiện lỗi P0/P1 trong phạm vi kiểm tra chặng 0.

## 4. Các file đã tạo / đã sửa
- `.gitignore`: loại dependencies, build, môi trường thật, logs và IDE; giữ `.env.example`.
- `README.md`: giới thiệu 9 dòng, hiện trạng và liên kết tài liệu.
- `docs/environment.md`: phiên bản thực tế, exit code và hạn chế môi trường.
- `docs/progress/STATUS.md`: đủ 13 chặng và cổng duyệt.
- `docs/progress/00-report.md`: báo cáo đủ 9 mục.
- `demo-service/README.md`, `monitor-service/README.md`, `infrastructure/README.md`: placeholder, không có code Backend/Compose.
Không sửa hai file nguồn; chưa tạo `frontend/` theo lựa chọn được Master Prompt cho phép.

## 5. Kiểm tra thực tế
Các thao tác dưới đây chạy bằng Codex; không đại diện kiểm tra trên laptop.

| Lệnh / thao tác | Kết quả thực tế | PASS/FAIL/NOT RUN | Bằng chứng ngắn |
|---|---|---|---|
| pwd; git rev-parse ở cha | Đúng scratch workspace; rev-parse exit 128 | PASS | Không init lồng repo |
| git --version; java -version; node -v | 2.51.1; OpenJDK 17.0.20; v24.19.0; exit 0 từng lệnh | PASS | docs/environment.md |
| npm -v | 11.9.0, exit 0; có warning http-proxy | PASS | Warning còn tồn tại |
| docker --version | Không tìm thấy lệnh, exit 127 | FAIL | Đã ghi DEFERRED, không phải blocker |
| git config --get user.name/email | Codex / codex@openai.com, exit 0 | PASS | Dùng identity sẵn có, không sửa global config |
| git init -b main | Khởi tạo repo mới, exit 0 | PASS | Repo độc lập |
| git check-ignore các đường dẫn sinh ra | 8 đường dẫn đều bị ignore | PASS | node_modules, dist, target, build, .env, .env.local, log, .idea |
| git check-ignore .env.example docs/environment.md | Không output; không ignore | PASS | Không bỏ mất file mẫu/tài liệu |
| find cây file | Chỉ tài liệu và ignore trong source | PASS | Không có frontend/Backend code |
| npm build / UI / kiểm tra laptop | Chưa thực hiện | NOT RUN | Ngoài phạm vi chặng 0 |

## 6. Giải thích cho người học
- Workspace độc lập giúp mọi thao tác Git chỉ áp dụng ERM, tránh sửa nhầm bài clothing-shop.
- Luồng hiện tại: khảo sát thư mục cha → tạo root mới → init Git → tạo tài liệu/placeholder → kiểm tra → báo cáo. Chưa có luồng xử lý event chạy thật.
- Chưa tạo frontend để chặng 3A scaffold Vite vào thư mục mới, tránh phải dọn placeholder.
- Ví dụ đầu vào `.env.local` → Git đối chiếu `.gitignore` → file không được thêm bằng `git add` thông thường; `docs/environment.md` vẫn theo dõi được. Ignore không thay thế rà soát secrets.
- Cần hiểu: repository là phạm vi Git; commit là mốc lịch sử local, chưa đồng nghĩa push; placeholder README chỉ mô tả module tương lai.

## 7. Quyết định và rủi ro
- Tạo repo con tại workspace hiện tại vì thư mục cha không thuộc repo nào và chưa có thư mục ERM; không cần chọn lại đường dẫn.
- Theo Master Prompt: hoãn frontend đến 3A dù kế hoạch gốc liệt kê thư mục ở ngày 1; không thay đổi sản phẩm cuối.
- Không cài Docker/JDK, không sửa npm config hay Git identity hệ thống.
- Giả định chưa xác minh: công cụ laptop, Vite compatibility, quyền GitHub; không dùng chúng để báo PASS.
- Xung đột UNIQUE với demo cộng điểm trùng đã được hai tài liệu đặt ra: giữ nguyên, dành quyết định thiết kế ở chặng 2A; chưa chốt schema.

## 8. Git và bảo mật
- git status: đã kiểm tra trước init và sau tạo file; xác nhận cuối ở lịch sử cập nhật dưới đây.
- Commit hash: NOT COMMITTED (chưa commit tại lúc soạn báo cáo; sẽ cập nhật sau lệnh thực tế).
- Remote/push: NOT CONFIGURED / NO. Không tạo repo GitHub hoặc đăng nhập.
- Rà soát secrets và file sinh ra: kiểm tra danh sách source, diff và pattern trước commit; không đưa file đính kèm/tokens vào repo. Kết quả kiểm tra cuối được cập nhật sau chạy lệnh.

## 9. Nghiệm thu
- [x] Workspace mới độc lập, không sửa repository cũ.
- [x] Git init hoạt động.
- [x] README, .gitignore, environment và progress tồn tại.
- [x] STATUS có 13 chặng, chỉ 00 PASS.
- [x] Docker thiếu được ghi DEFERRED minh bạch.
- [x] Có ba placeholder README; chưa triển khai chặng sau.
- Người dùng tự kiểm tra (≤5 phút): mở báo cáo, STATUS và environment; nếu cần đối chiếu laptop, chạy 5 lệnh phiên bản.
- Câu hỏi cần quyết định: không có blocker chặng 0; chờ duyệt phạm vi tiếp theo.
- Chặng tiếp theo: 1A — product scope, CHƯA ĐƯỢC LÀM.

Lịch sử cập nhật: 2026-10-17 tạo báo cáo chặng 00; dừng chờ duyệt.
