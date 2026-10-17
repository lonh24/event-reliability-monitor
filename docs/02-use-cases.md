# ERM — Use Cases

## Phạm vi và quy ước chung

Nguồn yêu cầu: [Product Scope](01-product-scope.md). Đây là đặc tả cho frontend **mock data**, chưa có frontend/Backend runtime. Mọi acceptance criterion (AC) là yêu cầu phải kiểm tra khi triển khai, chưa phải kết quả test UI.

Actor chính của mọi UC: **Backend Developer**. Bộ UC giữ năm nhóm nghiệp vụ; UC03 có ba luồng con cho Events, Attempts và Evidence. Không thêm actor vận hành Kafka hoặc công cụ repair.

- Dữ liệu đi qua mock service dùng chung; không gọi API live hoặc thu credentials thật.
- Mutation chỉ thay đổi session mock và reset khi reload; mọi trang phải ghi Demo data và thông báo giới hạn lưu trữ.
- Các trạng thái quan sát, xử lý, evaluation và incident tách biệt. Processing CONFIRMED chỉ xác nhận tín hiệu hoàn tất xử lý đã có căn cứ trong fixture, không chứng minh mọi invariant nghiệp vụ đúng.
- Mất report không suy ra FAILED/VIOLATION; evidence độc lập đủ dùng có thể kết luận riêng từng rule. Không dựng timeline attempts từ evidence ledger.
- Error là lỗi tải/thao tác mock; UNKNOWN là dữ liệu chưa đủ cho rule. Hai khái niệm này không thay thế nhau.
- Xem [demo scenarios](03-demo-scenarios.md), [screen requirements](03a-screen-requirements.md) và [traceability](03b-traceability.md).

## UC01 — Xem Overview

**Mục tiêu:** tìm vấn đề cần điều tra và phân biệt kết quả đã có với phần thiếu evidence.

**Actor:** Backend Developer.

**Preconditions:** đang mở dashboard mock; bộ fixtures có thể tải. Không cần Backend hoặc đăng nhập production.

**Trigger/Input:** mở Overview; dùng thời gian tham chiếu và phạm vi mock đã hiển thị.

**Main Flow:**
1. Mock adapter tải dataset thống nhất và hiển thị loading.
2. Overview tính các cards và event count chart từ cùng dataset/phạm vi.
3. Developer đọc latest incidents, chọn một incident.
4. Chuyển tới Incident Detail; tiếp tục sang Event Detail và Evidence.

**Alternative/Exception Flows:** không có event → card 0 và empty state; không có incident → danh sách rỗng nhưng giữ thống kê khác; mock load thất bại → error với Retry, không giả số 0 như dữ liệu thành công; số UNKNOWN khác số errors.

**Postconditions:** xem được tổng quan hoặc lỗi rõ ràng; không sửa dữ liệu nghiệp vụ.

**Acceptance Criteria:**
- AC-UC01-01: cards/biểu đồ/list dùng cùng dataset và thời gian; nhãn đếm có định nghĩa trong demo spec.
- AC-UC01-02: từ Overview đã mở → Incident Detail → Event Detail → Evidence tối đa 4 thao tác, tính cả menu/tab nếu có.
- AC-UC01-03: loading/empty/error tách biệt, Retry thử lại qua mock adapter và Demo data luôn hiển thị.

## UC02 — Xem và tạo cấu hình ứng dụng mock

**Mục tiêu:** nhận biết ứng dụng nào được theo dõi và thêm application mẫu.

**Actor:** Backend Developer.

**Preconditions:** Applications dùng cùng mock state; không cần kết nối dịch vụ thật.

**Trigger/Input:** mở Applications hoặc chọn Create; nhập name và environment. Status mặc định theo dataset; validation ở mức nghiệp vụ, chưa chốt DTO/API.

**Main Flow:**
1. Tải danh sách tên, môi trường và trạng thái applications.
2. Mở form Create, nhập name không rỗng sau trim và chọn environment hợp lệ từ danh sách mock.
3. Submit qua mock adapter; hiển thị pending, chặn submit lặp lúc đang lưu.
4. Thành công: thêm application mới với ID không trùng, cập nhật list; chưa có event cho application mới.

