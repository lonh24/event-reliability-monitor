# ERM — Screen Requirements

## 1. Quy tắc xuyên suốt

Đặc tả mục tiêu cho frontend React mock, **chưa có giao diện hoặc Backend runtime**. [Use Cases](02-use-cases.md) và [Demo Scenarios](03-demo-scenarios.md) là nguồn hành vi/dữ liệu; [traceability](03b-traceability.md) nối tiêu chí nghiệm thu.

- Mọi route có nhãn Demo data và thông báo dữ liệu thay đổi chỉ trong session, reset khi reload. Không có nút gọi Kafka/repair/replay production.
- Mọi hành động phải dùng mock adapter; nút/action ngoài phạm vi không hiển thị. Các field dưới đây là yêu cầu thông tin nghiệp vụ, chưa phải DTO hay API Contract đã được chốt.
- Dùng UTC và snapshot tham chiếu demo, không lấy đồng hồ máy làm thay đổi kết luận fixture. Unknown khác empty, 0 và load error; dùng chữ/nhãn trạng thái, không chỉ dựa màu.
- Shared loading/empty/error có thể tái hiện qua mock adapter ở giai đoạn triển khai: pending, danh sách rỗng, lỗi giả lập và Retry. Error không render thành zero-data thành công.
- Điều hướng sidebar tới 5 màn hình chính, row/detail có link rõ và keyboard focus. Form có label; validation hiển thị tại field; thông báo thao tác không chỉ nhờ màu. Không yêu cầu animation hoặc editor phức tạp.
- Detail không tìm thấy ID khác unknown route. Cả hai có đường về trang hợp lệ và không crash.

## SCR-01 — Overview — `/`

**Mục đích:** nhận biết vấn đề và bắt đầu điều tra.

**Dữ liệu:** Observed events, Confirmed processing, Open incidents, Unknown evaluations; volume theo bucket UTC; latest incident summary/severity/status/application/time. Định nghĩa baseline 5/3/1/4 theo demo spec; khi mở rộng fixture phải tính lại.

**Thành phần UI:** page header/snapshot label, 4 StatCards, chart, incident list, sidebar và Demo data banner.

**Hành động:** chọn latest incident để tới detail; mở Incidents/Events qua navigation. Không tạo range filter giả nếu chưa có mock method hỗ trợ.

**Loading/Empty/Error:** skeleton lúc tải; card 0 khi dataset thành công và rỗng, latest list empty độc lập; lỗi có Retry, không che bằng số 0.

**Điều hướng:** Overview → inc-001 detail → evt-003 detail → Evidence; mở trực tiếp detail từ latest incident để đạt 3–4 thao tác.

**Acceptance Criteria:**
- AC-SCR01-01: cards và chart thống nhất baseline seed; resolve inc-001 chỉ giảm open count, không sửa historical evaluations.
- AC-SCR01-02: flow đến Evidence tối đa 4 thao tác từ Overview đã mở; trạng thái và list có text label, error/empty/loading tái hiện được.

## SCR-02 — Applications — `/applications`

**Mục đích:** xem và thêm ứng dụng mẫu được theo dõi.

**Dữ liệu:** application ID, name, environment và status; mock có >=2 applications ở dataset hoàn chỉnh (tập 5 scenarios tập trung app-001).

**Thành phần UI:** table/list, Create button, form name/environment, field errors, pending/success feedback, note không kết nối service thật.

**Hành động:** mở form, nhập, submit hợp lệ, cancel; mock list và lựa chọn application filter Events cùng cập nhật.

**Loading/Empty/Error:** skeleton/table loading; chưa có app → empty với Create; lỗi tải có Retry; lỗi save giữ input và list cũ, không báo thành công.

**Điều hướng:** sidebar tới Events để lọc theo app; không bắt buộc application detail route hoặc app edit/delete ngoài scope.

**Acceptance Criteria:**
- AC-SCR02-01: trim name không rỗng, environment phải được chọn hợp lệ; cancel/invalid/save failure không thêm app; pending chống submit lặp.
- AC-SCR02-02: create chỉ đổi mock state, không thu credentials; reload reset được thông báo, app mới chưa có event không gây lỗi.

## SCR-03 — Event Explorer — `/events`

**Mục đích:** tìm event cần điều tra, phân biệt signal xử lý với rule outcome.

