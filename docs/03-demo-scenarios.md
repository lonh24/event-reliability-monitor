# ERM — Demo Scenarios

## 1. Quy ước dataset và ranh giới

Nguồn: [Product Scope](01-product-scope.md), [Use Cases](02-use-cases.md). Tất cả ID/thời gian/dữ liệu dưới đây là **mock fixture specification**, chưa có code sinh fixture, Backend, Kafka, DB hoặc rule engine chạy thật. Đây là tập dữ liệu ví dụ gồm 5 events, chưa phải bộ dữ liệu mô phỏng đầy đủ. Bộ dữ liệu mở rộng dự kiến có ít nhất 30 events, 2 applications và 5 incidents.

Hai tình huống mất processing report được mô hình hóa riêng: DS-04 không đủ bằng chứng và có timeout candidate; DS-05 có business evidence độc lập đủ tin cậy. Sự khác biệt này cho phép kiểm tra việc kết luận rule theo mức độ đầy đủ của evidence.

- Thời gian tham chiếu cố định: `2026-10-17T10:10:00Z`, mọi event thuộc cùng cửa sổ 24h. UI cần hiển thị đây là snapshot, không dùng đồng hồ máy để fixture tự trôi sang case khác.
- Application: `app-001` (Loyalty Sandbox). Thực thể customer giả `cust-demo-001`; không dùng thông tin cá nhân thật.
- Rule `rule-001`: TIMEOUT, ngưỡng demo 60 giây từ occurredAt đến finishedAt đủ tin cậy. Thiếu finishedAt không chứng minh vi phạm; quá ngưỡng và thiếu kết quả chỉ là candidate.
- Rule `rule-002`: DUPLICATE_BUSINESS_EFFECT, vi phạm nếu có >=2 effects khác danh tính cùng event. PASS chỉ khi evidence đủ phạm vi/độ đầy đủ để kết luận không nhân đôi, không suy ra từ một truy vấn cục bộ chưa rõ coverage.
- Rule `rule-003`: DATA_INVARIANT, expected credit = 100 points cho mỗi event; đối chiếu tổng delta trong snapshot nghiệp vụ đầy đủ và liên kết đúng event/customer.
- Mỗi scenario có 3 evaluations tại snapshot, gồm outcome, reason, evaluatedAt và evidence reference. Enabled mặc định true. Toggle chỉ đổi config mock, không recompute history.
- “Actual attempts/effects” là **ground truth dành cho tác giả fixture**, chỉ để giải thích scenario. “Visible reports/evidence” mới là đầu vào được UI dùng. Không đưa ground truth bị ẩn vào statistic, timeline hoặc evaluation.
- Event nội bộ `evt-xxx` dùng route; `eventId` là danh tính logic `order-paid-100x`. Trong phạm vi app-001, mỗi eventId khác nhau; mọi attempt/effect dùng cùng eventId của scenario tương ứng.
- Observation của cả 5 events do fixture nạp sẵn. Không coi điều này là monitor runtime đã quan sát Kafka. Nguồn quan sát event khi report thất lạc là câu hỏi kiến trúc OQ-01 chưa được giải quyết.

## 2. Ma trận nhất quán

| Scenario | Observed ID / eventId / order | Actual attempts / visible reports | Actual effects / evidence đủ dùng | Processing signal hiển thị | TIMEOUT / DUPLICATE / INVARIANT | Incident |
|---|---|---|---|---|---|---|
| DS-01 | evt-001 / order-paid-1001 / ord-1001 | 1 / 1 | 1 / 1 | CONFIRMED | PASS / PASS / PASS | Không |
| DS-02 | evt-002 / order-paid-1002 / ord-1002 | 2 / 2 | 1 / 1 | CONFIRMED | PASS / PASS / PASS | Không |
| DS-03 | evt-003 / order-paid-1003 / ord-1003 | 1 / 1 | 2 / 2 | CONFIRMED (report hoàn tất) | PASS / VIOLATION / VIOLATION | inc-001, OPEN, HIGH |
| DS-04 | evt-004 / order-paid-1004 / ord-1004 | 1 / 0 | 1 / chưa biết | UNKNOWN | UNKNOWN / UNKNOWN / UNKNOWN | Không tự mở incident lỗi nghiệp vụ |
| DS-05 | evt-005 / order-paid-1005 / ord-1005 | 1 / 0 | 1 / 1 độc lập | UNKNOWN (thiếu report) | UNKNOWN / PASS / PASS | Không |

