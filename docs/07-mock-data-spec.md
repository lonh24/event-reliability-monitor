# ERM — Mock Data Specification

## 1. Phạm vi và nguồn dữ liệu

Đặc tả bộ dữ liệu và hành vi **dự kiến** cho mock adapter dùng cùng [API Contract](06-api-contract.md). Chưa có React adapter hoặc runtime fixtures. Các records chỉ mô phỏng thông tin Monitor quan sát được; không chứng minh Kafka/DB ingestion đã hoạt động. [Năm scenarios](03-demo-scenarios.md), [Architecture](04-architecture.md) và [Data Model](05-data-model.md) giữ nguyên ý nghĩa và identifiers.

Dataset version `erm-mock-v1`, fixed seed **20261017**, reference snapshot **2026-10-17T10:10:00Z**. Semantic records lấy từ các bảng/ID/time rules dưới đây, không dùng RNG. Seed định danh lần sinh dataset; nếu bổ sung cosmetic data có thể dùng PRNG cùng seed, nhưng không được đổi profile/outcome/identity theo random. Không dùng Date.now(), Math.random(), đồng hồ máy hoặc locale mặc định để quyết định nghiệp vụ.

Hai phạm vi phải phân biệt:

- **Core scenario subset:** evt-001..evt-005, app-001 và rule-001..003; 5 events, 3 confirmed, 1 open incident; 15 latest evaluations =9 PASS+2 VIOLATION+4 UNKNOWN.
- **Extended default dataset:** đúng 30 OBSERVED events, 2 applications, 6 rules, 5 incidents. Có 90 latest evaluations và 3 prior revisions riêng của evt-010. Các tổng thống kê khác core subset và phải tính từ dữ liệu.

Snapshot ban đầu là mặc định khi reload. Các CRUD/config/status mutations chỉ ở session state dùng chung, không đụng business effects/evaluation history. Các response phải tuân schemas, enum và decimal strings trong API Contract.

## 2. Application và rule catalogue

| ID | Name | Environment | Status | createdAt |
|---|---|---|---|---|
| app-001 | Loyalty Sandbox | SANDBOX | ACTIVE | 2026-10-15T00:00:00Z |
| app-002 | Loyalty Sandbox B | SANDBOX | ACTIVE | 2026-10-15T00:01:00Z |

Hai app dùng cùng nghiệp vụ OrderPaid/credit +100 nhưng namespaces độc lập; không bắt buộc hai Backend runtime để trình diễn frontend. Backend triển khai Loyalty app-001 trước, app-002 vẫn có thể là mock configuration. Tạo thêm app qua mock không tự tạo events, rule instances hoặc subscription/evidence connections.

| Rule ID | Application | Type | Name | Config |
|---|---|---|---|---|
| rule-001 | app-001 | TIMEOUT | Processing within 60 seconds | thresholdSeconds=60, completionBasis=FIRST_TRUSTED_SUCCESS |
| rule-002 | app-001 | DUPLICATE_BUSINESS_EFFECT | No duplicate business effects | maxEffects=1, sourcePolicy=EVENT_BOUND_SOURCE |
| rule-003 | app-001 | DATA_INVARIANT | Loyalty total matches order expectation | expectedSource=ORDER_EXPECTATION, comparison=TOTAL_DELTA_EQUALS_EXPECTED |
| rule-004 | app-002 | TIMEOUT | Processing within 60 seconds | Như rule-001 |
| rule-005 | app-002 | DUPLICATE_BUSINESS_EFFECT | No duplicate business effects | Như rule-002 |
| rule-006 | app-002 | DATA_INVARIANT | Loyalty total matches order expectation | Như rule-003 |

Tất cả enabled=true, configVersion=`"1"`, updatedAt=application.createdAt khi reset. Rules cùng app/type không bị áp UNIQUE(app,type); createRule thêm instance mới hợp lệ, không backfill hoặc sinh UNKNOWN rows cho historical events. Description ghi ngắn điều kiện rule, không lưu SQL/script.

## 3. Event matrix, profiles và quan hệ

### 3.1. Core và extended event records

Mọi eventType=ORDER_PAID; observationStatus=OBSERVED; correlationId=orderId. Customer reference app-001 là cust-demo-001, app-002 là cust-demo-002. Expected points=`"100"`. Cột outcomes theo thứ tự TIMEOUT / DUPLICATE / INVARIANT của đúng app. Effects là **visible exact count khi đủ căn cứ**; dấu `?` nghĩa chưa đủ evidence, không là 0.