**Dữ liệu:** eventId logic, application, event type, occurredAt, processing signal, reported-attempt count, rule outcomes. Count dựa trên report, không gọi 0 reports là 0 actual attempts; DS-04/05 phải ghi tổng actual attempts chưa biết. Nếu hiển thị aggregate evaluation, cách gộp phải được xác định trong API Contract; ở đặc tả này có thể hiển thị các rule outcomes riêng.

**Thành phần UI:** search eventId, app/status selects, table, pagination, Clear filters; status text/badge; row link.

**Hành động:** trim/case-insensitive search, app/processing-status filter kết hợp AND, clear, page navigation; đổi điều kiện đưa về trang đầu; mở event detail.

**Loading/Empty/Error:** loading khi truy vấn mock; không match → empty với Clear filters; dataset rỗng khác filter rỗng; error/Retry giữ điều kiện, không tự kết luận event lỗi.

**Điều hướng:** row tới `/events/:id` bằng observed ID, không nhầm logical eventId; back về list. Không yêu cầu state lọc tồn tại sau reload.

**Acceptance Criteria:**
- AC-SCR03-01: search/filter/page thực sự đổi rows; không lẫn IDs hoặc bỏ điều kiện khi phân trang.
- AC-SCR03-02: DS-02 cho 2 reports/1 event, DS-04/05 thiếu reports không suy FAILED; DS-03 processing CONFIRMED có thể đi cùng VIOLATION nghiệp vụ.

## SCR-04 — Event Detail — `/events/:id`

**Mục đích:** điều tra metadata, timeline và bằng chứng của một event.

**Dữ liệu:** observed ID/eventId, app/type/correlation/order, occurredAt; attempts có report, timestamps/status/error; rule name/type/outcome/evaluatedAt/reason; evidence ID/source/time/coverage/identity/delta đã mask; linked incident nếu có. Không dùng private ground truth làm dữ liệu UI.

**Thành phần UI:** header/Back, metadata block, Attempts timeline, Evaluations list, Evidence section hoặc tab, related incident links; unknown/gap explanation.

**Hành động:** mở Evidence, đọc từng evaluation và nguồn bằng chứng, mở related incident; chỉ đọc business data.

**Loading/Empty/Error:** detail loading; attempt list rỗng ghi “Chưa có report, chưa biết tổng attempts”; thiếu evidence ghi gap, không count 0 effect; load error có Retry; ID không tồn tại → Event Not Found với link về Events.

**Điều hướng:** từ Incidents hoặc Events tới detail; inc-001 ↔ evt-003 liên kết hai chiều. Evidence không cần route riêng, section/tab phải đạt giới hạn thao tác.

**Acceptance Criteria:**
- AC-SCR04-01: đủ metadata/attempts/evaluations/evidence hoặc thông tin thiếu; link đúng event/rule/incident và evidence masked/chỉ đọc.
- AC-SCR04-02: DS-03 hiện 2 distinct effects, DS-04 3 UNKNOWN kèm gap, DS-05 hai business PASS/một TIMEOUT UNKNOWN mà không dựng timeline thành công.
- AC-SCR04-03: not-found và tải lỗi không crash, không đánh đồng error tải với business violation.

## SCR-05 — Monitoring Rules — `/rules`

**Mục đích:** đọc ý nghĩa rule và bật/tắt config mẫu.

**Dữ liệu:** ID, application, name, type (TIMEOUT/DUPLICATE_BUSINESS_EFFECT/DATA_INVARIANT), description, condition/threshold ngắn và enabled; related evaluations/incidents nếu có.

**Thành phần UI:** list/table, toggle có label, mô tả rule, status pending/error và note historical evaluations.

**Hành động:** bật/tắt qua shared mock adapter; mở liên kết event/incident liên quan. Không Create/Edit button giả; hợp đồng API để tạo rule được xác định riêng; giao diện này không yêu cầu trình chỉnh sửa nâng cao.

**Loading/Empty/Error:** skeleton, no rules empty, load Retry; save failure trả toggle về trạng thái cũ với feedback; pending khóa thao tác lặp.

**Điều hướng:** tới existing Event/Incident detail bằng ID đã có, sidebar tới màn khác; không tạo rule detail route ngoài scope.