CONFIRMED ở đây là tín hiệu hoàn tất processing có report, không phải xác nhận dữ liệu nghiệp vụ đúng. Việc ledger được verified ở DS-05 không tự tạo report hoặc thay processing UNKNOWN. Enum/DTO và cơ chế hợp nhất trạng thái sẽ được xác định trong API Contract; không gộp outcome của 3 rules thành một processing status.

## DS-01 — Xử lý bình thường

**Business context:** đơn ord-1001 thanh toán, được cộng 100 điểm đúng một lần. Liên quan app-001, cust-demo-001, evt-001 / eventId order-paid-1001, ba rules chung.

**Input:** OrderPaid occurredAt `2026-10-17T10:00:00Z`, expected delta +100.

**Processing attempts:** attempt `att-001-1`, 10:00:01Z → 10:00:02Z; report hoàn tất có sẵn. Tất cả thời điểm cùng ngày 2026-10-17 UTC.

**Business effects:** `eff-001-1`, +100, eventId order-paid-1001, customer tương ứng; snapshot nghiệp vụ xác nhận đúng 1 effect.

**Evidence và nguồn:** `ev-001-report` từ processing-report fixture chứa startedAt/finishedAt; `ev-001-ledger` từ read-only business-evidence mock, danh sách đầy đủ cho event tại snapshot, source label, observedAt, event identity và delta đã mask. Đây là nhãn provenance mock, chưa chọn adapter thật.

**Expected evaluation:** cả ba rules PASS, vì hoàn tất trong 2 giây và chỉ 1 effect với tổng +100.

**Expected incident:** không có.

**Expected UI:** Overview/event list/detail hiển thị event, một reported attempt, CONFIRMED và 3 PASS; Evidence thể hiện ledger +100 và coverage, không link tới incident không tồn tại.

**Acceptance Criteria:**
- AC-DS01-01: 1 event, 1 report, 1 effect, total credit +100; mọi ID/time khớp và hoàn tất <=60 giây.
- AC-DS01-02: 3 evaluations truy được tới evidence; không incident; không dùng Kafka lag để chứng minh PASS.

## DS-02 — Redelivery nhưng business effect không lặp

**Business context:** ord-1002 đã thanh toán; consumer crash sau ghi nghiệp vụ, Kafka giao lại event. Một eventId order-paid-1002, observed ID evt-002, app/customer chung.

**Input:** OrderPaid occurredAt `2026-10-17T10:01:00Z`, expected +100; redelivery cùng danh tính, không tạo event logic mới.

**Processing attempts:** `att-002-1`, 10:01:01Z → 10:01:02Z, report lỗi sau bước ghi business effect; `att-002-2`, 10:01:10Z → 10:01:11Z, report hoàn tất và không ghi lại effect. Hai reports đều có trong fixture. Không chốt transaction/offset/constraint implementation ở 1B.

**Business effects:** chỉ `eff-002-1` +100 cho order-paid-1002; retry không có effect thứ hai.

**Evidence và nguồn:** `ev-002-reports` từ report fixtures cho hai attempts; `ev-002-ledger` từ complete read-only business-evidence mock snapshot xác nhận đúng 1 effect, total +100. Report lỗi lần đầu không phủ định evidence nghiệp vụ đã ghi.

**Expected evaluation:** TIMEOUT PASS với hoàn tất đáng tin ở lần hai trong 11 giây; DUPLICATE PASS, INVARIANT PASS nhờ ledger đầy đủ.

**Expected incident:** không duplicate incident; fixture cũng không tự tạo incident chỉ từ lỗi attempt đầu khi lần sau đã hoàn tất, rule/evidence không vi phạm.

**Expected UI:** cùng event có 2 reported attempts; timeline giữ lỗi lần đầu, hoàn tất lần hai; processing signal CONFIRMED; 1 effect và 3 PASS, không đánh dấu FAILED toàn event từ attempt lỗi trước đó.

**Acceptance Criteria:**
- AC-DS02-01: hai attempts gắn evt-002/eventId order-paid-1002; số event vẫn 1 và tổng effect +100.
- AC-DS02-02: không duplicate incident; lỗi attempt đầu và processing/evaluation cuối vẫn phân biệt rõ.

## DS-03 — Duplicate effect có evidence chứng minh

**Business context:** lỗi cố ý ở sandbox cho ord-1003 dẫn đến cộng điểm hai lần. Đây là fixture lỗi để điều tra, không mô tả production schema cho phép ghi trùng.