| ID / logical eventId / orderId | App | occurredAt UTC | Profile | Processing | T / D / I | Reported attempts / reports | Exact effects | Incident |
|---|---|---|---|---|---|---|---|---|
| evt-001 / order-paid-1001 / ord-1001 | app-001 | 2026-10-17T10:00:00Z | NORMAL | CONFIRMED | PASS / PASS / PASS | 1 / 1 | 1 | — |
| evt-002 / order-paid-1002 / ord-1002 | app-001 | 2026-10-17T10:01:00Z | REDELIVERY | CONFIRMED | PASS / PASS / PASS | 2 / 2 | 1 | — |
| evt-003 / order-paid-1003 / ord-1003 | app-001 | 2026-10-17T10:02:00Z | DUPLICATE | CONFIRMED | PASS / VIOLATION / VIOLATION | 1 / 1 | 2 | inc-001 |
| evt-004 / order-paid-1004 / ord-1004 | app-001 | 2026-10-17T10:03:00Z | REPORT_LOST_GAP | UNKNOWN | UNKNOWN / UNKNOWN / UNKNOWN | 0 / 0 | ? | — |
| evt-005 / order-paid-1005 / ord-1005 | app-001 | 2026-10-17T10:04:00Z | REPORT_LOST_VERIFIED | UNKNOWN | UNKNOWN / PASS / PASS | 0 / 0 | 1 | — |
| evt-006 / order-paid-1006 / ord-1006 | app-001 | 2026-10-17T09:00:00Z | DUPLICATE | CONFIRMED | PASS / VIOLATION / VIOLATION | 1 / 1 | 2 | inc-002 |
| evt-007 / order-paid-1007 / ord-1007 | app-001 | 2026-10-17T09:01:00Z | SLOW | CONFIRMED | VIOLATION / PASS / PASS | 1 / 1 | 1 | inc-003 |
| evt-008 / order-paid-1008 / ord-1008 | app-001 | 2026-10-17T09:02:00Z | STARTED_ONLY | PENDING | UNKNOWN / UNKNOWN / UNKNOWN | 1 / 1 | ? | — |
| evt-009 / order-paid-1009 / ord-1009 | app-001 | 2026-10-17T09:03:00Z | FAILED_ONLY | FAILED | UNKNOWN / UNKNOWN / UNKNOWN | 1 / 1 | ? | — |
| evt-010 / order-paid-1010 / ord-1010 | app-001 | 2026-10-17T09:04:00Z | TERMINAL_CONFLICT | UNKNOWN | UNKNOWN / PASS / PASS | 1 / 2 | 1 | — |
| evt-011 / order-paid-1011 / ord-1011 | app-001 | 2026-10-17T09:05:00Z | REPORT_LOST_VERIFIED | UNKNOWN | UNKNOWN / PASS / PASS | 0 / 0 | 1 | — |
| evt-012 / order-paid-1012 / ord-1012 | app-001 | 2026-10-17T09:06:00Z | REPORT_LOST_GAP | UNKNOWN | UNKNOWN / UNKNOWN / UNKNOWN | 0 / 0 | ? | — |
| evt-013 / order-paid-1013 / ord-1013 | app-001 | 2026-10-17T09:07:00Z | NORMAL | CONFIRMED | PASS / PASS / PASS | 1 / 1 | 1 | — |
| evt-014 / order-paid-1014 / ord-1014 | app-001 | 2026-10-17T09:08:00Z | NORMAL | CONFIRMED | PASS / PASS / PASS | 1 / 1 | 1 | — |
| evt-015 / order-paid-1015 / ord-1015 | app-001 | 2026-10-17T09:09:00Z | NORMAL | CONFIRMED | PASS / PASS / PASS | 1 / 1 | 1 | — |
| evt-016 / order-paid-1016 / ord-1016 | app-002 | 2026-10-16T18:00:00Z | DUPLICATE | CONFIRMED | PASS / VIOLATION / VIOLATION | 1 / 1 | 2 | inc-004 |
| evt-017 / order-paid-1017 / ord-1017 | app-002 | 2026-10-16T18:01:00Z | SLOW | CONFIRMED | VIOLATION / PASS / PASS | 1 / 1 | 1 | inc-005 |
| evt-018 / order-paid-1018 / ord-1018 | app-002 | 2026-10-16T18:02:00Z | STARTED_ONLY | PENDING | UNKNOWN / UNKNOWN / UNKNOWN | 1 / 1 | ? | — |
| evt-019 / order-paid-1019 / ord-1019 | app-002 | 2026-10-16T18:03:00Z | FAILED_ONLY | FAILED | UNKNOWN / UNKNOWN / UNKNOWN | 1 / 1 | ? | — |
| evt-020 / order-paid-1020 / ord-1020 | app-002 | 2026-10-16T18:04:00Z | TERMINAL_CONFLICT | UNKNOWN | UNKNOWN / PASS / PASS | 1 / 2 | 1 | — |
| evt-021 / order-paid-1021 / ord-1021 | app-002 | 2026-10-16T18:05:00Z | REPORT_LOST_VERIFIED | UNKNOWN | UNKNOWN / PASS / PASS | 0 / 0 | 1 | — |
| evt-022 / order-paid-1022 / ord-1022 | app-002 | 2026-10-16T18:06:00Z | REPORT_LOST_GAP | UNKNOWN | UNKNOWN / UNKNOWN / UNKNOWN | 0 / 0 | ? | — |
| evt-023 / order-paid-1023 / ord-1023 | app-002 | 2026-10-16T18:07:00Z | NORMAL | CONFIRMED | PASS / PASS / PASS | 1 / 1 | 1 | — |
| evt-024 / order-paid-1024 / ord-1024 | app-002 | 2026-10-16T18:08:00Z | NORMAL | CONFIRMED | PASS / PASS / PASS | 1 / 1 | 1 | — |
| evt-025 / order-paid-1025 / ord-1025 | app-002 | 2026-10-16T18:09:00Z | NORMAL | CONFIRMED | PASS / PASS / PASS | 1 / 1 | 1 | — |
| evt-026 / order-paid-1026 / ord-1026 | app-002 | 2026-10-16T18:10:00Z | NORMAL | CONFIRMED | PASS / PASS / PASS | 1 / 1 | 1 | — |
| evt-027 / order-paid-1027 / ord-1027 | app-002 | 2026-10-16T18:11:00Z | NORMAL | CONFIRMED | PASS / PASS / PASS | 1 / 1 | 1 | — |
| evt-028 / order-paid-1028 / ord-1028 | app-002 | 2026-10-16T18:12:00Z | NORMAL | CONFIRMED | PASS / PASS / PASS | 1 / 1 | 1 | — |
| evt-029 / order-paid-1029 / ord-1029 | app-002 | 2026-10-16T18:13:00Z | NORMAL | CONFIRMED | PASS / PASS / PASS | 1 / 1 | 1 | — |
| evt-030 / order-paid-1030 / ord-1030 | app-002 | 2026-10-16T18:14:00Z | NORMAL | CONFIRMED | PASS / PASS / PASS | 1 / 1 | 1 | — |