**Alternative/Exception Flows:** bỏ trống name/environment → lỗi tại field, không tạo; Cancel → không mutation; lỗi tải/lưu mock → thông báo và cho thử lại, không báo thành công; application mới không có event → event filter trả empty hợp lệ. Không triển khai edit/delete app hoặc thu token/connection string.

**Postconditions:** session mock có cấu hình mẫu mới khi thành công; reload reset về fixtures, không có app production được kết nối.

**Acceptance Criteria:**
- AC-UC02-01: tạo hợp lệ cập nhật shared state và lựa chọn application trong bộ lọc Events.
- AC-UC02-02: input không hợp lệ/cancel/lưu lỗi không thêm bản ghi.
- AC-UC02-03: form không có credential field; thông báo mock/reset xuất hiện; empty/error/retry có thể tái hiện.

## UC03 — Điều tra Event, Attempts và Evidence

**Mục tiêu:** tìm event, hiểu các lần xử lý có báo cáo và đọc kết luận dựa trên evidence.

**Actor:** Backend Developer.

**Preconditions:** các observed events được nạp sẵn trong mock dataset. Nguồn quan sát event khi processing report thất lạc được ghi nhận là vấn đề kiến trúc OQ-01.

**Trigger/Input:** event identity/search text; application/processing status filter; page; hoặc event ID trên route. Search theo eventId logic; route dùng ID bản ghi observed event.

### UC03-A — Tìm/lọc và mở Event

**Main Flow:** nhập search → lọc application/status kết hợp → trang đầu khi đổi filter → phân trang → chọn row để mở Event Detail.

**Alternative/Exception Flows:** không match → empty có Clear filters; không tìm thấy ID detail → Not Found có về Events; page ngoài phạm vi sau lọc → về page hợp lệ; lỗi tải → error/Retry; pending không render dữ liệu cũ như kết quả truy vấn mới.

**Postconditions:** xem đúng event, không thay fixture nghiệp vụ.

**Acceptance Criteria:**
- AC-UC03A-01: search không phân biệt hoa/thường, trim input; các filter kết hợp AND; clear phục hồi bộ kết quả; page không làm mất điều kiện lọc.
- AC-UC03A-02: bảng phân biệt eventId và observed-event ID; row/link mở đúng detail.
- AC-UC03A-03: empty/error/not-found không crash và không tự gán FAILED cho event.

### UC03-B — Xem timeline Processing Attempts

**Main Flow:** từ Event Detail mở khu vực Attempts → xem attempt number, started/finished time và reported status/error nếu có → nhận diện retry/redelivery cùng event.

**Alternative/Exception Flows:** thiếu report → ghi rõ số attempts đã ghi nhận và chưa biết tổng thực tế; không đổi giá trị chưa biết thành 0 attempts thực sự; timestamp thiếu → hiển thị chưa có dữ liệu, không bịa duration; reported error → hiển thị riêng, không tự kết luận duplicate effect.

**Postconditions:** người dùng hiểu timeline dựa trên reports đã có, không có mutation.

**Acceptance Criteria:**
- AC-UC03B-01: DS-02 hiển thị 2 reported attempts cho 1 event nhưng 1 business effect; không duplicate incident.
- AC-UC03B-02: DS-04/05 không dựng attempt thành công từ ground truth hoặc ledger; ghi rõ timeline chưa đủ.
- AC-UC03B-03: report status và rule evaluation không bị trộn; report hoàn tất vẫn có thể đi cùng business violation như DS-03.

### UC03-C — Xem Business Evidence và Rule Evaluations

**Main Flow:** chọn Evidence/evaluations → đọc rule, outcome, thời điểm đánh giá và lý do → kiểm tra nguồn/thời điểm/phạm vi/độ đầy đủ của evidence → mở linked incident khi có.

**Alternative/Exception Flows:** report mất, independent evidence đủ → rule liên quan có thể PASS/VIOLATION; không đủ → UNKNOWN và lý do cụ thể; lỗi tải evidence → error/Retry, không diễn giải là bằng chứng vi phạm; evidence đã mask, không mở credential hoặc repair action.

**Postconditions:** kết luận truy nguyên được tới evidence hoặc thiếu hụt cụ thể; không viết vào demo DB.