**Acceptance Criteria:**
- AC-SCR05-01: >=3 rules ở fixture hoàn chỉnh, toggle shared state và reset khi reload; không gọi runtime rule engine.
- AC-SCR05-02: disable không xóa/recompute evaluations/resolve incidents; lý do lịch sử và evaluatedAt hiển thị rõ.

## SCR-06 — Incidents — `/incidents`

**Mục đích:** chọn hồ sơ điều tra theo mức độ và trạng thái.

**Dữ liệu:** ID, summary, severity, status, primary rule/application, openedAt; pagination từ cùng mock dataset. Không tự tạo incident từ mọi UNKNOWN.

**Thành phần UI:** status/severity filter, table, pagination, Clear filters, clickable incident summary.

**Hành động:** kết hợp filter AND, đổi page, clear, mở detail; đổi filter reset về page đầu. Không thêm bulk resolve hoặc repair.

**Loading/Empty/Error:** loading; empty do filter/no incidents có giải thích đúng, clear nếu thích hợp; load error/Retry giữ filter.

**Điều hướng:** chọn inc-001 → `/incidents/inc-001`; link Overview/sidebar.

**Acceptance Criteria:**
- AC-SCR06-01: filter/paging có hiệu lực; linked event không bị nhầm giữa logical eventId và observed ID.
- AC-SCR06-02: list phản ánh mutation status từ detail; resolve không làm incident biến mất khỏi dataset, chỉ khỏi filter OPEN/INVESTIGATING nếu đang dùng.

## SCR-07 — Incident Detail — `/incidents/:id`

**Mục đích:** xem lý do/evidence và theo dõi trạng thái hồ sơ.

**Dữ liệu:** ID, app, primary rule/type, severity/status, summary/explanation, openedAt, linked event, masked evidence, related evaluations, history trạng thái/thời điểm. DS-03 inc-001 liên kết evt-003 và rule-002.

**Thành phần UI:** header, status action, explanation/evidence, linked event, status history và note “RESOLVED không tự sửa business data”.

**Hành động:** OPEN → INVESTIGATING → RESOLVED qua mock adapter, phản hồi pending/success/error; đọc hoặc mở Event Detail. Không action OPEN → RESOLVED trực tiếp hoặc reopen trong workflow tối giản.

**Loading/Empty/Error:** loading; evidence thiếu thể hiện gap, không bịa; ID lạ → Incident Not Found; load error/Retry; invalid transition/save failure không đổi state/history; pending chống click lặp.

**Điều hướng:** từ Overview/Incidents vào detail, tới Event Detail rồi Evidence; Back về Incidents.

**Acceptance Criteria:**
- AC-SCR07-01: đúng inc-001/evt-003/evidence; transition hợp lệ cập nhật shared list/detail/Overview/history; sai transition hoặc save failure không mutation.
- AC-SCR07-02: RESOLVED vẫn giữ effects +200 và VIOLATION lịch sử, ghi rõ không tự sửa nghiệp vụ; reload reset được thông báo.

## SCR-08 — 404 — `*`

**Mục đích:** xử lý URL không thuộc các route hợp lệ.

**Dữ liệu:** thông báo không tìm thấy trang; không tải event/incident giả từ URL lạ.

**Thành phần UI:** Not Found page, link về Overview và navigation có label rõ, Demo data.

**Hành động:** về Overview hoặc một mục sidebar hợp lệ.

**Loading/Empty/Error:** không cần mock request nên không có loading/empty riêng; route sai chính là not-found state. Không dùng spinner vô hạn hoặc giả lỗi Backend.

**Điều hướng:** `/unknown-path` → 404 → `/`; `/events/missing-id` và `/incidents/missing-id` dùng detail Not Found tương ứng thay vì crash.

**Acceptance Criteria:**
- AC-SCR08-01: route sai hiển thị 404, back link hoạt động; ID sai trên detail hiện trạng thái đúng trong layout, không redirect thành dữ liệu event khác.
- AC-SCR08-02: không yêu cầu API thật/auth, không crash và không render fake data cho URL không tồn tại.

## 2. Kiểm chứng khi triển khai giao diện

Các Acceptance Criteria là điều kiện kiểm chứng khi giao diện được triển khai, không phải kết quả browser test. [Traceability](03b-traceability.md) liên kết màn hình, Use Cases, scenarios và mục tiêu sản phẩm. Dữ liệu fixture không chứng minh đã hoàn tất ingestion runtime hoặc thiết kế schema liên quan OQ-01/OQ-02.