**Input:** một OrderPaid lúc `2026-10-17T10:02:00Z`, expected +100; evt-003/eventId order-paid-1003, app/customer chung.

**Processing attempts:** `att-003-1`, 10:02:01Z → 10:02:02Z; một report hoàn tất. Một attempt vẫn có thể tạo hai effects do bug.

**Business effects:** `eff-003-1` +100 và `eff-003-2` +100 cùng eventId/customer, hai effect IDs khác nhau, total +200.

**Evidence và nguồn:** `ev-003-report` từ processing-report fixture; `ev-003-ledger` là sandbox business-evidence fixture gồm hai effect identities, cùng eventId/customer, snapshot đầy đủ và timestamp 10:10:00Z. Độ tin cậy/coverage được giả lập rõ; không dùng hai reports làm evidence cộng điểm trùng.

**Expected evaluation:** TIMEOUT PASS (2 giây); DUPLICATE VIOLATION (2 distinct effects cùng event); INVARIANT VIOLATION (+200 khác expected +100).

**Expected incident:** `inc-001`, application app-001, linked observed event evt-003, primary rule rule-002, severity HIGH, status OPEN; openedAt `2026-10-17T10:10:00Z`. Rule-003 evaluation được đọc trên event; chưa tạo incident thứ hai khi chưa xác định chính sách gom incidents. Chính sách này cần được xác định trong tài liệu Architecture và API Contract.

**Expected UI:** Overview latest incidents → inc-001 → evt-003 → ev-003-ledger; trình bày rõ report hoàn tất nhưng business evaluations vi phạm. Sau OPEN → INVESTIGATING → RESOLVED, ledger vẫn +200 và evaluations lịch sử vẫn VIOLATION.

**Acceptance Criteria:**
- AC-DS03-01: evt-003 ↔ inc-001 ↔ rule-002 ↔ ev-003-ledger liên kết được; hai effect IDs khác nhau, cùng eventId; không suy từ attempt count.
- AC-DS03-02: RESOLVED chỉ đổi incident/history mock, không sửa effects, không tự đổi VIOLATION thành PASS.

**Ràng buộc OQ-02:** `loyalty_entries.event_id UNIQUE` xung đột với hai entries cùng event trong cùng bảng/cấu hình. Fixture này mô tả bằng chứng lỗi, chưa quyết định dùng bảng nào hoặc nguồn sandbox nào, không bỏ UNIQUE hoặc coi schema đã giải quyết.

## DS-04 — Report thất lạc, evidence chưa đủ; timeout candidate

**Business context:** ord-1004; tác giả fixture biết consumer đã cộng điểm nhưng report mất, monitor chưa có evidence độc lập đủ dùng. UI không được dùng tri thức tác giả để kết luận.

**Input:** event evt-004/eventId order-paid-1004, occurredAt `2026-10-17T10:03:00Z`, expected +100, được nạp vào observed-event fixture; snapshot sau 420 giây.

**Processing attempts:** ground truth `att-004-1` 10:03:01Z → 10:03:02Z, thành công; **0 reports nhìn thấy**. Không tạo attempt record giả trong UI. Tổng attempt count thực tế hiển thị chưa biết; số reports đã ghi nhận có thể hiển thị 0 với nhãn đúng.

**Business effects:** ground truth `eff-004-1` +100; monitor/UI không có ledger snapshot đáng tin, effect count/tổng credit hiển thị “Chưa đủ bằng chứng”, không hiển thị 0 hay +100 như đã verified.

**Evidence và nguồn:** `ev-004-missing` là fixture mô tả evidence gap: processing report không có, independent ledger snapshot chưa có; chỉ có event metadata từ mock observation seed. Không có nguồn runtime đã chọn, OQ-01 còn mở.

**Expected evaluation:** TIMEOUT UNKNOWN vì chưa biết finishedAt; event đã quá 60 giây là timeout candidate. DUPLICATE và INVARIANT UNKNOWN vì thiếu phạm vi business evidence. UNKNOWN nêu lý do từng rule, không phải error HTTP/UI.

**Expected incident:** không tự mở incident xác nhận lỗi nghiệp vụ từ thiếu tín hiệu. Candidate thể hiện trên event; chính sách escalation cần được xác định trong thiết kế monitoring.

**Expected UI:** processing UNKNOWN; timeline thiếu reports; hiển thị elapsed 420 giây/candidate, không dùng elapsed làm bằng chứng timeout VIOLATION; evidence gaps được đọc rõ và không lộ ground truth thành công.