### 3.2. Profile definitions

| Profile | Reports / attempts nhìn thấy | Evidence hiển thị | Processing | TIMEOUT / DUPLICATE / INVARIANT |
|---|---|---|---|---|
| NORMAL | Một SUCCEEDED report, một attempt | Normal COMPLETE/TRUSTED/FINAL ledger +100 | CONFIRMED | PASS/PASS/PASS |
| REDELIVERY | FAILED sau DB commit ở attempt 1, SUCCEEDED ở attempt 2 | Một normal effect +100; hai report identities | CONFIRMED | PASS/PASS/PASS |
| DUPLICATE | Một SUCCEEDED report/một attempt | Faulty run SEALED, hai effects +100, total +200 | CONFIRMED | PASS/VIOLATION/VIOLATION |
| SLOW | Một SUCCEEDED report/một attempt, hoàn tất sau 90 giây | Một normal effect +100 | CONFIRMED | VIOLATION/PASS/PASS |
| STARTED_ONLY | Một STARTED report, chưa terminal | Normal source chưa FINAL; gap NOT_FINAL, exact effect count unknown | PENDING | UNKNOWN/UNKNOWN/UNKNOWN |
| FAILED_ONLY | Một FAILED report, transaction chưa có final marker | Gap NOT_FINAL; chưa có whole-scope final proof | FAILED theo report | UNKNOWN/UNKNOWN/UNKNOWN |
| TERMINAL_CONFLICT | Cùng một attempt có hai terminal reports SUCCEEDED và FAILED | Conflict evidence + independent normal COMPLETE/FINAL ledger +100 | UNKNOWN | UNKNOWN/PASS/PASS |
| REPORT_LOST_VERIFIED | Không Monitor report/attempt rows | Independent normal COMPLETE/FINAL ledger +100 | UNKNOWN | UNKNOWN/PASS/PASS |
| REPORT_LOST_GAP | Không Monitor report/attempt rows | Evidence gap, không có ledger snapshot đủ dùng | UNKNOWN | UNKNOWN/UNKNOWN/UNKNOWN |

Không lấy FAILED_ONLY để kết luận không có effect, hoặc lấy STARTED_ONLY làm actual attempt đã kết thúc. Với terminal conflict, giữ hai report DTOs và hasTerminalConflict/hasReportConflict; không giấu FAILED vì có SUCCEEDED. REDELIVERY là hai producerAttemptIds khác nhau nên không conflict. Ledger rules ở TERMINAL_CONFLICT độc lập với report conflict.

### 3.3. Deterministic IDs và timestamps

Gọi `nnn` là observed numeric suffix, `n` là số integer của event:

- Observed ID `evt-nnn`; logical eventId `order-paid-(1000+n)`; orderId `ord-(1000+n)`. ID route không thay logical identity. Danh sách IDs chính xác đã nằm trong matrix.
- App-001 events 001..015; app-002 events 016..030. evt-001..005 occurredAt lần lượt 10:00..10:04 UTC ngày 17/10. evt-006..015 lần lượt 09:00..09:09 UTC cùng ngày. evt-016..030 lần lượt 18:00..18:14 UTC ngày 16/10. Tất cả thuộc cửa sổ default 24h.
- Attempt IDs `att-nnn-k`; producerAttemptId `producer-att-nnn-k`. NORMAL/DUPLICATE/SLOW/STARTED_ONLY/FAILED_ONLY/CONFLICT dùng k=1. REDELIVERY evt-002 có att-002-1 và att-002-2. Không sinh att-004-1/att-005-1 trong Monitor data dù tác giả biết ground truth.
- Report record IDs `rpt-nnn-k` và producerReportId `producer-rpt-nnn-k`; k đánh số report, không phải luôn attempt ordinal. TERMINAL_CONFLICT evt-010/020 dùng hai reports k=1,2 cùng att-nnn-1. Hai report IDs khác nhau, không phải replay một ID bị sửa payload.
- Terminal NORMAL/DUPLICATE: startedAt=t+1s, finishedAt=t+2s, reportedAt=t+2s, receivedAt=t+3s. SLOW: startedAt=t+1s, finishedAt=t+90s, reportedAt=t+90s, receivedAt=t+91s. STARTED_ONLY: startedAt=t+1s, finishedAt=null, reportedAt=t+1s, receivedAt=t+2s. FAILED_ONLY: startedAt=t+1s, finishedAt=t+2s, errorCode=DB_TRANSACTION_FAILED; receivedAt=t+3s.
- REDELIVERY giữ nguyên DS-02: attempt 1 10:01:01→10:01:02, FAILED/errorCode=POST_COMMIT_FAILURE; attempt 2 10:01:10→10:01:11, SUCCEEDED; receivedAt mỗi report =finishedAt+1s. Ledger chỉ eff-002-1.
- TERMINAL_CONFLICT: report 1 SUCCEEDED, startedAt=t+1s/finishedAt=t+2s, receivedAt=t+3s; report 2 FAILED với cùng start/finish, reportedAt=t+3s/receivedAt=t+4s, errorCode=CONTRADICTORY_TERMINAL_REPORT. Hai terminal statuses trái nhau, attempt projection status CONFLICTED, finishedAt=null vì không có successful completion được chấp nhận không mâu thuẫn.
- firstSeenAt=t+1s từ observation; không là chứng cứ attempt. Core ledger/report evidence IDs giữ ev-001-report, ev-001-ledger, ev-002-reports, ev-002-ledger, ev-003-report, ev-003-ledger, ev-004-missing, ev-005-ledger. Với n≥6 dùng ev-nnn-report (report batch), ev-nnn-ledger hoặc ev-nnn-missing; conflict thêm ev-nnn-conflict. ReportIds là exact Monitor report IDs đã liệt kê.
- NORMAL/REDELIVERY/SLOW/REPORT_LOST_VERIFIED/CONFLICT có effect eff-nnn-1 và sourceKey=loyalty-normal-v1. DUPLICATE có eff-nnn-1/eff-nnn-2, sourceKey=loyalty-fault-v1, runId=`run-ds03` riêng evt-003; các duplicate khác dùng `run-nnn`. Mọi visible delta=`"100"`, effect.createdAt=t+2s, trừ SLOW là t+90s. Effects không FK sang Monitor tables; snapshot giữ source/event/customer/run để correlation.
- REPORT_BATCH sourceKey=processing-report, coverage COMPLETE **cho các report IDs của batch**, không có nghĩa đủ actual attempts; trust TRUSTED, finality UNKNOWN. LEDGER snapshot normal/fault COMPLETE/TRUSTED/FINAL, ledger.effects chứa chính xác các visible effects; fault label bắt buộc Sandbox injected faulty ledger. GAP có coverage NONE, trust UNTRUSTED, finality UNKNOWN, ledger=null; missingFields nêu snapshot/completion còn thiếu, không ledger effects=[] giả complete.
- snapshotAt/collectedAt/evaluatedAt mặc định là reference snapshot cho latest business assessments; report evidence snapshotAt là producer report time cuối của batch, collectedAt là receipt cuối. Với bốn incident events 006/007/016/017, ledger snapshotAt/collectedAt/evaluatedAt dùng openedAt ở §3.5, bảo đảm report đã tới và business proof tồn tại trước/cùng lúc mở case. Core evt-003 giữ 10:10 như DS-03.

Số attempts/reports và fixture IDs xác định từ bảng, không đếm theo vị trí render. AttemptNo có thể là k cho dữ liệu có ordinal rõ; conflict hai reports cùng attemptNo=1; missing ordinal dùng null. Không có timestamp hoặc report giả để làm đầy timeline.

### 3.4. Evaluation history và gaps

Mỗi event có ba latest rule evaluations. ID `eval-nnn-rrr-g1`, trong đó rrr là suffix rule thật (001..006). Config snapshot copy đúng rule configVersion `"1"`. Generation=`"1"` cho seed và các events khác, riêng evt-010 latest generation=`"2"` và evaluatedGeneration=`"2"`. Mock khởi tạo assessment snapshots nguyên khối; các generation labels này không giả lập số transaction ingestion thực tế từng report/Kafka record.

evt-010 có thêm ba prior evaluations `eval-010-001-g1`, `eval-010-002-g1`, `eval-010-003-g1` với PASS/PASS/PASS, evaluatedAt=t+3s, dùng ev-010-reports-g1 chỉ chứa report SUCCEEDED và ledger snapshot hợp lệ ev-010-ledger-g1. Khi report FAILED tới tại t+4s, append conflict evidence/new snapshots; latest generation 2 đánh giá tại reference snapshot với UNKNOWN/PASS/PASS. Giữ ba rows cũ isLatest=false; row mới isLatest=true. Mỗi evidence snapshot prior có collectedAt≤prior evaluatedAt; ledger-g1 snapshot t+3s. Không sửa prior PASS thành UNKNOWN tại chỗ.