**Acceptance Criteria:**
- AC-UC03C-01: DS-03 cho VIOLATION nhờ 2 distinct effects cùng event và evidence đầy đủ; liên kết inc-001 ↔ evt-003.
- AC-UC03C-02: DS-04 UNKNOWN nêu rõ không có report/evidence đủ dùng; DS-05 có thể PASS duplicate/invariant nhờ independent evidence đủ tin cậy, TIMEOUT vẫn UNKNOWN nếu chưa biết thời điểm hoàn tất.
- AC-UC03C-03: evidence chỉ đọc và masked; kết quả của một rule không chứng minh các rule khác hoặc toàn bộ hệ thống đúng.

## UC04 — Xem và bật/tắt Monitoring Rules mock

**Mục tiêu:** hiểu TIMEOUT, DUPLICATE_BUSINESS_EFFECT, DATA_INVARIANT và thay đổi trạng thái enable trong demo.

**Actor:** Backend Developer.

**Preconditions:** rules liên kết application và dữ liệu demo; không có rule engine runtime.

**Trigger/Input:** mở Rules hoặc toggle rule theo ID, enabled hiện tại.

**Main Flow:** tải list → đọc mô tả/điều kiện → toggle → adapter lưu enabled trong shared session → hiển thị kết quả → mở related events/incidents.

**Alternative/Exception Flows:** rule không tồn tại → lỗi có nghĩa, không mutation; lưu lỗi → giữ trạng thái trước; đang lưu → khóa toggle lặp; application chưa có rule → empty; disable không xóa evaluations/incidents lịch sử.

**Postconditions:** cấu hình enabled đổi trong mock, không chạy đánh giá mới; lịch sử fixture vẫn giữ và có evaluatedAt. Reload reset.

**Acceptance Criteria:**
- AC-UC04-01: đủ 3 loại rule, toggle thành công được giữ khi điều hướng trong session; lỗi không đổi state.
- AC-UC04-02: thay enabled không giả tạo rule engine, không xóa/recompute evaluations hay tự resolve incidents; có giải thích “historical evaluation”.
- AC-UC04-03: không có Create/Edit rule button giả. Hợp đồng API cho quản lý rule được xác định riêng trong tài liệu API Contract; giao diện hiện tại không bao gồm trình chỉnh sửa rule nâng cao.

## UC05 — Xem và cập nhật trạng thái Incident mock

**Mục tiêu:** điều tra vấn đề có evidence và ghi trạng thái xử lý hồ sơ.

**Actor:** Backend Developer.

**Preconditions:** incident mock liên kết event, rule và evidence; không yêu cầu backend production.

**Trigger/Input:** mở list/detail; status/severity filters; chọn transition trạng thái.

**Main Flow:**
1. Lọc Incidents theo status/severity, phân trang và chọn incident.
2. Đọc explanation/evidence, mở linked Event Detail.
3. Chọn OPEN → INVESTIGATING; sau đó INVESTIGATING → RESOLVED.
4. Adapter xác thực transition, lưu trạng thái và history in-memory; list/detail/Overview cùng phản ánh.

**Alternative/Exception Flows:** OPEN → RESOLVED trực tiếp hoặc đổi ngược bị từ chối; không thấy ID → Not Found; lưu lỗi → giữ trạng thái cũ/history không thêm; filter không match → empty; action pending → chặn gửi lặp; incident đã RESOLVED chỉ đọc trong workflow tối giản.

**Postconditions:** chỉ hồ sơ incident và history mock thay đổi; effects/evaluations cũ không bị sửa, reload reset.

**Acceptance Criteria:**
- AC-UC05-01: filter status/severity kết hợp AND; link inc-001 tới evt-003/evidence đúng; IDs lạ không crash.
- AC-UC05-02: transition hợp lệ cập nhật list/detail/history và Open incidents count; transition sai/lưu lỗi giữ state.
- AC-UC05-03: RESOLVED không đồng nghĩa nghiệp vụ đã sửa; DS-03 vẫn 2 effects và historical VIOLATION sau resolve.

## Các quyết định kiến trúc chưa được xác định

OQ-01 và OQ-02 được mô tả trong [Product Scope](01-product-scope.md) và cần được giải quyết ở tài liệu Architecture và Data Model. Fixture là dữ liệu mô phỏng, không xác định nguồn ingestion runtime. Evidence về duplicate effect là yêu cầu nghiệp vụ; thiết kế phải làm rõ cách mô phỏng trường hợp vi phạm mà không tùy tiện loại bỏ ràng buộc UNIQUE của hệ thống mặc định.
