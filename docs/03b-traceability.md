# ERM — Requirement Traceability

## Nguồn và cách đọc

[Product Scope](01-product-scope.md) → [Use Cases](02-use-cases.md) → [Demo Scenarios](03-demo-scenarios.md) → [Screen Requirements](03a-screen-requirements.md) → Acceptance Criteria.

Mã AC nằm trực tiếp trong tài liệu sở hữu; bảng này tham chiếu các ID đó. Đây là liên kết yêu cầu ở mức tài liệu, không chứng nhận tính năng đã chạy. UC03-A/B/C là ba luồng của một nhóm UC, không phải actor hoặc hệ thống mới.

## Ma trận truy vết

| Product Scope | Use Case | Scenario/đầu vào nghiệm thu | Screens | Acceptance Criteria |
|---|---|---|---|---|
| §1–2, §5 Overview; SC-01, SC-05 | UC01 | DS-01…DS-05 seed; latest inc-001 | SCR-01, SCR-07, SCR-04 | AC-UC01-01, AC-UC01-02, AC-UC01-03; AC-SCR01-01, AC-SCR01-02 |
| §4 app context, §5 Applications | UC02 | app-001 của DS-01…05; create/invalid/cancel/save-error là interaction variants | SCR-02, SCR-03 | AC-UC02-01, AC-UC02-02, AC-UC02-03; AC-SCR02-01, AC-SCR02-02 |
| §3 Event, §5 Events; SC-02 | UC03-A | DS-01…05; no-match và missing ID variants | SCR-03, SCR-04 | AC-UC03A-01, AC-UC03A-02, AC-UC03A-03; AC-SCR03-01, AC-SCR03-02 |
| §3 Attempts; SC-02 | UC03-B | DS-01/02/03 có reports; DS-04/05 thiếu reports | SCR-04 | AC-UC03B-01, AC-UC03B-02, AC-UC03B-03; AC-SCR04-01, AC-SCR04-02 |
| §4 evidence/evaluation; SC-03, SC-04 | UC03-C | DS-03 VIOLATION; DS-04 UNKNOWN; DS-05 independent evidence PASS | SCR-04, SCR-07 | AC-UC03C-01, AC-UC03C-02, AC-UC03C-03; AC-SCR04-01, AC-SCR04-02, AC-SCR04-03 |
| §5 Rules; SC-04 | UC04 | rule-001/002/003 cho DS-01…05; toggle/failure variants | SCR-05, SCR-04 | AC-UC04-01, AC-UC04-02, AC-UC04-03; AC-SCR05-01, AC-SCR05-02 |
| §5 Incidents; §4 RESOLVED; SC-01, SC-04 | UC05 | DS-03 inc-001; valid/invalid transition, load/save failure variants | SCR-06, SCR-07, SCR-04 | AC-UC05-01, AC-UC05-02, AC-UC05-03; AC-SCR06-01, AC-SCR06-02, AC-SCR07-01, AC-SCR07-02 |
| §5 404; SC-05 | UC03-A/UC05 exception flows | Unknown URL/missing detail ID; không cần event fixture mới | SCR-08, SCR-04, SCR-07 | AC-UC03A-03, AC-UC05-01; AC-SCR08-01, AC-SCR08-02 |
| §6 ngoài scope; SC-05 | Tất cả UC | Mọi DS gắn mock; không Backend runtime | Tất cả SCR | AC-UC02-03, AC-UC03C-03, AC-UC04-03, AC-UC05-03; AC-SCR02-02, AC-SCR05-02, AC-SCR07-02, AC-SCR08-02 |

Không tạo thêm demo scenario cho mỗi nút. Interaction/exception variants là bước kiểm tra của UC/screen dựa trên cùng fixture hoặc chế độ lỗi/rỗng của mock adapter.

## Liên kết outcome → evidence → AC

| Scenario | Kết quả và bằng chứng đủ/thiếu | Use Cases | Screens | AC scenario |
|---|---|---|---|---|
| DS-01 | 1 report + complete ledger 1 effect → 3 PASS | UC01, UC03 | SCR-01, SCR-03, SCR-04 | AC-DS01-01, AC-DS01-02 |
| DS-02 | 2 reports nhưng complete ledger 1 effect → 3 PASS, không duplicate incident | UC03 | SCR-03, SCR-04 | AC-DS02-01, AC-DS02-02 |
| DS-03 | Report hoàn tất nhưng 2 distinct effects/total +200 → 2 VIOLATION, inc-001 | UC01, UC03, UC05 | SCR-01, SCR-04, SCR-06, SCR-07 | AC-DS03-01, AC-DS03-02 |
| DS-04 | Không report/ledger đủ dùng → 3 UNKNOWN; quá ngưỡng chỉ candidate | UC01, UC03, UC04 | SCR-01, SCR-03, SCR-04, SCR-05 | AC-DS04-01, AC-DS04-02 |
| DS-05 | Không report nhưng independent complete ledger → business rules PASS, TIMEOUT UNKNOWN | UC01, UC03, UC04 | SCR-01, SCR-03, SCR-04, SCR-05 | AC-DS05-01, AC-DS05-02 |

## Điều kiện kiểm tra tính nhất quán

- Đủ năm nhóm UC, bao phủ bảy luồng nghiệp vụ đã đặc tả; mỗi UC/luồng con có input, preconditions, main/alternative flow, postconditions và AC.
- Năm scenarios bao phủ xử lý bình thường, redelivery, duplicate effect, thiếu evidence và evidence độc lập; DS-04 có timeout candidate, DS-05 có bằng chứng độc lập đủ cho một số rules.
- Đủ năm màn chính, hai detail, 404; từng màn có mục đích/data/components/actions/states/navigation/AC. No-report khác no-attempt, no-evidence khác zero-effect.
- PASS/VIOLATION có evidence đủ phạm vi và tin cậy; UNKNOWN có lý do. Không tính toán từ hidden ground truth. CONFIRMED processing không chứng minh invariant đúng.
- Toggle config không tự tạo evaluation mới, resolve incident không sửa business data. Mutation session phải được thông báo reset.
- Cards/chart tính từ dataset, không dùng stats không truy nguyên; seed chưa thay thế yêu cầu dataset hoàn chỉnh.

## Các vấn đề kiến trúc và hợp đồng còn mở

| ID | Yêu cầu phải giải quyết | Tài liệu liên quan | Trạng thái |
|---|---|---|---|
| OQ-01 | Nguồn monitor quan sát event khi report thất lạc, identity và evidence correlation | Architecture | OPEN; fixture seed không quyết định ingestion runtime |
| OQ-02 | Demo duplicate business effect với event_id UNIQUE, bảo vệ invariant mặc định | Architecture / Data Model | OPEN; chưa đổi schema hoặc lựa chọn sandbox |
| API contract | DTO/status domains, filter/pagination, coverage/provenance representation và rule config | API Contract | Chưa chốt hợp đồng API |
| Incident grouping | Chính sách gom incident khi nhiều rules vi phạm cùng event | Architecture / API Contract | Demo chỉ seed inc-001 primary rule-002; chưa chốt engine |

Các tài liệu đặc tả hiện tại chưa chốt kiến trúc, schema hoặc API. Nguồn, thời điểm và phạm vi evidence cần được xác định trong thiết kế kỹ thuật; không được biến UNKNOWN thành FAILED khi thiếu căn cứ.