Reason/evidence mapping:

| Evaluation condition | reasonCode | Evidence references |
|---|---|---|
| TIMEOUT PASS | COMPLETED_WITHIN_THRESHOLD | Report batch có trusted non-conflicting success |
| TIMEOUT VIOLATION | COMPLETED_AFTER_THRESHOLD | Report batch có successful finish ở t+90s |
| TIMEOUT UNKNOWN do thiếu report | SUCCESSFUL_COMPLETION_MISSING hoặc TIMEOUT_CANDIDATE | Gap row nếu thiếu nguồn; có thể ledger row giải thích không có finishedAt |
| TIMEOUT UNKNOWN do conflict | CONFLICTING_TERMINAL_REPORTS | ev-nnn-conflict + report batch |
| Business rule UNKNOWN | EVIDENCE_UNAVAILABLE hoặc SOURCE_NOT_FINAL | ev-nnn-missing, ledger=null hoặc incomplete gap |
| DUPLICATE PASS | NO_DUPLICATE_IN_FINAL_SCOPE | COMPLETE/TRUSTED/FINAL ledger |
| DUPLICATE VIOLATION | DUPLICATE_EFFECTS_PROVEN | Hai distinct effect IDs cùng event/source/run |
| INVARIANT PASS | EXPECTED_TOTAL_MATCHES | Ledger + independent order expectation trong snapshot |
| INVARIANT VIOLATION | TOTAL_DELTA_MISMATCH | Ledger +200 đối chiếu expected +100 |

Core evt-004 TIMEOUT reasonCode=TIMEOUT_CANDIDATE, reason nêu elapsed 420 giây tại reference snapshot, threshold 60 và thiếu successfulFinishedAt. Hai business UNKNOWN dùng EVIDENCE_UNAVAILABLE cùng ev-004-missing. evt-005 TIMEOUT dùng SUCCESSFUL_COMPLETION_MISSING, tham chiếu ev-005-ledger và reason rõ snapshot không là finish time; hai business PASS dùng cùng ledger. UNKNOWN không cần HTTP error hoặc fabricate report.

### 3.5. Incident catalogue

| Incident | Event | Primary rule | Severity | Status | openedAt UTC | Version | VIOLATION links / history rows |
|---|---|---|---|---|---|---|---|
| inc-001 | evt-003 | rule-002 | HIGH | OPEN | 2026-10-17T10:10:00Z | "0" | 2 / 1 |
| inc-002 | evt-006 | rule-002 | HIGH | INVESTIGATING | 2026-10-17T09:00:05Z | "1" | 2 / 2 |
| inc-003 | evt-007 | rule-001 | MEDIUM | OPEN | 2026-10-17T09:02:35Z | "0" | 1 / 1 |
| inc-004 | evt-016 | rule-005 | HIGH | RESOLVED | 2026-10-16T18:00:05Z | "2" | 2 / 3 |
| inc-005 | evt-017 | rule-004 | MEDIUM | RESOLVED | 2026-10-16T18:02:35Z | "2" | 1 / 3 |

inc-002 thêm STATUS_CHANGED OPEN→INVESTIGATING lúc 2026-10-17T09:05:00Z. inc-004 điều tra lúc 2026-10-16T18:01:00Z, resolve lúc 18:02:00Z; inc-005 điều tra lúc 18:03:00Z, resolve lúc 18:04:00Z. Version lần lượt 1/2/2 khớp số transitions. CREATED history tạo tại openedAt. History IDs `hist-xxx-k`, actor system khi CREATED và local-developer cho status changes.

Duplicate incidents inc-001/002/004 link hai business VIOLATION evaluation IDs; timeout cases inc-003/005 link một TIMEOUT VIOLATION. Total incident-evaluation links=8; total initial history rows=10. Primary rule/Severity giữ theo Architecture, không tạo incident cho mọi UNKNOWN. inc-004 đã RESOLVED nhưng faulty ledger vẫn +200 và latest business evaluations vẫn VIOLATION; resolvedAt không làm dữ liệu nghiệp vụ đúng lên.

## 4. Deterministic reproduction và dashboard calculations

### 4.1. DS-04 reproduction

1. Dataset có observer record evt-004 với eventId/order/time đã biết; observationStatus=OBSERVED.
2. Không tạo report/attempt Monitor rows cho event này. Report loss là absence trong visible data, không phải report FAILED.
3. Tạo ev-004-missing GAP: ledger=null, coverage NONE; message ghi independent evidence chưa có/adapter chưa thu được. DTO không chứa att-004-1, eff-004-1 hoặc `actualEffects`/`actualAttempts`.
4. Lưu ba UNKNOWN evaluations với lý do riêng theo §3.4; TIMEOUT candidate tại elapsed=420, không VIOLATION và không incident.
5. getEventDetail trả 200, attempts/reports=[], reportedAttemptCount=0, processingStatus UNKNOWN và exact effects chưa biết. UI ghi 0 **reported** attempts và tổng thực tế chưa biết; không hiển thị 0 business effects. Profile lỗi tải API là chế độ riêng, không dùng nó để thay thế DS-04.
6. Reload dựng lại cùng records, IDs, snapshot/outcomes; không cho adapter tự đọc dữ liệu tác giả giữ ngoài visible dataset.