**Acceptance Criteria:**
- AC-DS04-01: không có CONFIRMED/FAILED/VIOLATION do thiếu report; đủ 3 UNKNOWN với evidence gaps rõ.
- AC-DS04-02: không cho effect count 0 hoặc 1 khi chưa có evidence; thông tin actual attempt/effect không xuất hiện trong view/overview calculations.

## DS-05 — Report thất lạc, evidence độc lập đủ cho rule

**Business context:** ord-1005; report mất như DS-04 nhưng monitor có complete independent ledger evidence cho event; không có bằng chứng finishedAt của attempt.

**Input:** evt-005/eventId order-paid-1005, occurredAt `2026-10-17T10:04:00Z`, expected +100; mock observation seed, không lựa chọn nguồn ingestion thật.

**Processing attempts:** ground truth `att-005-1` 10:04:01Z → 10:04:02Z, thành công; 0 visible reports, timeline/tổng attempts thực tế chưa biết.

**Business effects:** `eff-005-1` +100; independent snapshot tại 10:10:00Z đủ coverage xác nhận đúng 1 effect cho order-paid-1005/cust-demo-001.

**Evidence và nguồn:** `ev-005-ledger`, nguồn independent read-only business-evidence mock, tách processing-report fixture; chứa event identity, effect ID, delta, customer, source label, observedAt và độ đầy đủ phạm vi truy vấn. Timestamp snapshot không phải finishedAt consumer. Nguồn thu thập evidence và quan sát event trong runtime vẫn là quyết định kiến trúc chưa chốt.

**Expected evaluation:** DUPLICATE PASS, INVARIANT PASS nhờ evidence đầy đủ. TIMEOUT UNKNOWN vì ledger snapshot chưa chứng minh thời điểm attempt hoàn tất; không mượn ground truth 2 giây để PASS TIMEOUT. Processing signal vẫn UNKNOWN, không fabricate report.

**Expected incident:** không có duplicate/invariant incident; không tự mở incident lỗi nghiệp vụ vì report thiếu.

**Expected UI:** business evidence verified cho hai rules, timeline thiếu reports; hiển thị riêng hai PASS và một UNKNOWN với lý do. Snapshot time không bị gọi là processing finish time.

**Acceptance Criteria:**
- AC-DS05-01: mất report không ép cả ba rules UNKNOWN; hai PASS truy được tới ev-005-ledger đủ tin cậy/coverage.
- AC-DS05-02: vẫn UNKNOWN TIMEOUT và processing signal, không bịa attempt count/timeline từ ledger.

## 3. Tổng hợp hiển thị và mutation mock

Chỉ cho tập hạt giống 5 events trên, 3 rules/event, snapshot cố định:

| Card/chỉ số | Định nghĩa | Giá trị baseline |
|---|---|---|
| Observed events | Số observed-event records trong dataset và cửa sổ | 5 |
| Confirmed processing | Số event có processing signal CONFIRMED, không phải số business PASS | 3 (DS-01/02/03) |
| Open incidents | Số incident status OPEN hoặc INVESTIGATING | 1 (inc-001) |
| Unknown evaluations | Đếm evaluations outcome UNKNOWN, không đếm events | 4 (DS-04: 3; DS-05: 1) |
| Rule evaluations | Tổng số outcomes | 15 = 9 PASS + 2 VIOLATION + 4 UNKNOWN |

Event count chart: bucket UTC 10:00–10:59 có 5 events, không đếm theo 6 attempts actual hay 4 reports visible. Khi mở rộng >=30 events sau này, tính lại tất cả cards/charts từ fixtures thực tế, không giữ cứng các số của tập hạt giống.

Đổi inc-001 sang INVESTIGATING: Open incidents vẫn 1; sang RESOLVED: 0; evaluations và effects không đổi. Toggle rule không tính lại historical outcomes. Tạo app mới không phát sinh event tự động. Reload reset mọi mutation session; baseline thống kê phục hồi. Lỗi load/save mock không làm phát sinh business violation hoặc mutation thành công.

## 4. Các vấn đề kiến trúc và hợp đồng chưa chốt

- OQ-01: nguồn runtime để monitor có observed event khi report mất; fixtures không phải lời giải kiến trúc.
- OQ-02: chứng minh duplicate trong sandbox mà vẫn bảo vệ UNIQUE mặc định; chưa chọn cấu trúc DB/nguồn sandbox.
- Contract DTO, aggregate status, rule configuration và chính sách incident grouping cần được xác định trong Architecture/API Contract; các kịch bản này không chứng minh Backend đã triển khai.