### 4.2. Tổng hợp từ visible state

getOverview thực hiện cùng một snapshot read trên shared state:

1. Lấy asOf, xác định [asOf-range,asOf); lọc events OBSERVED theo occurredAt và applicationId optional.
2. observedEvents=length(events); confirmedProcessing=count status CONFIRMED sau conflict policy; không count số reports hoặc business PASS.
3. Open incidents=count status OPEN/INVESTIGATING có event thuộc scope và openedAt≤asOf; không lọc bỏ case chỉ vì openedAt trước windowStart.
4. Mỗi event/rule chọn latest persisted evaluation tại cutoff; unknownEvaluations=count outcome UNKNOWN. Không đếm lại three prior evt-010 evaluations; không thêm UNKNOWN cho rule mới chưa chạy.
5. Chia UTC buckets hour/day bằng floor UTC, count events ở intersection với window. Kể cả zero buckets; partial=true tại mép bị cắt. Sum(count)=observedEvents. latestIncidents sort openedAt DESC/id ASC trong cùng scope, lấy limit default5/max5.

| Scope | Events / confirmed / open / unknown latest | PASS / VIOLATION / UNKNOWN latest | Reported attempts / reports | Incidents |
|---|---|---|---|---|
| core | 5 / 3 / 1 / 4 | 9 / 2 / 4 | 4 / 4 | 1 |
| app-001 | 15 / 8 / 3 / 15 | 25 / 5 / 15 | 12 / 13 | 3 |
| app-002 | 15 / 10 / 0 / 11 | 31 / 3 / 11 | 13 / 14 | 2 |
| full | 30 / 18 / 3 / 26 | 56 / 8 / 26 | 25 / 27 | 5 |

Default 24h/hour có 25 bucket intervals do snapshot ở phút 10: first/last intervals partial, chỉ count phần giao cửa sổ. Nonzero: ngày 16/10 18:00–19:00 có 15; ngày 17/10 09:00–10:00 có 10; 10:00–11:00 có 5; các bucket khác 0. Day buckets cho cùng range có 15 events ngày 16 và 15 ngày 17. Range=1h tại reset chỉ gồm evt-001..005, nên core stats 5/3/1/4 vẫn kiểm riêng được.

Default latest incidents order: inc-001, inc-003, inc-002, inc-005, inc-004. Default Event Explorer occurredAt DESC/id ASC page0/size10: evt-005,004,003,002,001,015,014,013,012,011. Filter app-001/status UNKNOWN trả evt-004,005,010,011,012 trước sort; count5. Global UNKNOWN count8. OPEN+HIGH chỉ inc-001; INVESTIGATING+HIGH chỉ inc-002; RESOLVED+HIGH chỉ inc-004.

### 4.3. Clock và reset

Logical clock bắt đầu snapshot cố định; mỗi **mutation thành công có thay đổi** tăng đúng 1 millisecond, timestamps mới lấy clock đó. Getter, injected failure, invalid input và no-op PATCH không tăng clock. Không dùng wall clock, và không chạy lại rule engine do thời gian trôi trong UI. Historical evaluatedAt/snapshots cố định; asOf của read mới là logical clock hiện tại. Timeout-candidate explanation gắn evaluatedAt của evaluation đã lưu, không tự recompute từ Date.now().

ID counters riêng: app-new-001..., rule-new-001..., hist-new-001...; chỉ consume counter sau validation và trước atomic mutation commit thành công, kiểm collision với existing IDs. Reload reset cả data, counters, clock, error controls và pending state; không lưu localStorage/sessionStorage/backend. Một tab session là một instance state; không hứa sync nhiều tabs.

Resolve inc-001 qua hai transitions: version `"0"`→`"1"`→`"2"`; openIncidents 3→3→2 toàn dataset, core 1→1→0; giữ 90 latest outcomes/93 total rows và +200. Disable rule không đổi evaluations/counts/case status. Create app/rule không phát sinh event/evaluation/case tự động.

## 5. Mock adapter methods và fault controls

Interface có đúng 11 Dashboard methods trong [API Contract §2](06-api-contract.md#2-dashboard-operations-và-mock-interface), cùng typed requests/responses và Promise rejection shape. Mock không tạo internal report-ingestion method trên Dashboard interface; internal contract được mô tả riêng để Backend triển khai.

| Method | Read/mutation behavior | Success/validation/failure |
|---|---|---|
| getOverview(query) | Snapshot aggregate theo §4 | Validate range/bucket/app; invalid400; fault503 không fake zeros |
| listApplications(query) | Filter-free list + pagination/sort | 200 page DTO; empty200; invalid query400 |
| createApplication(body) | Trim/validate, generate ID, ACTIVE, append shared state | 201 resource; invalid400; injected error không thêm row; duplicate name allowed |
| listEvents(query) | Search/app/processing status AND, stable sort rồi page | Empty200; unknown valid selector empty; không đổi business data |
| getEventDetail(id) | Aggregate dữ liệu visible và refs của một observed record | 200 đủ arrays/gaps/history; missing404; không dùng hidden records |
| listRules(query) | List configs, same app có thể nhiều type instances | Related ID previews tối đa3, existing records; không fake editor |
| createRule(body) | Create built-in type config instance, version="1" | Wrong config400/unknown app404; duplicates allowed; không historical backfill |
| updateRule(id,body) | Set enabled; changed updatedAt; same state no-op | 200 resource; failure giữ prior state; configVersion không đổi |
| listIncidents(query) | AND status/severity/app + pagination | 200 page; RESOLVED không bị xóa; totals phản ánh shared mutation |
| getIncidentDetail(id) | Primary rule/event/linked historical violations/evidence/history | Missing404; resolved data vẫn vi phạm nếu evidence nói vậy |
| updateIncidentStatus(id,body) | Check version trước transition; mutate status/version/history atomic | 200 full detail; stale409 VERSION_CONFLICT; invalid409 INVALID_STATE_TRANSITION; failure không đổi state/history |

`createRule` là contract method, không yêu cầu nút Rule Editor trong UI. Cancel form chỉ là local UI no-op. Evidence tab/Back/sidebar/detail links là navigation; không tạo endpoints phụ hoặc gọi trực tiếp DB. Search/filter/page triggers list methods đúng query; Retry gọi lại chính method lỗi; pending submit/toggle/status khóa gửi lặp.

Fault controls cho dev/test của mock, không Dashboard API mới hoặc persisted user config:

- Latency mặc định 250ms; profile slow dùng 1000ms, không jitter/random. Loading là Promise chưa settle; không là fake empty success.
- `failNext(method,code)` mô tả one-shot failure trước mutation; hỗ trợ safe ApiErrorResponse 400/401/403/404/409/500/503 theo ngữ cảnh. Mode empty trả empty list/zero overview với dataset override trống, detail lookup vào dataset trống trả404.
- Not-found tự tái hiện bằng missing-id hợp lệ. Unknown client route render SCR-08 mà không gọi API. API error không thay evaluation thành UNKNOWN; dữ liệu cũ không render như query mới đã thành công.
- Methods đọc nhận snapshot clone; response objects không chia sẻ mutable references để UI tự sửa fixtures ngoài adapter. Mutations serialize/atomic trong cùng state instance; expectedVersion bảo vệ concurrent requests: chỉ một stale-version update có thể thắng, request kia409.
- Reload reset mọi controls về normal. Failure không consume ID/clock/version/history. Không giả network ack loss đã được triển khai trong fault modes; HTTP real lost-ack behavior tuân API Contract.

## 6. DTO và dữ liệu không được suy diễn

Chỉ serialize fields có trong DTO schemas. Không trả internal tokens, connection strings, raw report payload hashes có secret inputs, SQL hoặc tác giả scenario ground truth. ID customer là pseudonymous demo reference. `sourceLabel` fault phải giữ nhãn injected. Các effect IDs dưới incomplete snapshot chỉ là các effects đã thấy, không exact total.

EventDetailResponse/report arrays tuân report IDs/attempt mapping. IncidentDetailResponse `linkedEvaluations` gồm historical VIOLATION links, `evidence` chứa mọi refs của links; `linkedEvent` là summary của đúng parent event. Rule related links là preview IDs có thật, không thêm route rule detail ngoài scope. Page totals tính trước slice, request query và body không mutate trực tiếp data.

## 7. Traceability

| Use Case | Screen | Endpoint / mock method | DTO fields | Fixtures / variants | Acceptance Criteria |
|---|---|---|---|---|---|
| UC01 | SCR-01 | GET overview / getOverview | stats.*, volumeBuckets, latestIncidents, windowStart/windowEnd/asOf | Full30/core5, inc-001, empty/error | AC-UC01-01, AC-UC01-02, AC-UC01-03; AC-SCR01-01, AC-SCR01-02; AC-API01 |
| UC02 | SCR-02, SCR-03 app selector | GET/POST applications / listApplications,createApplication | ApplicationResponse.*, name/environment validation, page totals | app-001/002, app-new-001, cancel/save-error | AC-UC02-01, AC-UC02-02, AC-UC02-03; AC-SCR02-01, AC-SCR02-02; AC-API02, AC-API03 |
| UC03-A | SCR-03, SCR-04 | GET events/detail / listEvents,getEventDetail | id vs eventId, applicationId/name, processingStatus/reason, reportedAttemptCount, ruleResults, page totals | All30, search1003, no-match/missing-id, clear/page | AC-UC03A-01, AC-UC03A-02, AC-UC03A-03; AC-SCR03-01, AC-SCR03-02; AC-API04, AC-API05 |
| UC03-B | SCR-04 | GET event detail / getEventDetail | attempts.*, reports.*, hasReportConflict, startedAt/finishedAt nullable | DS-02 two attempts; evt-010/020 same-attempt conflict; DS-04/05 no rows | AC-UC03B-01, AC-UC03B-02, AC-UC03B-03; AC-SCR04-01, AC-SCR04-02; AC-API05 |
| UC03-C | SCR-04, SCR-07 | GET event/incident detail / getEventDetail,getIncidentDetail | evaluations.outcome/reason/evidenceIds/configSnapshot/isLatest, evidence source/scope/quality/times/ledger/gaps | DS-03 +200, DS-04 gap, DS-05 independent proof, evt-010 revisions | AC-UC03C-01, AC-UC03C-02, AC-UC03C-03; AC-SCR04-01, AC-SCR04-02, AC-SCR04-03; AC-API05, AC-API10 |
| UC04 | SCR-05 | GET/POST/PATCH rules / listRules,createRule,updateRule | ruleType/config/configVersion/enabled/description/related IDs | rule-001..006, rule-new-001, save-error, same-state no-op | AC-UC04-01, AC-UC04-02, AC-UC04-03; AC-SCR05-01, AC-SCR05-02; AC-API06, AC-API07, AC-API08 |
| UC05 list | SCR-06 | GET incidents / listIncidents | status/severity/app/openedAt/version, page totals | inc-001..005, AND filters, empty/error/page | AC-UC05-01; AC-SCR06-01, AC-SCR06-02; AC-API09 |
| UC05 detail/status | SCR-07, SCR-01 count | GET/PATCH incident detail/status / getIncidentDetail,updateIncidentStatus | primaryRule, linkedEvent/evaluations/evidence, status/version/resolvedAt/history | inc-001 valid/stale/invalid transitions; inc-004 resolved still +200 | AC-UC05-02, AC-UC05-03; AC-SCR07-01, AC-SCR07-02; AC-API10, AC-API11 |
| UC03-A/UC05 exceptions | SCR-04, SCR-07, SCR-08 | Detail404 via GET; unknown route không gọi API | ApiErrorResponse code/message/requestId/fieldErrors/currentVersion; local navigation | missing-id404, /unknown-path→404→Overview | AC-UC03A-03, AC-UC05-01; AC-SCR08-01, AC-SCR08-02 |
| UC03 normal proof | SCR-03/04 | GET event detail | One report/effect, source refs | DS-01 evt-001 | AC-DS01-01, AC-DS01-02 |
| UC03 redelivery | SCR-03/04 | GET event detail | Two attempts, one effect | DS-02 evt-002 | AC-DS02-01, AC-DS02-02 |
| UC03/UC05 violation | SCR-01/04/06/07 | GET overview/event/incident + status PATCH | Distinct effects +200, primary rule and two violation links | DS-03 evt-003↔inc-001↔ev-003-ledger | AC-DS03-01, AC-DS03-02 |
| UC03 evidence gap | SCR-01/03/04/05 | GET event detail | 3 UNKNOWN, gaps, no attempts | DS-04 evt-004 | AC-DS04-01, AC-DS04-02 |
| UC03 independent proof | SCR-01/03/04/05 | GET event detail | 2 business PASS, TIMEOUT UNKNOWN, no reports | DS-05 evt-005 | AC-DS05-01, AC-DS05-02 |

Boundary-only fields như requestId/fieldErrors/currentVersion phục vụ error/validation/concurrency flows; decimal versions/generation/config snapshots và isLatest phục vụ optimistic concurrency và giải thích history. Không thêm thuộc tính sản phẩm chỉ để trang trí. Local Cancel/Back/Evidence tab/404 navigation không mutation và không cần endpoint giả; mọi action đọc/ghi remote đều nằm trong 11 methods.

## 8. Consistency acceptance checklist

- Ma trận 30 event IDs không trùng trong app; logical/observation IDs không hoán đổi; tất cả referenced app/rule/effect/evaluation/case IDs resolve.
- 6 configs đủ ba types cho hai apps; each event latest ba rules của đúng app; inputGeneration và configVersion serialize strings.
- Report/attempt counts là visible counts; DS-04/05 không lộ hidden identities. Conflict cùng attempt khác retry thành công của DS-02.
- Latest90 outcomes=56 PASS+8 VIOLATION+26 UNKNOWN; total93 gồm ba prior evt-010 PASS rows. Core5 vẫn15=9+2+4.
- 5 incidents, 8 violation links, 10 initial history rows; resolved cases giữ business errors; no UNKNOWN-only case.
- Stats/filter/sort/page/UTC buckets tính từ same state theo API; range1h kiểm core riêng. Không lồng seed stats vào full30.
- Mutation success/failure/no-op/reset và version conflict giữ semantics đã chốt; toggle/create rule không engine/backfill.
- JSON examples/type/required/nullability kiểm bằng schemas tại API Contract; liên kết giữa records và arithmetic cần kiểm bổ sung. Các mục này là đặc tả kiểm tra, không chứng nhận mock runtime hoặc backend đã chạy.
