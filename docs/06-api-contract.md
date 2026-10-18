# ERM — API Contract

## 1. Phạm vi và quy ước

Hợp đồng thiết kế cho Dashboard, mock adapter và Monitor HTTP API mục tiêu; **chưa có API runtime**. Nguồn nghiệp vụ: [Scope](01-product-scope.md), [Use Cases](02-use-cases.md), [Scenarios](03-demo-scenarios.md), [Screens](03a-screen-requirements.md), [Architecture](04-architecture.md), [Data Model](05-data-model.md). Dữ liệu cụ thể ở [Mock Data Spec](07-mock-data-spec.md); quyết định nền ở [ADRs](08-decisions.md).

Phạm vi Dashboard có đúng **11 operations** trong bảng §2. Internal processing report ingestion ở §6 là hợp đồng service-to-service riêng, không là operation thứ 12 của Dashboard. Không expose JPA entities hoặc business database qua API.

### 1.1. Wire format và số nguyên

- Base path `/api/v1`; request/response `application/json`, UTF-8, camelCase. GET không có body. Mọi thành công trả DTO trực tiếp, không bọc thêm `data`.
- IDs là opaque strings theo schema `Id`, dài 1–128; không ép UUID. Path `{id}` dùng ID bản ghi Monitor (`evt-003`, `inc-001`), không logical eventId (`order-paid-1003`). ID comparison case-sensitive; riêng search eventId dùng case-insensitive substring.
- Timestamp ISO 8601 UTC, hậu tố `Z`; chấp nhận seconds hoặc 1–3 chữ số fractional seconds, không leap-second literal. Dữ liệu tạo/gửi vào contract chuẩn hóa millisecond precision trước lưu/hash; khi serialize source timestamps độ phân giải cao hơn phải chuẩn hóa cùng chính sách, không tuyên bố độ chính xác clock cao hơn đã có. Client không tự lấy receipt time thay `finishedAt`.
- Các giá trị lấy từ PostgreSQL BIGINT gồm points/delta/totalDelta, `version`, `configVersion`, `ruleVersion`, `inputGeneration`, `evaluationGeneration`, `evaluatedGeneration` dùng **decimal string**, ví dụ `"100"`, `"0"`, `"1"`. Không số mũ/leading zero/float; semantic range 0..9223372036854775807, riêng points/version dương ở các field yêu cầu. Không stringify số đã mất chính xác; Backend chuyển từ integer chính xác sang string, frontend dùng `BigInt(value)` khi cần phép tính, serialize lại string.
- Counts, page/size, attemptNo và thresholdSeconds là JSON integer với bounds trong schemas; counts ≤9007199254740991. Không ép `Number(version)` hoặc làm tròn. Nếu count vượt giới hạn wire contract, server trả INTERNAL_ERROR thay vì silently clamp. Đây là lựa chọn representation của ERM, không suy rằng mọi BIGINT đều an toàn với JavaScript Number.
- Responses luôn có tất cả fields required trong schema; các mảng trả `[]`, không `null`. Nullable scalar/object = chưa có dữ liệu hoặc không áp dụng, có ý nghĩa cụ thể ở §4. Không phát minh event/attempt/effect để tránh null.
- Requests reject unknown fields (bao gồm credential, SQL/script, URL hoặc readonly fields), sai enum/type và null tại field không nullable. Body malformed →400 MALFORMED_JSON; schema/semantic body validation →400 VALIDATION_ERROR; query sai →400 INVALID_QUERY. Không silently coerce `"false"` thành boolean hoặc number thành decimal string.
- Tên/description trim trước validation và lưu, name 1–100 ký tự, description tối đa 500; không rỗng sau trim. Description có thể bỏ qua trong CreateRuleRequest và mặc định `""`; enabled bỏ qua mặc định true. Response không phản chiếu credentials hoặc raw stack traces.

### 1.2. Pagination, filter và sort

Áp dụng cho Applications, Events, Rules và Incidents:

| Quy ước | Contract |
|---|---|
| Page index | 0-based; `page=0` mặc định; integer 0..2147483647 |
| Page size | `size=10` mặc định, 1..100 |
| Response | `{items,page,size,totalItems,totalPages}`; totalPages = ceil(totalItems/size), dataset rỗng totalPages=0 |
| Page vượt phạm vi | 200 với items=[], giữ page yêu cầu; không tự đổi page ở server. UI đổi filter reset page=0; nếu page mất hợp lệ do mutation, UI gọi lại page hợp lệ |
| Filter | Trim query values; search rỗng bỏ điều kiện; selector rỗng bỏ điều kiện; enum nếu có phải uppercase hợp lệ; filters kết hợp AND |
| Identity filter không tồn tại | List trả 200/empty; không 404 vì không phải resource lookup. ID sai cú pháp →400 |
| Unknown/repeated query keys | 400 INVALID_QUERY; không nhận hai giá trị cho cùng selector |
| Events sort | Mặc định `sort=occurredAt,desc`; cho `occurredAt,asc`; null occurredAt luôn cuối; tie-break `id ASC` bất kể hướng |
| Incidents sort | Mặc định `sort=openedAt,desc`; cho `openedAt,asc`; tie-break `id ASC` |
| Applications sort | `sort=createdAt,asc` mặc định; cho desc; tie-break id ASC |
| Rules sort | `sort=name,asc` mặc định; cho desc; so tên đã normalize lowercase bằng thứ tự Unicode code points, tie-break id ASC; backend áp dụng cùng ordering rõ ràng, không lệ thuộc DB locale mặc định |

Filter → tính projection/status/latest evaluations → sort → totals → page. Không filter processing status hoặc severity sau khi đã page. Offset pagination ổn định trong cùng state snapshot; mutation/ingestion giữa hai request có thể dịch trang, chưa có snapshot cursor. Mock/HTTP adapter phải cùng semantics; không tự chuyển `status` sang outcome filter: Events `status` là ProcessingStatus, Incidents `status` là IncidentStatus.

### 1.3. Authentication boundary

`D-READ`/`D-WRITE` dưới đây là Dashboard boundary. Prototype mock không đăng nhập. HTTP local-demo mục tiêu chỉ bind loopback/trusted local development và không yêu cầu UI login; không coi chế độ đó là public deployment an toàn. Nếu bật lớp bảo vệ khi triển khai HTTP, credential thiếu/sai →401, principal không có quyền read/write →403. Contract giữ các errors này để adapters xử lý đúng; chưa thiết kế IAM/multi-tenant/login UI. Không đặt service token trong React env hoặc request từ browser. Internal boundary ở §6 luôn yêu cầu service authentication riêng.

### 1.4. Common errors

`ApiErrorResponse` giữ `code` và `message` làm hai trường cốt lõi; bổ sung requestId, fieldErrors và currentVersion có nghĩa xác định.

| HTTP | code | Ý nghĩa |
|---|---|---|
| 400 | MALFORMED_JSON / INVALID_QUERY / VALIDATION_ERROR | JSON, query hoặc input sai; fieldErrors có field paths khi xác định được |
| 401 | UNAUTHENTICATED | Credential thiếu/sai trong protected boundary; HTTP kèm WWW-Authenticate phù hợp |
| 403 | FORBIDDEN | Principal hợp lệ nhưng sai quyền/application/producer binding |
| 404 | RESOURCE_NOT_FOUND | Detail/path resource hoặc application ownership trong create request không tồn tại |
| 409 | VERSION_CONFLICT | Incident expectedVersion khác current version; currentVersion trả string hiện tại |
| 409 | INVALID_STATE_TRANSITION | Version hợp lệ nhưng transition bị cấm |
| 409 | REPORT_PAYLOAD_CONFLICT / IDENTITY_CONFLICT | Chỉ internal ingestion: stable report ID khác payload hoặc attempt identity đã gắn event khác |
| 405 | METHOD_NOT_ALLOWED | Method không hỗ trợ; kèm Allow |
| 415 | UNSUPPORTED_MEDIA_TYPE | Body không phải application/json |
| 500 | INTERNAL_ERROR | Lỗi server bất ngờ; safe message, không SQL/stack trace/credential |
| 503 | SERVICE_UNAVAILABLE | Backend không phục vụ request; client có thể Retry GET với backoff |

UNKNOWN không nằm trong bảng HTTP errors: event/rule chưa đủ evidence vẫn trả **200** và `outcome:"UNKNOWN"` kèm reason/evidence gap. Ngược lại API load/save lỗi phải reject như ApiErrorResponse, không sinh evaluation UNKNOWN hoặc trả dataset rỗng giả thành công.

Không retry POST tự động sau transport failure chưa biết server đã commit hay chưa. UI giữ input, báo lỗi và tải lại list để đối chiếu trước tạo lại. Mock failure được inject trước commit nên không mutation. PATCH rule ghi desired enabled state có tính idempotent; PATCH incident dùng version, retry stale phải tải lại detail khi 409.

## 2. Dashboard operations và mock interface

Tất cả mock methods trả Promise của DTO tương ứng; params dùng cùng field/type/validation với query/body. Detail method nhận observation/incident ID. Không component nào import fixtures để tự ghép kết quả.

| # | Method/path | operationId / mock method | Response | Boundary | UC / Screen |
|---|---|---|---|---|---|
| 1 | GET /api/v1/overview | getOverview(query) | OverviewResponse | D-READ | UC01 / SCR-01 |
| 2 | GET /api/v1/applications | listApplications(query) | ApplicationPageResponse | D-READ | UC02 / SCR-02 |
| 3 | POST /api/v1/applications | createApplication(body) | ApplicationResponse | D-WRITE | UC02 / SCR-02 |
| 4 | GET /api/v1/events | listEvents(query) | EventPageResponse | D-READ | UC03-A / SCR-03 |
| 5 | GET /api/v1/events/{id} | getEventDetail(id) | EventDetailResponse | D-READ | UC03-A/B/C / SCR-04 |
| 6 | GET /api/v1/rules | listRules(query) | RulePageResponse | D-READ | UC04 / SCR-05 |
| 7 | POST /api/v1/rules | createRule(body) | MonitoringRuleResponse | D-WRITE | UC04 contract; không yêu cầu editor UI |
| 8 | PATCH /api/v1/rules/{id} | updateRule(id,body) | MonitoringRuleResponse | D-WRITE | UC04 / SCR-05 |
| 9 | GET /api/v1/incidents | listIncidents(query) | IncidentPageResponse | D-READ | UC05 / SCR-06 |
| 10 | GET /api/v1/incidents/{id} | getIncidentDetail(id) | IncidentDetailResponse | D-READ | UC05 / SCR-07 |
| 11 | PATCH /api/v1/incidents/{id}/status | updateIncidentStatus(id,body) | IncidentDetailResponse | D-WRITE | UC05 / SCR-07 |

`PageResponse` mô tả envelope chung; bốn concrete page DTO khóa chính xác item type. Không trả array trần ở một list và PageResponse ở list khác. POST 201 trả full created resource; PATCH 200 trả full updated resource, không 204.

## 3. Processing, evidence và latest semantics

### 3.1. Conflict trong cùng attempt

1. Chỉ reports từ producer được authenticate/authorize mới được chấp nhận. Retry cùng producerReportId/hash không tạo row hoặc attempt mới.
2. Gom reports theo producerAttemptId trong application/event. STARTED và một terminal report hợp lệ cùng attempt không phải conflict.
3. Hai terminal reports cùng attempt có status trái nhau, hoặc non-null startedAt/finishedAt bất tương thích → `hasTerminalConflict=true`, attempt status CONFLICTED; timestamp không reconcile được trả null ở attempt projection, nhưng giữ nguyên timestamp của từng report. Null → một mốc đã biết phù hợp là enrichment, không tự là conflict.
4. Nếu tồn tại terminal conflict chưa giải quyết trong event: `hasReportConflict=true`, processingStatus UNKNOWN, TIMEOUT UNKNOWN. Không dùng một SUCCEEDED report để che conflict trong cùng attempt, kể cả khi còn attempt khác báo success. Rule dựa ledger độc lập vẫn có thể PASS/VIOLATION.
Stable report ID được gửi với payload khác cũng là report conflict chưa giải quyết: giữ canonical report gốc, lưu claim mâu thuẫn đã mask ở conflict evidence; processing và TIMEOUT UNKNOWN cho đến khi reconcile, không tự chọn canonical success để bỏ qua conflict. hasReportConflict bao phủ trường hợp này; nếu terminal claims trái nhau, attempt projection CONFLICTED dù chỉ có một accepted report row và claim còn lại nằm trong evidence. Không tạo report row thứ hai cho cùng ID.

5. Nếu không conflict: có trusted success → CONFIRMED; chưa success và attempt mới nhất STARTED →PENDING; chỉ các terminal failures →FAILED; không reports phù hợp →UNKNOWN. Thứ tự attempts theo startedAt hợp lệ, fallback first_report_received_at, tie-break attempt ID. DS-02 là **hai attempts khác nhau**, FAILED rồi SUCCEEDED →CONFIRMED, không conflict.

RuleResults trên summary chứa latest persisted evaluation cho mỗi rule, không gộp thành một `evaluationStatus`. Event Detail trả evaluations gồm history với `isLatest`. CURRENT/PENDING/NOT_EVALUATED là trạng thái queued generation, không kết luận nghiệp vụ đúng và không khẳng định rule config vừa tạo đã backfill mọi event.

### 3.2. Evidence DTO invariants

- `ledger=null` khi không có ledger snapshot, không phải ledger 0 rows. effectCount/totalDelta null nghĩa chưa đủ căn cứ để báo exact whole-scope result. Client không biến null thành 0. effects=[] dưới incomplete scope không chứng minh zero effects.
- Ledger snapshot hiển thị event/customer/source/run, expectation độc lập, coverage/trust/finality và hai timestamps. COMPLETE/FINAL/TRUSTED mới cho exact whole-scope aggregates. Partial trusted snapshot có ít nhất hai distinct effects có thể đủ duplicate VIOLATION theo Architecture, dù exact effectCount vẫn null.
- REPORT_BATCH dùng reportIds cùng event; không phải independent ledger. GAP/CORRELATION_CONFLICT có gaps[] không rỗng. Trust/coverage do collector/ingestion policy xác định; không do browser hoặc report body tự gán.
- snapshotAt/collectedAt/ledger createdAt không phải successful finishedAt. DS-05 vẫn TIMEOUT UNKNOWN. DS-04 chỉ có observation và ev-004-missing; không có att-004-1/eff-004-1 trong response.
- `evidenceIds` của evaluation phải resolve trong aggregate detail; linkedEvaluations của incident chỉ gồm historical VIOLATION được gắn case, kể cả latest event evaluation có thể đã khác. Incident detail chứa đầy đủ evidence tương ứng các links đó. Không lược evidence làm lý do không truy nguyên được.
- Event Detail có thể trả REPORTED_ONLY placeholder với canonical fields null; không tính placeholder vào card OBSERVED. Arrays attempts/reports chỉ gồm dữ liệu đã ingest, không bịa actual attempts.

### 3.3. JSON/schema conventions

§4 chứa field tables; §7 chứa schemas JSON Schema 2020-12 chuẩn cho DTO, §8 chứa ví dụ bổ sung. Required/nullable là hai trục riêng: required nullable phải xuất hiện với null khi chưa biết; optional request bỏ qua dùng default đã mô tả, gửi null không được coi như bỏ qua. Response unknown fields không thuộc v1 contract. Các semantic invariants liên bảng, BIGINT upper bounds và phép tính totals phải kiểm thêm ngoài JSON Schema.

DTO-only fields phục vụ presentation: applicationName tránh client join tùy tiện; ruleResults/isLatest phục vụ list/history; processingStatusReason/hasReportConflict giải thích trạng thái; relatedEventIds/relatedIncidentIds là preview tối đa ba links existing records; version phục vụ concurrency. Các fields này là projection, không yêu cầu thêm cột hoặc service trái Data Model.

## 4. DTO field reference

**Cách đọc bảng DTO:** `Required = Có` nghĩa là trường phải có mặt trong JSON; `Nullable = Không` nghĩa là không chấp nhận `null`. Nếu trường vừa bắt buộc vừa không nullable, thiếu trường hoặc gửi `null` là lỗi hợp đồng (không cần lặp lại ở từng hàng). Mảng rỗng `[]` chỉ hợp lệ khi JSON Schema cho phép, chẳng hạn `minItems=0`; quy tắc này không áp dụng cho scalar. Trường `Required = Không` có thể được bỏ qua theo mặc định đã nêu; nếu `Nullable = Không`, gửi `null` vẫn không hợp lệ. Với trường bắt buộc nhưng nullable, cần giữ trường và dùng `null` khi giá trị chưa biết hoặc không áp dụng.

Cột **Ràng buộc và ngữ nghĩa bổ sung** chỉ nêu đặc điểm vượt ngoài kiểu dữ liệu; dấu `—` nghĩa là không có quy tắc bổ sung. **§7** là nguồn ràng buộc machine-readable chính xác; §3 mô tả processing/evidence semantics. Các JSON examples nằm ở §5, §6 và §8.

Tất cả response fields là required trừ khi bảng ghi khác. Null = không biết/không áp dụng; mảng rỗng = chưa có records được thấy. Domain definitions và validation chính xác được đính kèm tại §7. Field tables bên dưới tham chiếu schema names; JSON examples đầy đủ tại từng operation và §8.

### DTO-ApplicationResponse

| Field | Type/domain | Required | Nullable | Ràng buộc và ngữ nghĩa bổ sung |
|---|---|---|---|---|
| id | Id | Có | Không | ID bản ghi resource, không mặc nhiên logical eventId. |
| name | string | Có | Không | Tên hiển thị đã trim. minLength=1, maxLength=100, pattern=\S. |
| environment | SANDBOX / DEVELOPMENT | Có | Không | — |
| status | ACTIVE / INACTIVE | Có | Không | Trạng thái cấu hình, không phải connectivity health. |
| createdAt | UtcTimestamp | Có | Không | — |

### DTO-CreateApplicationRequest

| Field | Type/domain | Required | Nullable | Ràng buộc và ngữ nghĩa bổ sung |
|---|---|---|---|---|
| name | string | Có | Không | Trim; không rỗng. minLength=1, maxLength=100, pattern=\S. |
| environment | SANDBOX / DEVELOPMENT | Có | Không | — |

### DTO-TimeoutRuleConfig

| Field | Type/domain | Required | Nullable | Ràng buộc và ngữ nghĩa bổ sung |
|---|---|---|---|---|
| thresholdSeconds | integer | Có | Không | Ngưỡng giây; seed=60. minimum=1, maximum=86400. |
| completionBasis | FIRST_TRUSTED_SUCCESS | Có | Không | — |

### DTO-DuplicateRuleConfig

| Field | Type/domain | Required | Nullable | Ràng buộc và ngữ nghĩa bổ sung |
|---|---|---|---|---|
| maxEffects | 1 | Có | Không | — |
| sourcePolicy | EVENT_BOUND_SOURCE | Có | Không | — |

### DTO-InvariantRuleConfig

| Field | Type/domain | Required | Nullable | Ràng buộc và ngữ nghĩa bổ sung |
|---|---|---|---|---|
| expectedSource | ORDER_EXPECTATION | Có | Không | — |
| comparison | TOTAL_DELTA_EQUALS_EXPECTED | Có | Không | — |

### DTO-MonitoringRuleResponse

| Field | Type/domain | Required | Nullable | Ràng buộc và ngữ nghĩa bổ sung |
|---|---|---|---|---|
| id | Id | Có | Không | ID bản ghi resource, không mặc nhiên logical eventId. |
| applicationId | Id | Có | Không | Application ownership/filter scope. |
| ruleType | RuleType | Có | Không | — |
| name | string | Có | Không | Tên hiển thị. minLength=1, maxLength=100, pattern=\S. |
| description | string | Có | Không | Mô tả an toàn; có thể rỗng. minLength=0, maxLength=500. |
| config | TimeoutRuleConfig / DuplicateRuleConfig / InvariantRuleConfig | Có | Không | — |
| enabled | boolean | Có | Không | Desired config state; không recompute lịch sử. |
| configVersion | PositiveInt64String | Có | Không | Semantic config version; bật/tắt không đổi version này. |
| updatedAt | UtcTimestamp | Có | Không | — |
| relatedEventIds | Id[] | Có | Không | Tối đa ba existing detail links, không danh sách mọi event. minItems=0, maxItems=3. |
| relatedIncidentIds | Id[] | Có | Không | Tối đa ba existing incident detail links. minItems=0, maxItems=3. |

### DTO-CreateRuleRequest

| Field | Type/domain | Required | Nullable | Ràng buộc và ngữ nghĩa bổ sung |
|---|---|---|---|---|
| applicationId | Id | Có | Không | Application ownership/filter scope. |
| ruleType | RuleType | Có | Không | — |
| name | string | Có | Không | Tên hiển thị. minLength=1, maxLength=100, pattern=\S. |
| description | string | Không | Không | Mô tả an toàn; có thể rỗng. minLength=0, maxLength=500. **Khi bỏ qua:** chuỗi rỗng. Null không hợp lệ. |
| config | TimeoutRuleConfig / DuplicateRuleConfig / InvariantRuleConfig | Có | Không | — |
| enabled | boolean | Không | Không | Desired config state; không recompute lịch sử. **Khi bỏ qua:** true. Null không hợp lệ. |

### DTO-UpdateRuleRequest

| Field | Type/domain | Required | Nullable | Ràng buộc và ngữ nghĩa bổ sung |
|---|---|---|---|---|
| enabled | boolean | Có | Không | Desired config state; không recompute lịch sử. |

### DTO-RuleResultSummaryResponse

| Field | Type/domain | Required | Nullable | Ràng buộc và ngữ nghĩa bổ sung |
|---|---|---|---|---|
| evaluationId | Id | Có | Không | — |
| ruleId | Id | Có | Không | — |
| ruleType | RuleType | Có | Không | — |
| outcome | RuleOutcome | Có | Không | — |
| reasonCode | string | Có | Không | Code lý do ổn định. pattern=^[A-Z][A-Z0-9_]{0,63}$. |
| evaluatedAt | UtcTimestamp | Có | Không | — |

### DTO-EventSummaryResponse

| Field | Type/domain | Required | Nullable | Ràng buộc và ngữ nghĩa bổ sung |
|---|---|---|---|---|
| id | Id | Có | Không | ID bản ghi resource, không mặc nhiên logical eventId. |
| eventId | Id | Có | Không | Logical event identity, namespace theo application. |
| applicationId | Id | Có | Không | Application ownership/filter scope. |
| applicationName | string | Có | Không | Nhãn app từ projection. minLength=1, maxLength=100, pattern=\S. |
| eventType | ORDER_PAID / null | Có | Có | **Khi `null`: Placeholder chưa có canonical envelope. |
| correlationId | Id / null | Có | Có | **Khi `null`: Chưa quan sát canonical correlation. |
| occurredAt | UtcTimestamp / null | Có | Có | **Khi `null`: Chưa quan sát canonical event time. |
| observationStatus | ObservationStatus | Có | Không | — |
| processingStatus | ProcessingStatus | Có | Không | — |
| processingStatusReason | string | Có | Không | Giải thích theo các reports nhìn thấy. minLength=1, maxLength=1000, pattern=\S. |
| reportedAttemptCount | integer | Có | Không | Đếm unique attempts có report; không phải tổng actual attempts. minimum=0, maximum=9007199254740991. |
| hasReportConflict | boolean | Có | Không | Có terminal conflict chưa reconcile trong event. |
| evaluationState | CURRENT / PENDING / NOT_EVALUATED | Có | Không | Trạng thái queued generation, không phải business outcome. |
| ruleResults | RuleResultSummaryResponse[] | Có | Không | minItems=0. |
| relatedIncidentId | Id / null | Có | Có | **Khi `null`: Chưa có incident. |

### DTO-ProcessingReportResponse

| Field | Type/domain | Required | Nullable | Ràng buộc và ngữ nghĩa bổ sung |
|---|---|---|---|---|
| id | Id | Có | Không | ID bản ghi resource, không mặc nhiên logical eventId. |
| attemptId | Id | Có | Không | — |
| producerReportId | Id | Có | Không | Identity ổn định khi retry cùng report. |
| reportedStatus | ProcessingReportStatus | Có | Không | — |
| startedAt | UtcTimestamp / null | Có | Có | **Khi `null`: Chưa có mốc tin cậy/reconcile được. |
| finishedAt | UtcTimestamp / null | Có | Có | **Khi `null`: Chưa có mốc tin cậy/reconcile được. |
| reportedAt | UtcTimestamp | Có | Không | Producer send time. |
| receivedAt | UtcTimestamp | Có | Không | Monitor ingestion time. |
| errorCode | string / null | Có | Có | **Khi `null`: Không có error code. |

### DTO-ProcessingAttemptResponse

| Field | Type/domain | Required | Nullable | Ràng buộc và ngữ nghĩa bổ sung |
|---|---|---|---|---|
| id | Id | Có | Không | ID bản ghi resource, không mặc nhiên logical eventId. |
| producerAttemptId | Id | Có | Không | Identity một invocation; khác HTTP report retry. |
| attemptNo | integer / null | Có | Có | **Khi `null`: Chưa biết ordinal thật. |
| status | ProcessingAttemptStatus | Có | Không | — |
| startedAt | UtcTimestamp / null | Có | Có | **Khi `null`: Chưa có mốc tin cậy/reconcile được. |
| finishedAt | UtcTimestamp / null | Có | Có | **Khi `null`: Chưa có mốc tin cậy/reconcile được. |
| reportIds | Id[] | Có | Không | IDs reports được ghi nhận và cùng parent event/attempt. minItems=1. |
| hasTerminalConflict | boolean | Có | Không | — |

### DTO-EvidenceGapResponse

| Field | Type/domain | Required | Nullable | Ràng buộc và ngữ nghĩa bổ sung |
|---|---|---|---|---|
| code | string | Có | Không | Code gap ổn định. pattern=^[A-Z][A-Z0-9_]{0,63}$. |
| message | string | Có | Không | Giải thích thiếu dữ liệu. minLength=1, maxLength=1000, pattern=\S. |
| missingFields | string[] | Có | Không | minItems=0. |

### DTO-BusinessEffectResponse

| Field | Type/domain | Required | Nullable | Ràng buộc và ngữ nghĩa bổ sung |
|---|---|---|---|---|
| id | Id | Có | Không | ID bản ghi resource, không mặc nhiên logical eventId. |
| eventId | Id | Có | Không | Logical event identity, namespace theo application. |
| customerRef | Id | Có | Không | — |
| delta | PositiveInt64String | Có | Không | — |
| createdAt | UtcTimestamp / null | Có | Có | **Khi `null`: Chưa biết/không áp dụng; không suy ra 0 hoặc thành công. |

### DTO-EvidenceScopeResponse

| Field | Type/domain | Required | Nullable | Ràng buộc và ngữ nghĩa bổ sung |
|---|---|---|---|---|
| eventId | Id | Có | Không | Logical event identity, namespace theo application. |
| customerRef | Id / null | Có | Có | **Khi `null`: Chưa biết customer từ nguồn phù hợp. |
| runId | Id / null | Có | Có | **Khi `null`: Không phải sandbox run hoặc chưa biết. |

### DTO-LedgerSnapshotResponse

| Field | Type/domain | Required | Nullable | Ràng buộc và ngữ nghĩa bổ sung |
|---|---|---|---|---|
| expectedPoints | PositiveInt64String / null | Có | Có | **Khi `null`: Chưa có expectation đủ căn cứ. |
| effectCount | integer / null | Có | Có | **Khi `null`: Chưa biết exact whole-scope effect count. |
| totalDelta | NonNegativeInt64String / null | Có | Có | **Khi `null`: Chưa biết exact whole-scope total. |
| effects | BusinessEffectResponse[] | Có | Không | minItems=0. |

### DTO-EvidenceResponse

| Field | Type/domain | Required | Nullable | Ràng buộc và ngữ nghĩa bổ sung |
|---|---|---|---|---|
| id | Id | Có | Không | ID bản ghi resource, không mặc nhiên logical eventId. |
| observedEventId | Id | Có | Không | FK/route identity của observed record. |
| kind | LEDGER_SNAPSHOT / REPORT_BATCH / GAP / CORRELATION_CONFLICT | Có | Không | — |
| sourceKey | string | Có | Không | Allowlisted source, không SQL/URL. minLength=1, maxLength=100, pattern=\S. |
| sourceLabel | string | Có | Không | Nguồn hiển thị; có nhãn injected khi sandbox. minLength=1, maxLength=200, pattern=\S. |
| scope | EvidenceScopeResponse | Có | Không | — |
| coverage | EvidenceCoverage | Có | Không | — |
| trust | EvidenceTrust | Có | Không | — |
| finality | EvidenceFinality | Có | Không | — |
| snapshotAt | UtcTimestamp / null | Có | Có | **Khi `null`: Nguồn chưa cung cấp snapshot time hoặc đây là gap. |
| collectedAt | UtcTimestamp | Có | Không | Thời điểm collector nhận snapshot/gap. |
| supersedesEvidenceId | Id / null | Có | Có | **Khi `null`: Không supersede snapshot trước. |
| ledger | LedgerSnapshotResponse / null | Có | Có | **Khi `null`: Không có business ledger snapshot. |
| reportIds | Id[] | Có | Không | IDs reports được ghi nhận và cùng parent event/attempt. minItems=0. |
| gaps | EvidenceGapResponse[] | Có | Không | minItems=0. |

### DTO-RuleEvaluationResponse

| Field | Type/domain | Required | Nullable | Ràng buộc và ngữ nghĩa bổ sung |
|---|---|---|---|---|
| id | Id | Có | Không | ID bản ghi resource, không mặc nhiên logical eventId. |
| observedEventId | Id | Có | Không | FK/route identity của observed record. |
| ruleId | Id | Có | Không | — |
| ruleType | RuleType | Có | Không | — |
| ruleVersion | PositiveInt64String | Có | Không | Config version đã được evaluation dùng. |
| configSnapshot | TimeoutRuleConfig / DuplicateRuleConfig / InvariantRuleConfig | Có | Không | — |
| inputGeneration | PositiveInt64String | Có | Không | Input revision của evaluation đã lưu. |
| outcome | RuleOutcome | Có | Không | — |
| reasonCode | string | Có | Không | pattern=^[A-Z][A-Z0-9_]{0,63}$. |
| reason | string | Có | Không | Lý do cho cả PASS/VIOLATION/UNKNOWN. minLength=1, maxLength=2000, pattern=\S. |
| evaluatedAt | UtcTimestamp | Có | Không | — |
| evidenceIds | Id[] | Có | Không | Evidence/gap IDs để truy nguyên conclusion. minItems=1. |
| isLatest | boolean | Có | Không | Latest persisted evaluation của rule/event tại response. |

### DTO-EventDetailResponse

| Field | Type/domain | Required | Nullable | Ràng buộc và ngữ nghĩa bổ sung |
|---|---|---|---|---|
| id | Id | Có | Không | ID bản ghi resource, không mặc nhiên logical eventId. |
| eventId | Id | Có | Không | Logical event identity, namespace theo application. |
| applicationId | Id | Có | Không | Application ownership/filter scope. |
| applicationName | string | Có | Không | Nhãn app từ projection. minLength=1, maxLength=100, pattern=\S. |
| eventType | ORDER_PAID / null | Có | Có | **Khi `null`: Placeholder chưa có canonical envelope. |
| correlationId | Id / null | Có | Có | **Khi `null`: Chưa quan sát canonical correlation. |
| occurredAt | UtcTimestamp / null | Có | Có | **Khi `null`: Chưa quan sát canonical event time. |
| observationStatus | ObservationStatus | Có | Không | — |
| processingStatus | ProcessingStatus | Có | Không | — |
| processingStatusReason | string | Có | Không | Giải thích theo các reports nhìn thấy. minLength=1, maxLength=1000, pattern=\S. |
| reportedAttemptCount | integer | Có | Không | Đếm unique attempts có report; không phải tổng actual attempts. minimum=0, maximum=9007199254740991. |
| hasReportConflict | boolean | Có | Không | Có terminal conflict chưa reconcile trong event. |
| evaluationState | CURRENT / PENDING / NOT_EVALUATED | Có | Không | Trạng thái queued generation, không phải business outcome. |
| ruleResults | RuleResultSummaryResponse[] | Có | Không | minItems=0. |
| relatedIncidentId | Id / null | Có | Có | **Khi `null`: Chưa có incident. |
| customerRef | Id / null | Có | Có | **Khi `null`: Chưa biết customer từ nguồn phù hợp. |
| expectedPoints | PositiveInt64String / null | Có | Có | **Khi `null`: Chưa có expectation đủ căn cứ. |
| evidenceSourceKey | string / null | Có | Có | **Khi `null`: Chưa chốt binding từ event được quan sát. |
| firstSeenAt | UtcTimestamp | Có | Không | Monitor ingestion đầu tiên, không consumer start. |
| evaluationGeneration | PositiveInt64String | Có | Không | Generation event đang có. |
| evaluatedGeneration | NonNegativeInt64String | Có | Không | Generation đã xử lý xong. |
| attempts | ProcessingAttemptResponse[] | Có | Không | minItems=0. |
| reports | ProcessingReportResponse[] | Có | Không | minItems=0. |
| evaluations | RuleEvaluationResponse[] | Có | Không | minItems=0. |
| evidence | EvidenceResponse[] | Có | Không | minItems=0. |

### DTO-RuleReferenceResponse

| Field | Type/domain | Required | Nullable | Ràng buộc và ngữ nghĩa bổ sung |
|---|---|---|---|---|
| id | Id | Có | Không | ID bản ghi resource, không mặc nhiên logical eventId. |
| ruleType | RuleType | Có | Không | — |
| name | string | Có | Không | Tên rule hiển thị. minLength=1, maxLength=100, pattern=\S. |

### DTO-IncidentSummaryResponse

| Field | Type/domain | Required | Nullable | Ràng buộc và ngữ nghĩa bổ sung |
|---|---|---|---|---|
| id | Id | Có | Không | ID bản ghi resource, không mặc nhiên logical eventId. |
| applicationId | Id | Có | Không | Application ownership/filter scope. |
| applicationName | string | Có | Không | minLength=1, maxLength=100, pattern=\S. |
| observedEventId | Id | Có | Không | FK/route identity của observed record. |
| eventId | Id | Có | Không | Logical event identity, namespace theo application. |
| primaryRule | RuleReferenceResponse | Có | Không | — |
| severity | MEDIUM / HIGH | Có | Không | — |
| status | IncidentStatus | Có | Không | — |
| summary | string | Có | Không | Mô tả hồ sơ, không kết luận repair. minLength=1, maxLength=500, pattern=\S. |
| openedAt | UtcTimestamp | Có | Không | — |
| resolvedAt | UtcTimestamp / null | Có | Có | **Khi `null`: Chưa RESOLVED. |
| version | NonNegativeInt64String | Có | Không | Incident optimistic concurrency version dạng decimal string. |

### DTO-IncidentHistoryResponse

| Field | Type/domain | Required | Nullable | Ràng buộc và ngữ nghĩa bổ sung |
|---|---|---|---|---|
| id | Id | Có | Không | ID bản ghi resource, không mặc nhiên logical eventId. |
| action | CREATED / STATUS_CHANGED / EVIDENCE_ADDED / SEVERITY_RAISED | Có | Không | — |
| fromStatus | IncidentStatus / null | Có | Có | **Khi `null`: Chưa biết/không áp dụng; không suy ra 0 hoặc thành công. |
| toStatus | IncidentStatus / null | Có | Có | **Khi `null`: Chưa biết/không áp dụng; không suy ra 0 hoặc thành công. |
| actorRef | string | Có | Không | Label system/local developer, không credential. minLength=1, maxLength=100, pattern=\S. |
| note | string | Có | Không | minLength=0, maxLength=1000. |
| createdAt | UtcTimestamp | Có | Không | — |

### DTO-IncidentDetailResponse

| Field | Type/domain | Required | Nullable | Ràng buộc và ngữ nghĩa bổ sung |
|---|---|---|---|---|
| id | Id | Có | Không | ID bản ghi resource, không mặc nhiên logical eventId. |
| applicationId | Id | Có | Không | Application ownership/filter scope. |
| applicationName | string | Có | Không | minLength=1, maxLength=100, pattern=\S. |
| observedEventId | Id | Có | Không | FK/route identity của observed record. |
| eventId | Id | Có | Không | Logical event identity, namespace theo application. |
| primaryRule | RuleReferenceResponse | Có | Không | — |
| severity | MEDIUM / HIGH | Có | Không | — |
| status | IncidentStatus | Có | Không | — |
| summary | string | Có | Không | Mô tả hồ sơ, không kết luận repair. minLength=1, maxLength=500, pattern=\S. |
| openedAt | UtcTimestamp | Có | Không | — |
| resolvedAt | UtcTimestamp / null | Có | Có | **Khi `null`: Chưa RESOLVED. |
| version | NonNegativeInt64String | Có | Không | Incident optimistic concurrency version dạng decimal string. |
| explanation | string | Có | Không | minLength=1, maxLength=2000, pattern=\S. |
| updatedAt | UtcTimestamp | Có | Không | — |
| linkedEvent | EventSummaryResponse | Có | Không | — |
| linkedEvaluations | RuleEvaluationResponse[] | Có | Không | Historical VIOLATION evaluations gắn case, không chỉ latest. minItems=1. |
| evidence | EvidenceResponse[] | Có | Không | minItems=1. |
| history | IncidentHistoryResponse[] | Có | Không | minItems=1. |

### DTO-UpdateIncidentStatusRequest

| Field | Type/domain | Required | Nullable | Ràng buộc và ngữ nghĩa bổ sung |
|---|---|---|---|---|
| status | IncidentStatus | Có | Không | — |
| expectedVersion | NonNegativeInt64String | Có | Không | Version phải khớp trước kiểm transition. |
| note | string | Không | Không | Optional note; không chứa secret. minLength=0, maxLength=500. **Khi bỏ qua:** không áp dụng. Null không hợp lệ. |

### DTO-OverviewStatsResponse

| Field | Type/domain | Required | Nullable | Ràng buộc và ngữ nghĩa bổ sung |
|---|---|---|---|---|
| observedEvents | integer | Có | Không | minimum=0, maximum=9007199254740991. |
| confirmedProcessing | integer | Có | Không | minimum=0, maximum=9007199254740991. |
| openIncidents | integer | Có | Không | minimum=0, maximum=9007199254740991. |
| unknownEvaluations | integer | Có | Không | minimum=0, maximum=9007199254740991. |

### DTO-EventVolumeBucketResponse

| Field | Type/domain | Required | Nullable | Ràng buộc và ngữ nghĩa bổ sung |
|---|---|---|---|---|
| startAt | UtcTimestamp | Có | Không | — |
| endAt | UtcTimestamp | Có | Không | — |
| count | integer | Có | Không | minimum=0, maximum=9007199254740991. |
| partial | boolean | Có | Không | Bucket UTC bị cắt bởi mép window; chỉ đếm intersection. |

### DTO-OverviewResponse

| Field | Type/domain | Required | Nullable | Ràng buộc và ngữ nghĩa bổ sung |
|---|---|---|---|---|
| range | 1h / 24h / 7d | Có | Không | — |
| bucket | hour / day | Có | Không | — |
| applicationId | Id / null | Có | Có | Application ownership/filter scope. **Khi `null`: null = tất cả applications. |
| asOf | UtcTimestamp | Có | Không | Thời điểm state snapshot của response; mock dùng logical clock. |
| windowStart | UtcTimestamp | Có | Không | Inclusive lower bound của phạm vi event occurredAt. |
| windowEnd | UtcTimestamp | Có | Không | Exclusive upper bound event window. |
| stats | OverviewStatsResponse | Có | Không | — |
| volumeBuckets | EventVolumeBucketResponse[] | Có | Không | minItems=0. |
| latestIncidents | IncidentSummaryResponse[] | Có | Không | minItems=0, maxItems=5. |

### DTO-PageResponse

| Field | Type/domain | Required | Nullable | Ràng buộc và ngữ nghĩa bổ sung |
|---|---|---|---|---|
| items | object[] | Có | Không | minItems=0. |
| page | integer | Có | Không | minimum=0, maximum=2147483647. |
| size | integer | Có | Không | minimum=1, maximum=100. |
| totalItems | integer | Có | Không | minimum=0, maximum=9007199254740991. |
| totalPages | integer | Có | Không | minimum=0, maximum=9007199254740991. |

### DTO-ApplicationPageResponse

| Field | Type/domain | Required | Nullable | Ràng buộc và ngữ nghĩa bổ sung |
|---|---|---|---|---|
| items | ApplicationResponse[] | Có | Không | minItems=0. |
| page | integer | Có | Không | minimum=0, maximum=2147483647. |
| size | integer | Có | Không | minimum=1, maximum=100. |
| totalItems | integer | Có | Không | minimum=0, maximum=9007199254740991. |
| totalPages | integer | Có | Không | minimum=0, maximum=9007199254740991. |

### DTO-EventPageResponse

| Field | Type/domain | Required | Nullable | Ràng buộc và ngữ nghĩa bổ sung |
|---|---|---|---|---|
| items | EventSummaryResponse[] | Có | Không | minItems=0. |
| page | integer | Có | Không | minimum=0, maximum=2147483647. |
| size | integer | Có | Không | minimum=1, maximum=100. |
| totalItems | integer | Có | Không | minimum=0, maximum=9007199254740991. |
| totalPages | integer | Có | Không | minimum=0, maximum=9007199254740991. |

### DTO-RulePageResponse

| Field | Type/domain | Required | Nullable | Ràng buộc và ngữ nghĩa bổ sung |
|---|---|---|---|---|
| items | MonitoringRuleResponse[] | Có | Không | minItems=0. |
| page | integer | Có | Không | minimum=0, maximum=2147483647. |
| size | integer | Có | Không | minimum=1, maximum=100. |
| totalItems | integer | Có | Không | minimum=0, maximum=9007199254740991. |
| totalPages | integer | Có | Không | minimum=0, maximum=9007199254740991. |

### DTO-IncidentPageResponse

| Field | Type/domain | Required | Nullable | Ràng buộc và ngữ nghĩa bổ sung |
|---|---|---|---|---|
| items | IncidentSummaryResponse[] | Có | Không | minItems=0. |
| page | integer | Có | Không | minimum=0, maximum=2147483647. |
| size | integer | Có | Không | minimum=1, maximum=100. |
| totalItems | integer | Có | Không | minimum=0, maximum=9007199254740991. |
| totalPages | integer | Có | Không | minimum=0, maximum=9007199254740991. |

### DTO-FieldErrorResponse

| Field | Type/domain | Required | Nullable | Ràng buộc và ngữ nghĩa bổ sung |
|---|---|---|---|---|
| field | string | Có | Không | Field/query path. minLength=1, maxLength=200, pattern=\S. |
| code | string | Có | Không | Validation code. minLength=1, maxLength=100, pattern=\S. |
| message | string | Có | Không | Safe explanation; không echo secret. minLength=1, maxLength=500, pattern=\S. |

### DTO-ApiErrorResponse

| Field | Type/domain | Required | Nullable | Ràng buộc và ngữ nghĩa bổ sung |
|---|---|---|---|---|
| code | MALFORMED_JSON / INVALID_QUERY / VALIDATION_ERROR / UNAUTHENTICATED / FORBIDDEN / RESOURCE_NOT_FOUND / VERSION_CONFLICT / INVALID_STATE_TRANSITION / REPORT_PAYLOAD_CONFLICT / IDENTITY_CONFLICT / METHOD_NOT_ALLOWED / UNSUPPORTED_MEDIA_TYPE / INTERNAL_ERROR / SERVICE_UNAVAILABLE | Có | Không | — |
| message | string | Có | Không | minLength=1, maxLength=1000, pattern=\S. |
| requestId | Id | Có | Không | Request correlation an toàn, không token. |
| fieldErrors | FieldErrorResponse[] | Có | Không | Danh sách validation errors; [] nếu không có. minItems=0. |
| currentVersion | NonNegativeInt64String / null | Có | Có | **Khi `null`: Không phải version-conflict response. |

### DTO-InternalProcessingReportRequest

| Field | Type/domain | Required | Nullable | Ràng buộc và ngữ nghĩa bổ sung |
|---|---|---|---|---|
| applicationId | Id | Có | Không | Application ownership/filter scope. |
| producerId | Id | Có | Không | — |
| eventId | Id | Có | Không | Logical event identity, namespace theo application. |
| producerAttemptId | Id | Có | Không | Identity một invocation; khác HTTP report retry. |
| producerReportId | Id | Có | Không | Identity ổn định khi retry cùng report. |
| attemptNo | integer / null | Có | Có | **Khi `null`: Chưa biết ordinal thật. |
| reportedStatus | ProcessingReportStatus | Có | Không | — |
| startedAt | UtcTimestamp / null | Có | Có | **Khi `null`: Chưa có mốc tin cậy/reconcile được. |
| finishedAt | UtcTimestamp / null | Có | Có | **Khi `null`: Chưa có mốc tin cậy/reconcile được. |
| reportedAt | UtcTimestamp | Có | Không | Producer send time. |
| errorCode | string / null | Có | Có | **Khi `null`: Không có error code. |

### DTO-InternalReportAckResponse

| Field | Type/domain | Required | Nullable | Ràng buộc và ngữ nghĩa bổ sung |
|---|---|---|---|---|
| reportId | Id | Có | Không | — |
| attemptId | Id | Có | Không | — |
| observedEventId | Id | Có | Không | FK/route identity của observed record. |
| replayed | boolean | Có | Không | true nếu cùng report ID/content đã được ghi trước đó. |
| hasReportConflict | boolean | Có | Không | Có terminal conflict chưa reconcile trong event. |

## 5. Dashboard endpoint specifications

### 5.1. GET `/api/v1/overview`

Tổng hợp event volume, processing signals, incidents và latest rule outcomes trong cùng scope snapshot.

- **UC/Screen:** UC01 / SCR-01.
- **Boundary:** D-READ theo §1.3; không service-report credential từ browser.
- **Parameters:** range: 1h/24h/7d (mặc định 24h); bucket: hour/day (mặc định hour cho 1h/24h, day cho 7d); applicationId: Id optional; latestIncidentsLimit: integer 1..5, mặc định 5. Không page/sort params.
- **Request:** Không body.
- **Success:** 200 OverviewResponse.
- **Mock:** `getOverview` theo §2.
- **Validation/semantics:** Window [asOf-range,asOf) theo occurredAt của OBSERVED events; optional app filter. Stats confirmed từ processing projection; open=OPEN hoặc INVESTIGATING gắn các events trong scope, openedAt≤asOf; unknown đếm latest persisted evaluations outcome UNKNOWN của scope (evaluatedAt≤asOf). Các cards không dùng mọi historical revisions. latestIncidents gồm mọi status, cùng scope, sort openedAt DESC/id ASC rồi limit. Bucket UTC hour/day, bao gồm zero buckets; first/last partial đếm intersection với window. Sum(bucket.count)=observedEvents. Không count attempts hoặc hardcode seed totals.
- **Errors:** 400 INVALID_QUERY; 401/403 theo protected boundary; 500 INTERNAL_ERROR; 503 SERVICE_UNAVAILABLE.
- **Acceptance:** AC-API01: default full dataset có 30/18/3/26; range=1h về core subset 5/3/1/4; sum volume đúng; resolve chỉ đổi open count. Latest limit không đổi cards.

```http
GET /api/v1/overview?range=24h&bucket=hour&latestIncidentsLimit=1
```

**Response JSON (200)**

<!-- schema: OverviewResponse -->
```json
{
  "range": "24h",
  "bucket": "hour",
  "applicationId": null,
  "asOf": "2026-10-17T10:10:00Z",
  "windowStart": "2026-10-16T10:10:00Z",
  "windowEnd": "2026-10-17T10:10:00Z",
  "stats": {
    "observedEvents": 30,
    "confirmedProcessing": 18,
    "openIncidents": 3,
    "unknownEvaluations": 26
  },
  "volumeBuckets": [
    {
      "startAt": "2026-10-16T10:00:00Z",
      "endAt": "2026-10-16T11:00:00Z",
      "count": 0,
      "partial": true
    },
    {
      "startAt": "2026-10-16T11:00:00Z",
      "endAt": "2026-10-16T12:00:00Z",
      "count": 0,
      "partial": false
    },
    {
      "startAt": "2026-10-16T12:00:00Z",
      "endAt": "2026-10-16T13:00:00Z",
      "count": 0,
      "partial": false
    },
    {
      "startAt": "2026-10-16T13:00:00Z",
      "endAt": "2026-10-16T14:00:00Z",
      "count": 0,
      "partial": false
    },
    {
      "startAt": "2026-10-16T14:00:00Z",
      "endAt": "2026-10-16T15:00:00Z",
      "count": 0,
      "partial": false
    },
    {
      "startAt": "2026-10-16T15:00:00Z",
      "endAt": "2026-10-16T16:00:00Z",
      "count": 0,
      "partial": false
    },
    {
      "startAt": "2026-10-16T16:00:00Z",
      "endAt": "2026-10-16T17:00:00Z",
      "count": 0,
      "partial": false
    },
    {
      "startAt": "2026-10-16T17:00:00Z",
      "endAt": "2026-10-16T18:00:00Z",
      "count": 0,
      "partial": false
    },
    {
      "startAt": "2026-10-16T18:00:00Z",
      "endAt": "2026-10-16T19:00:00Z",
      "count": 15,
      "partial": false
    },
    {
      "startAt": "2026-10-16T19:00:00Z",
      "endAt": "2026-10-16T20:00:00Z",
      "count": 0,
      "partial": false
    },
    {
      "startAt": "2026-10-16T20:00:00Z",
      "endAt": "2026-10-16T21:00:00Z",
      "count": 0,
      "partial": false
    },
    {
      "startAt": "2026-10-16T21:00:00Z",
      "endAt": "2026-10-16T22:00:00Z",
      "count": 0,
      "partial": false
    },
    {
      "startAt": "2026-10-16T22:00:00Z",
      "endAt": "2026-10-16T23:00:00Z",
      "count": 0,
      "partial": false
    },
    {
      "startAt": "2026-10-16T23:00:00Z",
      "endAt": "2026-10-17T00:00:00Z",
      "count": 0,
      "partial": false
    },
    {
      "startAt": "2026-10-17T00:00:00Z",
      "endAt": "2026-10-17T01:00:00Z",
      "count": 0,
      "partial": false
    },
    {
      "startAt": "2026-10-17T01:00:00Z",
      "endAt": "2026-10-17T02:00:00Z",
      "count": 0,
      "partial": false
    },
    {
      "startAt": "2026-10-17T02:00:00Z",
      "endAt": "2026-10-17T03:00:00Z",
      "count": 0,
      "partial": false
    },
    {
      "startAt": "2026-10-17T03:00:00Z",
      "endAt": "2026-10-17T04:00:00Z",
      "count": 0,
      "partial": false
    },
    {
      "startAt": "2026-10-17T04:00:00Z",
      "endAt": "2026-10-17T05:00:00Z",
      "count": 0,
      "partial": false
    },
    {
      "startAt": "2026-10-17T05:00:00Z",
      "endAt": "2026-10-17T06:00:00Z",
      "count": 0,
      "partial": false
    },
    {
      "startAt": "2026-10-17T06:00:00Z",
      "endAt": "2026-10-17T07:00:00Z",
      "count": 0,
      "partial": false
    },
    {
      "startAt": "2026-10-17T07:00:00Z",
      "endAt": "2026-10-17T08:00:00Z",
      "count": 0,
      "partial": false
    },
    {
      "startAt": "2026-10-17T08:00:00Z",
      "endAt": "2026-10-17T09:00:00Z",
      "count": 0,
      "partial": false
    },
    {
      "startAt": "2026-10-17T09:00:00Z",
      "endAt": "2026-10-17T10:00:00Z",
      "count": 10,
      "partial": false
    },
    {
      "startAt": "2026-10-17T10:00:00Z",
      "endAt": "2026-10-17T11:00:00Z",
      "count": 5,
      "partial": true
    }
  ],
  "latestIncidents": [
    {
      "id": "inc-001",
      "applicationId": "app-001",
      "applicationName": "Loyalty Sandbox",
      "observedEventId": "evt-003",
      "eventId": "order-paid-1003",
      "primaryRule": {
        "id": "rule-002",
        "ruleType": "DUPLICATE_BUSINESS_EFFECT",
        "name": "No duplicate business effects"
      },
      "severity": "HIGH",
      "status": "OPEN",
      "summary": "Hai loyalty effects cùng logical event",
      "openedAt": "2026-10-17T10:10:00Z",
      "resolvedAt": null,
      "version": "0"
    }
  ]
}
```

### 5.2. GET `/api/v1/applications`

Danh sách application configurations, không mô tả kết nối production.

- **UC/Screen:** UC02 / SCR-02.
- **Boundary:** D-READ theo §1.3; không service-report credential từ browser.
- **Parameters:** page, size, sort theo §1.2; không có query khác.
- **Request:** Không body.
- **Success:** 200 ApplicationPageResponse.
- **Mock:** `listApplications` theo §2.
- **Validation/semantics:** Trả tên/environment/status theo shared state. ACTIVE không chứng minh service đang online.
- **Errors:** 400 INVALID_QUERY; common protected/500/503 errors.
- **Acceptance:** AC-API02: paging ổn định; app mới xuất hiện ở list và lựa chọn filter Events, không tự có event.

```http
GET /api/v1/applications?page=0&size=1
```

**Response JSON (200)**

<!-- schema: ApplicationPageResponse -->
```json
{
  "items": [
    {
      "id": "app-001",
      "name": "Loyalty Sandbox",
      "environment": "SANDBOX",
      "status": "ACTIVE",
      "createdAt": "2026-10-15T00:00:00Z"
    }
  ],
  "page": 0,
  "size": 1,
  "totalItems": 2,
  "totalPages": 2
}
```

### 5.3. POST `/api/v1/applications`

Tạo một application configuration với server-generated ID.

- **UC/Screen:** UC02 / SCR-02.
- **Boundary:** D-WRITE theo §1.3; không service-report credential từ browser.
- **Parameters:** Không query/path params.
- **Request:** CreateApplicationRequest; body application/json.
- **Success:** 201 ApplicationResponse.
- **Mock:** `createApplication` theo §2.
- **Validation/semantics:** name trim 1..100; environment SANDBOX/DEVELOPMENT bắt buộc; không credential/URL/script/readonly fields. Default status ACTIVE, createdAt từ server/logical clock. Tên trùng được phép; không áp UNIQUE name không có trong schema. POST lặp có thể tạo resource khác, không tự retry khi mất ack.
- **Errors:** 400 MALFORMED_JSON/VALIDATION_ERROR; 415; common protected/500/503 errors. Không 409 chỉ vì trùng tên.
- **Acceptance:** AC-API03: invalid/cancel/injected save failure không tạo row; success tạo đúng một app, chưa tạo events/subscriptions/credentials.

```http
POST /api/v1/applications
```

**Request JSON**

<!-- schema: CreateApplicationRequest -->
```json
{
  "name": "Loyalty Local",
  "environment": "DEVELOPMENT"
}
```


**Response JSON (201)**

<!-- schema: ApplicationResponse -->
```json
{
  "id": "app-new-001",
  "name": "Loyalty Local",
  "environment": "DEVELOPMENT",
  "status": "ACTIVE",
  "createdAt": "2026-10-17T10:10:00.001Z"
}
```

### 5.4. GET `/api/v1/events`

Tìm event theo logical identity, application và processing projection.

- **UC/Screen:** UC03-A / SCR-03.
- **Boundary:** D-READ theo §1.3; không service-report credential từ browser.
- **Parameters:** search: string ≤128, trim + case-insensitive literal substring eventId (không SQL wildcard/regex); applicationId: Id optional; status: ProcessingStatus optional; page,size,sort theo §1.2.
- **Request:** Không body.
- **Success:** 200 EventPageResponse.
- **Mock:** `listEvents` theo §2.
- **Validation/semantics:** AND toàn filters trước paging. Không phân biệt hoa/thường ở search nhưng ID path/app vẫn exact. Trả observed records, gồm REPORTED_ONLY nếu runtime có, và giữ nullable canonical metadata. Card overview chỉ OBSERVED. Không aggregate evaluationStatus; từng rule result riêng.
- **Errors:** 400 INVALID_QUERY; unknown valid application filter trả empty; common protected/500/503 errors.
- **Acceptance:** AC-API04: search " ORDER-PAID-1003 " cùng app-001/status CONFIRMED trả evt-003; status UNKNOWN không gộp FAILED; clear filters/reset page hoạt động.

```http
GET /api/v1/events?search=order-paid-1003&applicationId=app-001&status=CONFIRMED
```

**Response JSON (200)**

<!-- schema: EventPageResponse -->
```json
{
  "items": [
    {
      "id": "evt-003",
      "eventId": "order-paid-1003",
      "applicationId": "app-001",
      "applicationName": "Loyalty Sandbox",
      "eventType": "ORDER_PAID",
      "correlationId": "ord-1003",
      "occurredAt": "2026-10-17T10:02:00Z",
      "observationStatus": "OBSERVED",
      "processingStatus": "CONFIRMED",
      "processingStatusReason": "Một trusted attempt báo SUCCEEDED; business rules vẫn có thể vi phạm.",
      "reportedAttemptCount": 1,
      "hasReportConflict": false,
      "evaluationState": "CURRENT",
      "ruleResults": [
        {
          "evaluationId": "eval-003-001-g1",
          "ruleId": "rule-001",
          "ruleType": "TIMEOUT",
          "outcome": "PASS",
          "reasonCode": "COMPLETED_WITHIN_THRESHOLD",
          "evaluatedAt": "2026-10-17T10:10:00Z"
        },
        {
          "evaluationId": "eval-003-002-g1",
          "ruleId": "rule-002",
          "ruleType": "DUPLICATE_BUSINESS_EFFECT",
          "outcome": "VIOLATION",
          "reasonCode": "DUPLICATE_EFFECTS_PROVEN",
          "evaluatedAt": "2026-10-17T10:10:00Z"
        },
        {
          "evaluationId": "eval-003-003-g1",
          "ruleId": "rule-003",
          "ruleType": "DATA_INVARIANT",
          "outcome": "VIOLATION",
          "reasonCode": "TOTAL_DELTA_MISMATCH",
          "evaluatedAt": "2026-10-17T10:10:00Z"
        }
      ],
      "relatedIncidentId": "inc-001"
    }
  ],
  "page": 0,
  "size": 10,
  "totalItems": 1,
  "totalPages": 1
}
```

### 5.5. GET `/api/v1/events/{id}`

Aggregate đủ metadata, attempts, reports, evaluation revisions, evidence/gaps và related incident bằng một request.

- **UC/Screen:** UC03-A/B/C / SCR-04.
- **Boundary:** D-READ theo §1.3; không service-report credential từ browser.
- **Parameters:** {id}: Id bản ghi observed event; không query params.
- **Request:** Không body.
- **Success:** 200 EventDetailResponse.
- **Mock:** `getEventDetail` theo §2.
- **Validation/semantics:** Path sai syntax 400; hợp lệ nhưng không tồn tại 404. Aggregate arrays nhất quán cùng response snapshot: attempts sort startedAt ASC/null cuối/ID; reports receivedAt ASC/ID; evaluations inputGeneration DESC, ruleId ASC, ID ASC; evidence collectedAt ASC/ID. isLatest theo từng rule/event. RuleResults refs tới các latest evaluation IDs. Không tạo attempt thiếu report, không dùng ledger để dựng finishedAt.
- **Errors:** 400 VALIDATION_ERROR hoặc INVALID_QUERY; 404 RESOURCE_NOT_FOUND; common protected/500/503 errors.
- **Acceptance:** AC-API05: evt-003 có 2 effect IDs và inc-001; evt-004/005 attempts/reports=[]; evt-010 có conflict và history; evidence refs đều resolve.

```http
GET /api/v1/events/evt-003
```

**Response JSON (200)**

<!-- schema: EventDetailResponse -->
```json
{
  "id": "evt-003",
  "eventId": "order-paid-1003",
  "applicationId": "app-001",
  "applicationName": "Loyalty Sandbox",
  "eventType": "ORDER_PAID",
  "correlationId": "ord-1003",
  "occurredAt": "2026-10-17T10:02:00Z",
  "observationStatus": "OBSERVED",
  "processingStatus": "CONFIRMED",
  "processingStatusReason": "Một trusted attempt báo SUCCEEDED; business rules vẫn có thể vi phạm.",
  "reportedAttemptCount": 1,
  "hasReportConflict": false,
  "evaluationState": "CURRENT",
  "ruleResults": [
    {
      "evaluationId": "eval-003-001-g1",
      "ruleId": "rule-001",
      "ruleType": "TIMEOUT",
      "outcome": "PASS",
      "reasonCode": "COMPLETED_WITHIN_THRESHOLD",
      "evaluatedAt": "2026-10-17T10:10:00Z"
    },
    {
      "evaluationId": "eval-003-002-g1",
      "ruleId": "rule-002",
      "ruleType": "DUPLICATE_BUSINESS_EFFECT",
      "outcome": "VIOLATION",
      "reasonCode": "DUPLICATE_EFFECTS_PROVEN",
      "evaluatedAt": "2026-10-17T10:10:00Z"
    },
    {
      "evaluationId": "eval-003-003-g1",
      "ruleId": "rule-003",
      "ruleType": "DATA_INVARIANT",
      "outcome": "VIOLATION",
      "reasonCode": "TOTAL_DELTA_MISMATCH",
      "evaluatedAt": "2026-10-17T10:10:00Z"
    }
  ],
  "relatedIncidentId": "inc-001",
  "customerRef": "cust-demo-001",
  "expectedPoints": "100",
  "evidenceSourceKey": "loyalty-fault-v1",
  "firstSeenAt": "2026-10-17T10:02:01Z",
  "evaluationGeneration": "1",
  "evaluatedGeneration": "1",
  "attempts": [
    {
      "id": "att-003-1",
      "producerAttemptId": "producer-att-003-1",
      "attemptNo": 1,
      "status": "SUCCEEDED",
      "startedAt": "2026-10-17T10:02:01Z",
      "finishedAt": "2026-10-17T10:02:02Z",
      "reportIds": [
        "rpt-003-1"
      ],
      "hasTerminalConflict": false
    }
  ],
  "reports": [
    {
      "id": "rpt-003-1",
      "attemptId": "att-003-1",
      "producerReportId": "producer-rpt-003-1",
      "reportedStatus": "SUCCEEDED",
      "startedAt": "2026-10-17T10:02:01Z",
      "finishedAt": "2026-10-17T10:02:02Z",
      "reportedAt": "2026-10-17T10:02:02Z",
      "receivedAt": "2026-10-17T10:02:03Z",
      "errorCode": null
    }
  ],
  "evaluations": [
    {
      "id": "eval-003-001-g1",
      "observedEventId": "evt-003",
      "ruleId": "rule-001",
      "ruleType": "TIMEOUT",
      "ruleVersion": "1",
      "configSnapshot": {
        "thresholdSeconds": 60,
        "completionBasis": "FIRST_TRUSTED_SUCCESS"
      },
      "inputGeneration": "1",
      "outcome": "PASS",
      "reasonCode": "COMPLETED_WITHIN_THRESHOLD",
      "reason": "Trusted completion 2 giây, không vượt 60 giây.",
      "evaluatedAt": "2026-10-17T10:10:00Z",
      "evidenceIds": [
        "ev-003-report"
      ],
      "isLatest": true
    },
    {
      "id": "eval-003-002-g1",
      "observedEventId": "evt-003",
      "ruleId": "rule-002",
      "ruleType": "DUPLICATE_BUSINESS_EFFECT",
      "ruleVersion": "1",
      "configSnapshot": {
        "maxEffects": 1,
        "sourcePolicy": "EVENT_BOUND_SOURCE"
      },
      "inputGeneration": "1",
      "outcome": "VIOLATION",
      "reasonCode": "DUPLICATE_EFFECTS_PROVEN",
      "reason": "Hai distinct effect IDs cùng event và sandbox run.",
      "evaluatedAt": "2026-10-17T10:10:00Z",
      "evidenceIds": [
        "ev-003-ledger"
      ],
      "isLatest": true
    },
    {
      "id": "eval-003-003-g1",
      "observedEventId": "evt-003",
      "ruleId": "rule-003",
      "ruleType": "DATA_INVARIANT",
      "ruleVersion": "1",
      "configSnapshot": {
        "expectedSource": "ORDER_EXPECTATION",
        "comparison": "TOTAL_DELTA_EQUALS_EXPECTED"
      },
      "inputGeneration": "1",
      "outcome": "VIOLATION",
      "reasonCode": "TOTAL_DELTA_MISMATCH",
      "reason": "Tổng +200 khác expected +100.",
      "evaluatedAt": "2026-10-17T10:10:00Z",
      "evidenceIds": [
        "ev-003-ledger"
      ],
      "isLatest": true
    }
  ],
  "evidence": [
    {
      "id": "ev-003-report",
      "observedEventId": "evt-003",
      "kind": "REPORT_BATCH",
      "sourceKey": "processing-report",
      "sourceLabel": "Authenticated demo report",
      "scope": {
        "eventId": "order-paid-1003",
        "customerRef": "cust-demo-001",
        "runId": null
      },
      "coverage": "COMPLETE",
      "trust": "TRUSTED",
      "finality": "UNKNOWN",
      "snapshotAt": "2026-10-17T10:02:02Z",
      "collectedAt": "2026-10-17T10:02:03Z",
      "supersedesEvidenceId": null,
      "ledger": null,
      "reportIds": [
        "rpt-003-1"
      ],
      "gaps": []
    },
    {
      "id": "ev-003-ledger",
      "observedEventId": "evt-003",
      "kind": "LEDGER_SNAPSHOT",
      "sourceKey": "loyalty-fault-v1",
      "sourceLabel": "Sandbox injected faulty ledger",
      "scope": {
        "eventId": "order-paid-1003",
        "customerRef": "cust-demo-001",
        "runId": "run-ds03"
      },
      "coverage": "COMPLETE",
      "trust": "TRUSTED",
      "finality": "FINAL",
      "snapshotAt": "2026-10-17T10:10:00Z",
      "collectedAt": "2026-10-17T10:10:00Z",
      "supersedesEvidenceId": null,
      "ledger": {
        "expectedPoints": "100",
        "effectCount": 2,
        "totalDelta": "200",
        "effects": [
          {
            "id": "eff-003-1",
            "eventId": "order-paid-1003",
            "customerRef": "cust-demo-001",
            "delta": "100",
            "createdAt": "2026-10-17T10:02:02Z"
          },
          {
            "id": "eff-003-2",
            "eventId": "order-paid-1003",
            "customerRef": "cust-demo-001",
            "delta": "100",
            "createdAt": "2026-10-17T10:02:02Z"
          }
        ]
      },
      "reportIds": [],
      "gaps": []
    }
  ]
}
```

### 5.6. GET `/api/v1/rules`

Đọc cấu hình rule instances, enabled và existing related links.

- **UC/Screen:** UC04 / SCR-05.
- **Boundary:** D-READ theo §1.3; không service-report credential từ browser.
- **Parameters:** applicationId: Id optional; page,size,sort theo §1.2. Không arbitrary SQL/type expression query.
- **Request:** Không body.
- **Success:** 200 RulePageResponse.
- **Mock:** `listRules` theo §2.
- **Validation/semantics:** Cùng app có nhiều instances cùng ruleType. Related event previews sort occurredAt DESC/id ASC, incident previews openedAt DESC/id ASC, mỗi nhóm tối đa ba IDs có thật; không hứa đủ mọi record. Related links mở trực tiếp detail endpoints.
- **Errors:** 400 INVALID_QUERY; common protected/500/503 errors.
- **Acceptance:** AC-API06: full fixture có 6 rules; đủ 3 rule types; list phản ánh toggle, không thay historical evals.

```http
GET /api/v1/rules?applicationId=app-001&page=0&size=1&sort=name,desc
```

**Response JSON (200)**

<!-- schema: RulePageResponse -->
```json
{
  "items": [
    {
      "id": "rule-001",
      "applicationId": "app-001",
      "ruleType": "TIMEOUT",
      "name": "Processing within 60 seconds",
      "description": "Dựa trên trusted successful completion.",
      "config": {
        "thresholdSeconds": 60,
        "completionBasis": "FIRST_TRUSTED_SUCCESS"
      },
      "enabled": true,
      "configVersion": "1",
      "updatedAt": "2026-10-15T00:00:00Z",
      "relatedEventIds": [
        "evt-005",
        "evt-004",
        "evt-003"
      ],
      "relatedIncidentIds": [
        "inc-003"
      ]
    }
  ],
  "page": 0,
  "size": 1,
  "totalItems": 3,
  "totalPages": 3
}
```

### 5.7. POST `/api/v1/rules`

Tạo instance cấu hình của built-in rule type, không tạo code/SQL evaluator.

- **UC/Screen:** UC04 contract / SCR-05 không yêu cầu Create UI.
- **Boundary:** D-WRITE theo §1.3; không service-report credential từ browser.
- **Parameters:** Không query/path params.
- **Request:** CreateRuleRequest; body application/json.
- **Success:** 201 MonitoringRuleResponse.
- **Mock:** `createRule` theo §2.
- **Validation/semantics:** applicationId hiện có; name trim 1..100; description optional≤500/default ""; config bắt buộc đúng discriminated ruleType: TIMEOUT thresholdSeconds integer 1..86400 + FIRST_TRUSTED_SUCCESS; DUPLICATE maxEffects=1 + EVENT_BOUND_SOURCE; DATA_INVARIANT ORDER_EXPECTATION + TOTAL_DELTA_EQUALS_EXPECTED. enabled optional/default true; initial configVersion="1". Server-generated ID. Nhiều cùng app/type kể cả identical config/name được phép; không UNIQUE(app,type), không 409 duplicate config giả. New rule không tự sinh/recompute historical evaluations hoặc incidents.
- **Errors:** 400 MALFORMED_JSON/VALIDATION_ERROR nếu config sai type, unknown params/SQL/script; 404 RESOURCE_NOT_FOUND nếu application không tồn tại; 415; common protected/500/503 errors.
- **Acceptance:** AC-API07: tạo từng 3 type hợp lệ; config của type khác bị từ chối; same app/type tạo instance mới; tạo rule không đổi 90 latest fixture evaluations.

```http
POST /api/v1/rules
```

**Request JSON**

<!-- schema: CreateRuleRequest -->
```json
{
  "applicationId": "app-001",
  "ruleType": "DUPLICATE_BUSINESS_EFFECT",
  "name": "Duplicate detection v2",
  "description": "Instance độc lập, không custom script.",
  "config": {
    "maxEffects": 1,
    "sourcePolicy": "EVENT_BOUND_SOURCE"
  },
  "enabled": true
}
```


**Response JSON (201)**

<!-- schema: MonitoringRuleResponse -->
```json
{
  "id": "rule-new-001",
  "applicationId": "app-001",
  "ruleType": "DUPLICATE_BUSINESS_EFFECT",
  "name": "Duplicate detection v2",
  "description": "Instance độc lập, không custom script.",
  "config": {
    "maxEffects": 1,
    "sourcePolicy": "EVENT_BOUND_SOURCE"
  },
  "enabled": true,
  "configVersion": "1",
  "updatedAt": "2026-10-17T10:10:00.001Z",
  "relatedEventIds": [],
  "relatedIncidentIds": []
}
```

### 5.8. PATCH `/api/v1/rules/{id}`

Đặt enabled state của instance hiện có.

- **UC/Screen:** UC04 / SCR-05.
- **Boundary:** D-WRITE theo §1.3; không service-report credential từ browser.
- **Parameters:** {id}: rule ID; không query params.
- **Request:** UpdateRuleRequest; body application/json.
- **Success:** 200 MonitoringRuleResponse.
- **Mock:** `updateRule` theo §2.
- **Validation/semantics:** Body chỉ enabled boolean bắt buộc. Không đổi name/type/config/application/configVersion bằng endpoint này. Desired state đã đúng →200 resource hiện tại, không đổi updatedAt; state đổi thì updatedAt đổi nhưng semantic configVersion giữ nguyên. Không thêm evaluations, không auto resolve/backfill.
- **Errors:** 400 body/path/query validation; 404 RESOURCE_NOT_FOUND; 415; common protected/500/503 errors.
- **Acceptance:** AC-API08: toggle giữ khi điều hướng; failure giữ old state; gửi lại desired enabled không tạo history/evaluation. Pending UI chặn thao tác lặp.

```http
PATCH /api/v1/rules/rule-001
```

**Request JSON**

<!-- schema: UpdateRuleRequest -->
```json
{
  "enabled": false
}
```


**Response JSON (200)**

<!-- schema: MonitoringRuleResponse -->
```json
{
  "id": "rule-001",
  "applicationId": "app-001",
  "ruleType": "TIMEOUT",
  "name": "Processing within 60 seconds",
  "description": "Dựa trên trusted successful completion.",
  "config": {
    "thresholdSeconds": 60,
    "completionBasis": "FIRST_TRUSTED_SUCCESS"
  },
  "enabled": false,
  "configVersion": "1",
  "updatedAt": "2026-10-17T10:10:00.001Z",
  "relatedEventIds": [
    "evt-005",
    "evt-004",
    "evt-003"
  ],
  "relatedIncidentIds": [
    "inc-003"
  ]
}
```

### 5.9. GET `/api/v1/incidents`

Lọc hồ sơ theo workflow và severity.

- **UC/Screen:** UC05 / SCR-06.
- **Boundary:** D-READ theo §1.3; không service-report credential từ browser.
- **Parameters:** status: IncidentStatus optional; severity: MEDIUM/HIGH optional; applicationId: Id optional; page,size,sort theo §1.2.
- **Request:** Không body.
- **Success:** 200 IncidentPageResponse.
- **Mock:** `listIncidents` theo §2.
- **Validation/semantics:** Filters AND trước totals/page; RESOLVED vẫn trong dataset và chỉ rời OPEN/INVESTIGATING filter. Không search/status enum chung với events.
- **Errors:** 400 INVALID_QUERY; common protected/500/503 errors.
- **Acceptance:** AC-API09: status=OPEN & severity=HIGH trả inc-001; resolving một case không xóa row hoặc linked VIOLATION.

```http
GET /api/v1/incidents?status=OPEN&severity=HIGH
```

**Response JSON (200)**

<!-- schema: IncidentPageResponse -->
```json
{
  "items": [
    {
      "id": "inc-001",
      "applicationId": "app-001",
      "applicationName": "Loyalty Sandbox",
      "observedEventId": "evt-003",
      "eventId": "order-paid-1003",
      "primaryRule": {
        "id": "rule-002",
        "ruleType": "DUPLICATE_BUSINESS_EFFECT",
        "name": "No duplicate business effects"
      },
      "severity": "HIGH",
      "status": "OPEN",
      "summary": "Hai loyalty effects cùng logical event",
      "openedAt": "2026-10-17T10:10:00Z",
      "resolvedAt": null,
      "version": "0"
    }
  ],
  "page": 0,
  "size": 10,
  "totalItems": 1,
  "totalPages": 1
}
```

### 5.10. GET `/api/v1/incidents/{id}`

Aggregate primary rule, event link, historical violation evaluations, evidence và workflow history.

- **UC/Screen:** UC05 / SCR-07.
- **Boundary:** D-READ theo §1.3; không service-report credential từ browser.
- **Parameters:** {id}: incident record ID; không query params.
- **Request:** Không body.
- **Success:** 200 IncidentDetailResponse.
- **Mock:** `getIncidentDetail` theo §2.
- **Validation/semantics:** Linked event/evaluations/evidence cùng observed event/application; linkedEvaluations sort evaluatedAt ASC/ruleId ASC/id; history createdAt ASC/id; evidence collectedAt ASC/id. RESOLVED vẫn giữ evidence +200 và VIOLATION. Nullable resolvedAt iff status khác RESOLVED.
- **Errors:** 400 path/query validation; 404 RESOURCE_NOT_FOUND; common protected/500/503 errors.
- **Acceptance:** AC-API10: inc-001 có primary rule-002, hai violation links cùng evt-003, không tạo case thứ hai cho rule-003; missing ID hiện Incident Not Found.

```http
GET /api/v1/incidents/inc-001
```

**Response JSON (200)**

<!-- schema: IncidentDetailResponse -->
```json
{
  "id": "inc-001",
  "applicationId": "app-001",
  "applicationName": "Loyalty Sandbox",
  "observedEventId": "evt-003",
  "eventId": "order-paid-1003",
  "primaryRule": {
    "id": "rule-002",
    "ruleType": "DUPLICATE_BUSINESS_EFFECT",
    "name": "No duplicate business effects"
  },
  "severity": "HIGH",
  "status": "OPEN",
  "summary": "Hai loyalty effects cùng logical event",
  "openedAt": "2026-10-17T10:10:00Z",
  "resolvedAt": null,
  "version": "0",
  "explanation": "Một hồ sơ cho observed event, hai linked violation evaluations; RESOLVED không sửa +200.",
  "updatedAt": "2026-10-17T10:10:00Z",
  "linkedEvent": {
    "id": "evt-003",
    "eventId": "order-paid-1003",
    "applicationId": "app-001",
    "applicationName": "Loyalty Sandbox",
    "eventType": "ORDER_PAID",
    "correlationId": "ord-1003",
    "occurredAt": "2026-10-17T10:02:00Z",
    "observationStatus": "OBSERVED",
    "processingStatus": "CONFIRMED",
    "processingStatusReason": "Một trusted attempt báo SUCCEEDED; business rules vẫn có thể vi phạm.",
    "reportedAttemptCount": 1,
    "hasReportConflict": false,
    "evaluationState": "CURRENT",
    "ruleResults": [
      {
        "evaluationId": "eval-003-001-g1",
        "ruleId": "rule-001",
        "ruleType": "TIMEOUT",
        "outcome": "PASS",
        "reasonCode": "COMPLETED_WITHIN_THRESHOLD",
        "evaluatedAt": "2026-10-17T10:10:00Z"
      },
      {
        "evaluationId": "eval-003-002-g1",
        "ruleId": "rule-002",
        "ruleType": "DUPLICATE_BUSINESS_EFFECT",
        "outcome": "VIOLATION",
        "reasonCode": "DUPLICATE_EFFECTS_PROVEN",
        "evaluatedAt": "2026-10-17T10:10:00Z"
      },
      {
        "evaluationId": "eval-003-003-g1",
        "ruleId": "rule-003",
        "ruleType": "DATA_INVARIANT",
        "outcome": "VIOLATION",
        "reasonCode": "TOTAL_DELTA_MISMATCH",
        "evaluatedAt": "2026-10-17T10:10:00Z"
      }
    ],
    "relatedIncidentId": "inc-001"
  },
  "linkedEvaluations": [
    {
      "id": "eval-003-002-g1",
      "observedEventId": "evt-003",
      "ruleId": "rule-002",
      "ruleType": "DUPLICATE_BUSINESS_EFFECT",
      "ruleVersion": "1",
      "configSnapshot": {
        "maxEffects": 1,
        "sourcePolicy": "EVENT_BOUND_SOURCE"
      },
      "inputGeneration": "1",
      "outcome": "VIOLATION",
      "reasonCode": "DUPLICATE_EFFECTS_PROVEN",
      "reason": "Hai distinct effect IDs cùng event và sandbox run.",
      "evaluatedAt": "2026-10-17T10:10:00Z",
      "evidenceIds": [
        "ev-003-ledger"
      ],
      "isLatest": true
    },
    {
      "id": "eval-003-003-g1",
      "observedEventId": "evt-003",
      "ruleId": "rule-003",
      "ruleType": "DATA_INVARIANT",
      "ruleVersion": "1",
      "configSnapshot": {
        "expectedSource": "ORDER_EXPECTATION",
        "comparison": "TOTAL_DELTA_EQUALS_EXPECTED"
      },
      "inputGeneration": "1",
      "outcome": "VIOLATION",
      "reasonCode": "TOTAL_DELTA_MISMATCH",
      "reason": "Tổng +200 khác expected +100.",
      "evaluatedAt": "2026-10-17T10:10:00Z",
      "evidenceIds": [
        "ev-003-ledger"
      ],
      "isLatest": true
    }
  ],
  "evidence": [
    {
      "id": "ev-003-ledger",
      "observedEventId": "evt-003",
      "kind": "LEDGER_SNAPSHOT",
      "sourceKey": "loyalty-fault-v1",
      "sourceLabel": "Sandbox injected faulty ledger",
      "scope": {
        "eventId": "order-paid-1003",
        "customerRef": "cust-demo-001",
        "runId": "run-ds03"
      },
      "coverage": "COMPLETE",
      "trust": "TRUSTED",
      "finality": "FINAL",
      "snapshotAt": "2026-10-17T10:10:00Z",
      "collectedAt": "2026-10-17T10:10:00Z",
      "supersedesEvidenceId": null,
      "ledger": {
        "expectedPoints": "100",
        "effectCount": 2,
        "totalDelta": "200",
        "effects": [
          {
            "id": "eff-003-1",
            "eventId": "order-paid-1003",
            "customerRef": "cust-demo-001",
            "delta": "100",
            "createdAt": "2026-10-17T10:02:02Z"
          },
          {
            "id": "eff-003-2",
            "eventId": "order-paid-1003",
            "customerRef": "cust-demo-001",
            "delta": "100",
            "createdAt": "2026-10-17T10:02:02Z"
          }
        ]
      },
      "reportIds": [],
      "gaps": []
    }
  ],
  "history": [
    {
      "id": "hist-001-1",
      "action": "CREATED",
      "fromStatus": null,
      "toStatus": "OPEN",
      "actorRef": "system",
      "note": "Duplicate và invariant evaluations vi phạm.",
      "createdAt": "2026-10-17T10:10:00Z"
    }
  ]
}
```

### 5.11. PATCH `/api/v1/incidents/{id}/status`

Thay trạng thái hồ sơ bằng optimistic concurrency và history atomic.

- **UC/Screen:** UC05 / SCR-07.
- **Boundary:** D-WRITE theo §1.3; không service-report credential từ browser.
- **Parameters:** {id}: incident record ID; không query params.
- **Request:** UpdateIncidentStatusRequest; body application/json.
- **Success:** 200 IncidentDetailResponse.
- **Mock:** `updateIncidentStatus` theo §2.
- **Validation/semantics:** Body status + expectedVersion decimal string bắt buộc, note optional≤500. Thứ tự kiểm: auth/parse → resource → expectedVersion → transition. Stale version luôn409 VERSION_CONFLICT kể cả requested status hiện đã đúng. Version khớp và same status →200/no-op, không tăng version/history/clock. Transition chỉ OPEN→INVESTIGATING→RESOLVED; cấm OPEN→RESOLVED và mọi reopen. Success transition version+1, updatedAt/history cùng transaction; RESOLVED ghi resolvedAt, còn lại null. Khi retry sau mất ack, 409 yêu cầu tải lại detail trước quyết định tiếp.
- **Errors:** 400 malformed/body/path/query; 404; 409 VERSION_CONFLICT hoặc INVALID_STATE_TRANSITION; 415; common protected/500/503 errors.
- **Acceptance:** AC-API11: expectedVersion="0", OPEN→INVESTIGATING trả version="1" và thêm đúng một history; stale request409 không thêm history; resolve giảm open count mà giữ evidence/evaluations.

```http
PATCH /api/v1/incidents/inc-001/status
```

**Request JSON**

<!-- schema: UpdateIncidentStatusRequest -->
```json
{
  "status": "INVESTIGATING",
  "expectedVersion": "0",
  "note": "Bắt đầu điều tra ledger."
}
```


**Response JSON (200)**

<!-- schema: IncidentDetailResponse -->
```json
{
  "id": "inc-001",
  "applicationId": "app-001",
  "applicationName": "Loyalty Sandbox",
  "observedEventId": "evt-003",
  "eventId": "order-paid-1003",
  "primaryRule": {
    "id": "rule-002",
    "ruleType": "DUPLICATE_BUSINESS_EFFECT",
    "name": "No duplicate business effects"
  },
  "severity": "HIGH",
  "status": "INVESTIGATING",
  "summary": "Hai loyalty effects cùng logical event",
  "openedAt": "2026-10-17T10:10:00Z",
  "resolvedAt": null,
  "version": "1",
  "explanation": "Một hồ sơ cho observed event, hai linked violation evaluations; RESOLVED không sửa +200.",
  "updatedAt": "2026-10-17T10:10:00.001Z",
  "linkedEvent": {
    "id": "evt-003",
    "eventId": "order-paid-1003",
    "applicationId": "app-001",
    "applicationName": "Loyalty Sandbox",
    "eventType": "ORDER_PAID",
    "correlationId": "ord-1003",
    "occurredAt": "2026-10-17T10:02:00Z",
    "observationStatus": "OBSERVED",
    "processingStatus": "CONFIRMED",
    "processingStatusReason": "Một trusted attempt báo SUCCEEDED; business rules vẫn có thể vi phạm.",
    "reportedAttemptCount": 1,
    "hasReportConflict": false,
    "evaluationState": "CURRENT",
    "ruleResults": [
      {
        "evaluationId": "eval-003-001-g1",
        "ruleId": "rule-001",
        "ruleType": "TIMEOUT",
        "outcome": "PASS",
        "reasonCode": "COMPLETED_WITHIN_THRESHOLD",
        "evaluatedAt": "2026-10-17T10:10:00Z"
      },
      {
        "evaluationId": "eval-003-002-g1",
        "ruleId": "rule-002",
        "ruleType": "DUPLICATE_BUSINESS_EFFECT",
        "outcome": "VIOLATION",
        "reasonCode": "DUPLICATE_EFFECTS_PROVEN",
        "evaluatedAt": "2026-10-17T10:10:00Z"
      },
      {
        "evaluationId": "eval-003-003-g1",
        "ruleId": "rule-003",
        "ruleType": "DATA_INVARIANT",
        "outcome": "VIOLATION",
        "reasonCode": "TOTAL_DELTA_MISMATCH",
        "evaluatedAt": "2026-10-17T10:10:00Z"
      }
    ],
    "relatedIncidentId": "inc-001"
  },
  "linkedEvaluations": [
    {
      "id": "eval-003-002-g1",
      "observedEventId": "evt-003",
      "ruleId": "rule-002",
      "ruleType": "DUPLICATE_BUSINESS_EFFECT",
      "ruleVersion": "1",
      "configSnapshot": {
        "maxEffects": 1,
        "sourcePolicy": "EVENT_BOUND_SOURCE"
      },
      "inputGeneration": "1",
      "outcome": "VIOLATION",
      "reasonCode": "DUPLICATE_EFFECTS_PROVEN",
      "reason": "Hai distinct effect IDs cùng event và sandbox run.",
      "evaluatedAt": "2026-10-17T10:10:00Z",
      "evidenceIds": [
        "ev-003-ledger"
      ],
      "isLatest": true
    },
    {
      "id": "eval-003-003-g1",
      "observedEventId": "evt-003",
      "ruleId": "rule-003",
      "ruleType": "DATA_INVARIANT",
      "ruleVersion": "1",
      "configSnapshot": {
        "expectedSource": "ORDER_EXPECTATION",
        "comparison": "TOTAL_DELTA_EQUALS_EXPECTED"
      },
      "inputGeneration": "1",
      "outcome": "VIOLATION",
      "reasonCode": "TOTAL_DELTA_MISMATCH",
      "reason": "Tổng +200 khác expected +100.",
      "evaluatedAt": "2026-10-17T10:10:00Z",
      "evidenceIds": [
        "ev-003-ledger"
      ],
      "isLatest": true
    }
  ],
  "evidence": [
    {
      "id": "ev-003-ledger",
      "observedEventId": "evt-003",
      "kind": "LEDGER_SNAPSHOT",
      "sourceKey": "loyalty-fault-v1",
      "sourceLabel": "Sandbox injected faulty ledger",
      "scope": {
        "eventId": "order-paid-1003",
        "customerRef": "cust-demo-001",
        "runId": "run-ds03"
      },
      "coverage": "COMPLETE",
      "trust": "TRUSTED",
      "finality": "FINAL",
      "snapshotAt": "2026-10-17T10:10:00Z",
      "collectedAt": "2026-10-17T10:10:00Z",
      "supersedesEvidenceId": null,
      "ledger": {
        "expectedPoints": "100",
        "effectCount": 2,
        "totalDelta": "200",
        "effects": [
          {
            "id": "eff-003-1",
            "eventId": "order-paid-1003",
            "customerRef": "cust-demo-001",
            "delta": "100",
            "createdAt": "2026-10-17T10:02:02Z"
          },
          {
            "id": "eff-003-2",
            "eventId": "order-paid-1003",
            "customerRef": "cust-demo-001",
            "delta": "100",
            "createdAt": "2026-10-17T10:02:02Z"
          }
        ]
      },
      "reportIds": [],
      "gaps": []
    }
  ],
  "history": [
    {
      "id": "hist-001-1",
      "action": "CREATED",
      "fromStatus": null,
      "toStatus": "OPEN",
      "actorRef": "system",
      "note": "Duplicate và invariant evaluations vi phạm.",
      "createdAt": "2026-10-17T10:10:00Z"
    },
    {
      "id": "hist-new-001",
      "action": "STATUS_CHANGED",
      "fromStatus": "OPEN",
      "toStatus": "INVESTIGATING",
      "actorRef": "local-developer",
      "note": "Bắt đầu điều tra ledger.",
      "createdAt": "2026-10-17T10:10:00.001Z"
    }
  ]
}
```


## 6. Internal processing report ingestion

**POST `/internal/v1/processing-reports`**, request InternalProcessingReportRequest → InternalReportAckResponse. Không gọi từ React/mock Dashboard interface, không tính vào 11 operations. Đây là thiết kế, chưa triển khai auth/endpoint runtime.

- Boundary chỉ service-to-service. Dùng opaque Bearer token riêng cho configured producer, đọc từ secret/environment ngoài repo; token ánh xạ server-side tới principal `{producerId, allowedApplicationIds, permission:REPORT_WRITE}`. Không dùng token Dashboard hoặc token được nhúng trong frontend. Cross-host dùng TLS; loopback local cũng phải có token. Không chấp nhận token từ query string hoặc body.
- applicationId/producerId trong body phải khớp principal và application mapping được cấu hình. Token thiếu/sai →401; principal sai producer/app/quyền →403, không tạo placeholder. Unknown app hợp lệ về quyền nhưng chưa đăng ký →404. Không cho report tự nâng trust, sửa canonical observed envelope hoặc trỏ arbitrary evidence source.
- Body unknown fields, invalid ID/type, STARTED có finishedAt, finishedAt trước startedAt khi cả hai có →400. Thiếu timestamps được gửi null, giữ gap; reportedAt bắt buộc UTC. Valid schema không tự chứng minh clocks đồng bộ; trusted timing còn phụ thuộc producer config và clock validity, report conflict luôn được xét trước successful timing.
- Transaction ghi event placeholder nếu cần, attempt, report, report evidence và generation trong monitor_db trước acknowledgement. Response **201** khi tạo report mới; retry cùng `(applicationId,producerReportId)` và canonical semantic payload trả **200**, replayed=true, cùng report/attempt IDs. Hash trên normalized DTO fields theo thứ tự key cố định và UTC timestamps chuẩn hóa cùng instant; không phụ thuộc JSON property order/whitespace và không hash token.
- Cùng report ID nhưng payload khác →409 REPORT_PAYLOAD_CONFLICT; giữ report gốc, persist conflict evidence trước trả lỗi nếu correlation hợp lệ. producerAttemptId đã gắn event khác →409 IDENTITY_CONFLICT; không reparent attempt. Auth errors không tạo conflict vào app người khác.
- Hai report IDs mới nhưng terminal results mâu thuẫn cùng attempt: lưu cả hai + conflict evidence, **201** với hasReportConflict=true. Đây là report được tiếp nhận có conflict nghiệp vụ, không lỗi transport hoặc duplicate ID. Projection xử lý theo §3.1. Ack không hứa rules đã evaluate xong hoặc effect đã đúng.
- Retry khi mất ack giữ producerReportId/producerAttemptId/payload. Khi DB không commit →503/500 và không acknowledgement thành công; khi network mất ack sau commit, retry cùng identity giúp lấy lại acknowledgement. Report sender vẫn best effort theo Architecture, không thêm durable report outbox ở contract này.

Acceptance: cùng report gửi hai lần chỉ một row/attempt; spoof app/producer 403 không mutation; same-ID/different-content 409 giữ original; distinct-ID conflicting terminal reports hiện UNKNOWN/TIMEOUT UNKNOWN, ledger rule độc lập không bị ép UNKNOWN; report-first merge cùng observation khi observer tới sau.



**Internal request JSON**

<!-- schema: InternalProcessingReportRequest -->
```json
{
  "applicationId": "app-001",
  "producerId": "demo-loyalty",
  "eventId": "order-paid-1003",
  "producerAttemptId": "producer-att-003-1",
  "producerReportId": "producer-rpt-003-1",
  "attemptNo": 1,
  "reportedStatus": "SUCCEEDED",
  "startedAt": "2026-10-17T10:02:01Z",
  "finishedAt": "2026-10-17T10:02:02Z",
  "reportedAt": "2026-10-17T10:02:02Z",
  "errorCode": null
}
```

**Internal acknowledgement JSON (201)**

<!-- schema: InternalReportAckResponse -->
```json
{
  "reportId": "rpt-003-1",
  "attemptId": "att-003-1",
  "observedEventId": "evt-003",
  "replayed": false,
  "hasReportConflict": false
}
```


## 7. Machine-readable DTO schemas

JSON Schema 2020-12 bên dưới là nguồn định nghĩa type/required/nullability của v1, được giữ trong chính tài liệu này. Root `$defs` có primitives/domains, DTOs và concrete PageResponse variants. Validate một DTO bằng `$ref` tới definition tương ứng; schemas không tự kiểm database FKs, exact count arithmetic, auth hoặc source trust. JSON examples cần được kiểm với cùng definitions.

<details>
<summary>JSON Schema definitions</summary>

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "urn:erm:api-contract:v1",
  "title": "ERM API DTO schemas",
  "$defs": {
    "Id": {
      "type": "string",
      "description": "ID string opaque; không hoán đổi observation ID và logical event ID.",
      "pattern": "^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$"
    },
    "UtcTimestamp": {
      "type": "string",
      "description": "ISO 8601 UTC với hậu tố Z; null chỉ khi schema cho phép.",
      "format": "date-time",
      "pattern": "^\\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12][0-9]|3[01])T(?:[01][0-9]|2[0-3]):[0-5][0-9]:[0-5][0-9](?:\\.[0-9]{1,3})?Z$"
    },
    "NonNegativeInt64String": {
      "type": "string",
      "description": "Số nguyên decimal 0..9223372036854775807; không dấu +, số mũ hoặc leading zero.",
      "pattern": "^(0|[1-9][0-9]{0,18})$"
    },
    "PositiveInt64String": {
      "type": "string",
      "description": "Số nguyên decimal 1..9223372036854775807; kiểm giới hạn Int64 bằng semantic validation.",
      "pattern": "^[1-9][0-9]{0,18}$"
    },
    "ObservationStatus": {
      "type": "string",
      "enum": [
        "REPORTED_ONLY",
        "OBSERVED"
      ],
      "description": ""
    },
    "ProcessingStatus": {
      "type": "string",
      "enum": [
        "CONFIRMED",
        "FAILED",
        "PENDING",
        "UNKNOWN"
      ],
      "description": ""
    },
    "ProcessingReportStatus": {
      "type": "string",
      "enum": [
        "STARTED",
        "SUCCEEDED",
        "FAILED"
      ],
      "description": ""
    },
    "ProcessingAttemptStatus": {
      "type": "string",
      "enum": [
        "PENDING",
        "SUCCEEDED",
        "FAILED",
        "CONFLICTED"
      ],
      "description": ""
    },
    "RuleOutcome": {
      "type": "string",
      "enum": [
        "PASS",
        "VIOLATION",
        "UNKNOWN"
      ],
      "description": ""
    },
    "IncidentStatus": {
      "type": "string",
      "enum": [
        "OPEN",
        "INVESTIGATING",
        "RESOLVED"
      ],
      "description": ""
    },
    "RuleType": {
      "type": "string",
      "enum": [
        "TIMEOUT",
        "DUPLICATE_BUSINESS_EFFECT",
        "DATA_INVARIANT"
      ],
      "description": ""
    },
    "EvidenceCoverage": {
      "type": "string",
      "enum": [
        "COMPLETE",
        "PARTIAL",
        "NONE"
      ],
      "description": ""
    },
    "EvidenceTrust": {
      "type": "string",
      "enum": [
        "TRUSTED",
        "UNTRUSTED",
        "CONFLICTED"
      ],
      "description": ""
    },
    "EvidenceFinality": {
      "type": "string",
      "enum": [
        "FINAL",
        "OPEN",
        "UNKNOWN"
      ],
      "description": ""
    },
    "ApplicationResponse": {
      "type": "object",
      "description": "",
      "properties": {
        "id": {
          "$ref": "#/$defs/Id"
        },
        "name": {
          "type": "string",
          "description": "Tên hiển thị đã trim.",
          "minLength": 1,
          "maxLength": 100,
          "pattern": "\\S"
        },
        "environment": {
          "type": "string",
          "enum": [
            "SANDBOX",
            "DEVELOPMENT"
          ],
          "description": ""
        },
        "status": {
          "type": "string",
          "enum": [
            "ACTIVE",
            "INACTIVE"
          ],
          "description": "Trạng thái cấu hình, không phải connectivity health."
        },
        "createdAt": {
          "$ref": "#/$defs/UtcTimestamp"
        }
      },
      "required": [
        "id",
        "name",
        "environment",
        "status",
        "createdAt"
      ],
      "additionalProperties": false
    },
    "CreateApplicationRequest": {
      "type": "object",
      "description": "Không có credential/URL/connection string fields.",
      "properties": {
        "name": {
          "type": "string",
          "description": "Trim; không rỗng.",
          "minLength": 1,
          "maxLength": 100,
          "pattern": "\\S"
        },
        "environment": {
          "type": "string",
          "enum": [
            "SANDBOX",
            "DEVELOPMENT"
          ],
          "description": ""
        }
      },
      "required": [
        "name",
        "environment"
      ],
      "additionalProperties": false
    },
    "TimeoutRuleConfig": {
      "type": "object",
      "description": "",
      "properties": {
        "thresholdSeconds": {
          "type": "integer",
          "minimum": 1,
          "maximum": 86400,
          "description": "Ngưỡng giây; seed=60."
        },
        "completionBasis": {
          "const": "FIRST_TRUSTED_SUCCESS"
        }
      },
      "required": [
        "thresholdSeconds",
        "completionBasis"
      ],
      "additionalProperties": false
    },
    "DuplicateRuleConfig": {
      "type": "object",
      "description": "",
      "properties": {
        "maxEffects": {
          "const": 1
        },
        "sourcePolicy": {
          "const": "EVENT_BOUND_SOURCE"
        }
      },
      "required": [
        "maxEffects",
        "sourcePolicy"
      ],
      "additionalProperties": false
    },
    "InvariantRuleConfig": {
      "type": "object",
      "description": "",
      "properties": {
        "expectedSource": {
          "const": "ORDER_EXPECTATION"
        },
        "comparison": {
          "const": "TOTAL_DELTA_EQUALS_EXPECTED"
        }
      },
      "required": [
        "expectedSource",
        "comparison"
      ],
      "additionalProperties": false
    },
    "MonitoringRuleResponse": {
      "type": "object",
      "description": "",
      "properties": {
        "id": {
          "$ref": "#/$defs/Id"
        },
        "applicationId": {
          "$ref": "#/$defs/Id"
        },
        "ruleType": {
          "$ref": "#/$defs/RuleType"
        },
        "name": {
          "type": "string",
          "description": "Tên hiển thị.",
          "minLength": 1,
          "maxLength": 100,
          "pattern": "\\S"
        },
        "description": {
          "type": "string",
          "description": "Mô tả an toàn; có thể rỗng.",
          "minLength": 0,
          "maxLength": 500
        },
        "config": {
          "oneOf": [
            {
              "$ref": "#/$defs/TimeoutRuleConfig"
            },
            {
              "$ref": "#/$defs/DuplicateRuleConfig"
            },
            {
              "$ref": "#/$defs/InvariantRuleConfig"
            }
          ]
        },
        "enabled": {
          "type": "boolean"
        },
        "configVersion": {
          "$ref": "#/$defs/PositiveInt64String"
        },
        "updatedAt": {
          "$ref": "#/$defs/UtcTimestamp"
        },
        "relatedEventIds": {
          "type": "array",
          "items": {
            "$ref": "#/$defs/Id"
          },
          "minItems": 0,
          "maxItems": 3
        },
        "relatedIncidentIds": {
          "type": "array",
          "items": {
            "$ref": "#/$defs/Id"
          },
          "minItems": 0,
          "maxItems": 3
        }
      },
      "required": [
        "id",
        "applicationId",
        "ruleType",
        "name",
        "description",
        "config",
        "enabled",
        "configVersion",
        "updatedAt",
        "relatedEventIds",
        "relatedIncidentIds"
      ],
      "additionalProperties": false,
      "allOf": [
        {
          "if": {
            "properties": {
              "ruleType": {
                "const": "TIMEOUT"
              }
            },
            "required": [
              "ruleType"
            ]
          },
          "then": {
            "properties": {
              "config": {
                "$ref": "#/$defs/TimeoutRuleConfig"
              }
            }
          }
        },
        {
          "if": {
            "properties": {
              "ruleType": {
                "const": "DUPLICATE_BUSINESS_EFFECT"
              }
            },
            "required": [
              "ruleType"
            ]
          },
          "then": {
            "properties": {
              "config": {
                "$ref": "#/$defs/DuplicateRuleConfig"
              }
            }
          }
        },
        {
          "if": {
            "properties": {
              "ruleType": {
                "const": "DATA_INVARIANT"
              }
            },
            "required": [
              "ruleType"
            ]
          },
          "then": {
            "properties": {
              "config": {
                "$ref": "#/$defs/InvariantRuleConfig"
              }
            }
          }
        }
      ]
    },
    "CreateRuleRequest": {
      "type": "object",
      "description": "",
      "properties": {
        "applicationId": {
          "$ref": "#/$defs/Id"
        },
        "ruleType": {
          "$ref": "#/$defs/RuleType"
        },
        "name": {
          "type": "string",
          "description": "Tên hiển thị.",
          "minLength": 1,
          "maxLength": 100,
          "pattern": "\\S"
        },
        "description": {
          "type": "string",
          "description": "Mô tả an toàn; có thể rỗng.",
          "minLength": 0,
          "maxLength": 500
        },
        "config": {
          "oneOf": [
            {
              "$ref": "#/$defs/TimeoutRuleConfig"
            },
            {
              "$ref": "#/$defs/DuplicateRuleConfig"
            },
            {
              "$ref": "#/$defs/InvariantRuleConfig"
            }
          ]
        },
        "enabled": {
          "type": "boolean"
        }
      },
      "required": [
        "applicationId",
        "ruleType",
        "name",
        "config"
      ],
      "additionalProperties": false,
      "allOf": [
        {
          "if": {
            "properties": {
              "ruleType": {
                "const": "TIMEOUT"
              }
            },
            "required": [
              "ruleType"
            ]
          },
          "then": {
            "properties": {
              "config": {
                "$ref": "#/$defs/TimeoutRuleConfig"
              }
            }
          }
        },
        {
          "if": {
            "properties": {
              "ruleType": {
                "const": "DUPLICATE_BUSINESS_EFFECT"
              }
            },
            "required": [
              "ruleType"
            ]
          },
          "then": {
            "properties": {
              "config": {
                "$ref": "#/$defs/DuplicateRuleConfig"
              }
            }
          }
        },
        {
          "if": {
            "properties": {
              "ruleType": {
                "const": "DATA_INVARIANT"
              }
            },
            "required": [
              "ruleType"
            ]
          },
          "then": {
            "properties": {
              "config": {
                "$ref": "#/$defs/InvariantRuleConfig"
              }
            }
          }
        }
      ]
    },
    "UpdateRuleRequest": {
      "type": "object",
      "description": "",
      "properties": {
        "enabled": {
          "type": "boolean"
        }
      },
      "required": [
        "enabled"
      ],
      "additionalProperties": false
    },
    "RuleResultSummaryResponse": {
      "type": "object",
      "description": "",
      "properties": {
        "evaluationId": {
          "$ref": "#/$defs/Id"
        },
        "ruleId": {
          "$ref": "#/$defs/Id"
        },
        "ruleType": {
          "$ref": "#/$defs/RuleType"
        },
        "outcome": {
          "$ref": "#/$defs/RuleOutcome"
        },
        "reasonCode": {
          "type": "string",
          "description": "Code lý do ổn định.",
          "pattern": "^[A-Z][A-Z0-9_]{0,63}$"
        },
        "evaluatedAt": {
          "$ref": "#/$defs/UtcTimestamp"
        }
      },
      "required": [
        "evaluationId",
        "ruleId",
        "ruleType",
        "outcome",
        "reasonCode",
        "evaluatedAt"
      ],
      "additionalProperties": false
    },
    "EventSummaryResponse": {
      "type": "object",
      "description": "",
      "properties": {
        "id": {
          "$ref": "#/$defs/Id"
        },
        "eventId": {
          "$ref": "#/$defs/Id"
        },
        "applicationId": {
          "$ref": "#/$defs/Id"
        },
        "applicationName": {
          "type": "string",
          "description": "Nhãn app từ projection.",
          "minLength": 1,
          "maxLength": 100,
          "pattern": "\\S"
        },
        "eventType": {
          "anyOf": [
            {
              "type": "string",
              "enum": [
                "ORDER_PAID"
              ],
              "description": ""
            },
            {
              "type": "null"
            }
          ]
        },
        "correlationId": {
          "anyOf": [
            {
              "$ref": "#/$defs/Id"
            },
            {
              "type": "null"
            }
          ]
        },
        "occurredAt": {
          "anyOf": [
            {
              "$ref": "#/$defs/UtcTimestamp"
            },
            {
              "type": "null"
            }
          ]
        },
        "observationStatus": {
          "$ref": "#/$defs/ObservationStatus"
        },
        "processingStatus": {
          "$ref": "#/$defs/ProcessingStatus"
        },
        "processingStatusReason": {
          "type": "string",
          "description": "Giải thích theo các reports nhìn thấy.",
          "minLength": 1,
          "maxLength": 1000,
          "pattern": "\\S"
        },
        "reportedAttemptCount": {
          "type": "integer",
          "minimum": 0,
          "maximum": 9007199254740991,
          "description": "Đếm unique attempts có report; không phải tổng actual attempts."
        },
        "hasReportConflict": {
          "type": "boolean"
        },
        "evaluationState": {
          "type": "string",
          "enum": [
            "CURRENT",
            "PENDING",
            "NOT_EVALUATED"
          ],
          "description": "Trạng thái queued generation, không phải business outcome."
        },
        "ruleResults": {
          "type": "array",
          "items": {
            "$ref": "#/$defs/RuleResultSummaryResponse"
          },
          "minItems": 0
        },
        "relatedIncidentId": {
          "anyOf": [
            {
              "$ref": "#/$defs/Id"
            },
            {
              "type": "null"
            }
          ]
        }
      },
      "required": [
        "id",
        "eventId",
        "applicationId",
        "applicationName",
        "eventType",
        "correlationId",
        "occurredAt",
        "observationStatus",
        "processingStatus",
        "processingStatusReason",
        "reportedAttemptCount",
        "hasReportConflict",
        "evaluationState",
        "ruleResults",
        "relatedIncidentId"
      ],
      "additionalProperties": false,
      "allOf": [
        {
          "if": {
            "properties": {
              "observationStatus": {
                "const": "OBSERVED"
              }
            }
          },
          "then": {
            "properties": {
              "eventType": {
                "type": "string",
                "enum": [
                  "ORDER_PAID"
                ],
                "description": ""
              },
              "correlationId": {
                "$ref": "#/$defs/Id"
              },
              "occurredAt": {
                "$ref": "#/$defs/UtcTimestamp"
              }
            }
          }
        },
        {
          "if": {
            "properties": {
              "hasReportConflict": {
                "const": true
              }
            }
          },
          "then": {
            "properties": {
              "processingStatus": {
                "const": "UNKNOWN"
              }
            }
          }
        }
      ]
    },
    "ProcessingReportResponse": {
      "type": "object",
      "description": "",
      "properties": {
        "id": {
          "$ref": "#/$defs/Id"
        },
        "attemptId": {
          "$ref": "#/$defs/Id"
        },
        "producerReportId": {
          "$ref": "#/$defs/Id"
        },
        "reportedStatus": {
          "$ref": "#/$defs/ProcessingReportStatus"
        },
        "startedAt": {
          "anyOf": [
            {
              "$ref": "#/$defs/UtcTimestamp"
            },
            {
              "type": "null"
            }
          ]
        },
        "finishedAt": {
          "anyOf": [
            {
              "$ref": "#/$defs/UtcTimestamp"
            },
            {
              "type": "null"
            }
          ]
        },
        "reportedAt": {
          "$ref": "#/$defs/UtcTimestamp"
        },
        "receivedAt": {
          "$ref": "#/$defs/UtcTimestamp"
        },
        "errorCode": {
          "anyOf": [
            {
              "type": "string",
              "description": "Error code masked, không stack trace/secret.",
              "minLength": 1,
              "maxLength": 100,
              "pattern": "\\S"
            },
            {
              "type": "null"
            }
          ]
        }
      },
      "required": [
        "id",
        "attemptId",
        "producerReportId",
        "reportedStatus",
        "startedAt",
        "finishedAt",
        "reportedAt",
        "receivedAt",
        "errorCode"
      ],
      "additionalProperties": false,
      "allOf": [
        {
          "if": {
            "properties": {
              "reportedStatus": {
                "const": "STARTED"
              }
            }
          },
          "then": {
            "properties": {
              "finishedAt": {
                "type": "null"
              }
            }
          }
        }
      ]
    },
    "ProcessingAttemptResponse": {
      "type": "object",
      "description": "",
      "properties": {
        "id": {
          "$ref": "#/$defs/Id"
        },
        "producerAttemptId": {
          "$ref": "#/$defs/Id"
        },
        "attemptNo": {
          "anyOf": [
            {
              "type": "integer",
              "minimum": 1,
              "maximum": 2147483647
            },
            {
              "type": "null"
            }
          ]
        },
        "status": {
          "$ref": "#/$defs/ProcessingAttemptStatus"
        },
        "startedAt": {
          "anyOf": [
            {
              "$ref": "#/$defs/UtcTimestamp"
            },
            {
              "type": "null"
            }
          ]
        },
        "finishedAt": {
          "anyOf": [
            {
              "$ref": "#/$defs/UtcTimestamp"
            },
            {
              "type": "null"
            }
          ]
        },
        "reportIds": {
          "type": "array",
          "items": {
            "$ref": "#/$defs/Id"
          },
          "minItems": 1
        },
        "hasTerminalConflict": {
          "type": "boolean"
        }
      },
      "required": [
        "id",
        "producerAttemptId",
        "attemptNo",
        "status",
        "startedAt",
        "finishedAt",
        "reportIds",
        "hasTerminalConflict"
      ],
      "additionalProperties": false,
      "allOf": [
        {
          "if": {
            "properties": {
              "status": {
                "const": "CONFLICTED"
              }
            }
          },
          "then": {
            "properties": {
              "hasTerminalConflict": {
                "const": true
              },
              "finishedAt": {
                "type": "null"
              }
            }
          },
          "else": {
            "properties": {
              "hasTerminalConflict": {
                "const": false
              }
            }
          }
        }
      ]
    },
    "EvidenceGapResponse": {
      "type": "object",
      "description": "",
      "properties": {
        "code": {
          "type": "string",
          "description": "Code gap ổn định.",
          "pattern": "^[A-Z][A-Z0-9_]{0,63}$"
        },
        "message": {
          "type": "string",
          "description": "Giải thích thiếu dữ liệu.",
          "minLength": 1,
          "maxLength": 1000,
          "pattern": "\\S"
        },
        "missingFields": {
          "type": "array",
          "items": {
            "type": "string",
            "description": "Tên field/nguồn còn thiếu.",
            "minLength": 1,
            "maxLength": 100,
            "pattern": "\\S"
          },
          "minItems": 0
        }
      },
      "required": [
        "code",
        "message",
        "missingFields"
      ],
      "additionalProperties": false
    },
    "BusinessEffectResponse": {
      "type": "object",
      "description": "",
      "properties": {
        "id": {
          "$ref": "#/$defs/Id"
        },
        "eventId": {
          "$ref": "#/$defs/Id"
        },
        "customerRef": {
          "$ref": "#/$defs/Id"
        },
        "delta": {
          "$ref": "#/$defs/PositiveInt64String"
        },
        "createdAt": {
          "anyOf": [
            {
              "$ref": "#/$defs/UtcTimestamp"
            },
            {
              "type": "null"
            }
          ]
        }
      },
      "required": [
        "id",
        "eventId",
        "customerRef",
        "delta",
        "createdAt"
      ],
      "additionalProperties": false
    },
    "EvidenceScopeResponse": {
      "type": "object",
      "description": "",
      "properties": {
        "eventId": {
          "$ref": "#/$defs/Id"
        },
        "customerRef": {
          "anyOf": [
            {
              "$ref": "#/$defs/Id"
            },
            {
              "type": "null"
            }
          ]
        },
        "runId": {
          "anyOf": [
            {
              "$ref": "#/$defs/Id"
            },
            {
              "type": "null"
            }
          ]
        }
      },
      "required": [
        "eventId",
        "customerRef",
        "runId"
      ],
      "additionalProperties": false
    },
    "LedgerSnapshotResponse": {
      "type": "object",
      "description": "",
      "properties": {
        "expectedPoints": {
          "anyOf": [
            {
              "$ref": "#/$defs/PositiveInt64String"
            },
            {
              "type": "null"
            }
          ]
        },
        "effectCount": {
          "anyOf": [
            {
              "type": "integer",
              "minimum": 0,
              "maximum": 9007199254740991,
              "description": "Exact toàn scope chỉ khi đủ căn cứ; null nếu chưa biết."
            },
            {
              "type": "null"
            }
          ]
        },
        "totalDelta": {
          "anyOf": [
            {
              "$ref": "#/$defs/NonNegativeInt64String"
            },
            {
              "type": "null"
            }
          ]
        },
        "effects": {
          "type": "array",
          "items": {
            "$ref": "#/$defs/BusinessEffectResponse"
          },
          "minItems": 0
        }
      },
      "required": [
        "expectedPoints",
        "effectCount",
        "totalDelta",
        "effects"
      ],
      "additionalProperties": false
    },
    "EvidenceResponse": {
      "type": "object",
      "description": "",
      "properties": {
        "id": {
          "$ref": "#/$defs/Id"
        },
        "observedEventId": {
          "$ref": "#/$defs/Id"
        },
        "kind": {
          "type": "string",
          "enum": [
            "LEDGER_SNAPSHOT",
            "REPORT_BATCH",
            "GAP",
            "CORRELATION_CONFLICT"
          ],
          "description": ""
        },
        "sourceKey": {
          "type": "string",
          "description": "Allowlisted source, không SQL/URL.",
          "minLength": 1,
          "maxLength": 100,
          "pattern": "\\S"
        },
        "sourceLabel": {
          "type": "string",
          "description": "Nguồn hiển thị; có nhãn injected khi sandbox.",
          "minLength": 1,
          "maxLength": 200,
          "pattern": "\\S"
        },
        "scope": {
          "$ref": "#/$defs/EvidenceScopeResponse"
        },
        "coverage": {
          "$ref": "#/$defs/EvidenceCoverage"
        },
        "trust": {
          "$ref": "#/$defs/EvidenceTrust"
        },
        "finality": {
          "$ref": "#/$defs/EvidenceFinality"
        },
        "snapshotAt": {
          "anyOf": [
            {
              "$ref": "#/$defs/UtcTimestamp"
            },
            {
              "type": "null"
            }
          ]
        },
        "collectedAt": {
          "$ref": "#/$defs/UtcTimestamp"
        },
        "supersedesEvidenceId": {
          "anyOf": [
            {
              "$ref": "#/$defs/Id"
            },
            {
              "type": "null"
            }
          ]
        },
        "ledger": {
          "anyOf": [
            {
              "$ref": "#/$defs/LedgerSnapshotResponse"
            },
            {
              "type": "null"
            }
          ]
        },
        "reportIds": {
          "type": "array",
          "items": {
            "$ref": "#/$defs/Id"
          },
          "minItems": 0
        },
        "gaps": {
          "type": "array",
          "items": {
            "$ref": "#/$defs/EvidenceGapResponse"
          },
          "minItems": 0
        }
      },
      "required": [
        "id",
        "observedEventId",
        "kind",
        "sourceKey",
        "sourceLabel",
        "scope",
        "coverage",
        "trust",
        "finality",
        "snapshotAt",
        "collectedAt",
        "supersedesEvidenceId",
        "ledger",
        "reportIds",
        "gaps"
      ],
      "additionalProperties": false,
      "allOf": [
        {
          "if": {
            "properties": {
              "kind": {
                "const": "LEDGER_SNAPSHOT"
              }
            }
          },
          "then": {
            "properties": {
              "ledger": {
                "$ref": "#/$defs/LedgerSnapshotResponse"
              },
              "reportIds": {
                "maxItems": 0
              }
            }
          }
        },
        {
          "if": {
            "properties": {
              "kind": {
                "const": "REPORT_BATCH"
              }
            }
          },
          "then": {
            "properties": {
              "ledger": {
                "type": "null"
              },
              "reportIds": {
                "minItems": 1
              }
            }
          }
        },
        {
          "if": {
            "properties": {
              "kind": {
                "enum": [
                  "GAP",
                  "CORRELATION_CONFLICT"
                ]
              }
            }
          },
          "then": {
            "properties": {
              "ledger": {
                "type": "null"
              },
              "gaps": {
                "minItems": 1
              }
            }
          }
        },
        {
          "if": {
            "properties": {
              "kind": {
                "const": "LEDGER_SNAPSHOT"
              }
            },
            "required": [
              "kind"
            ]
          },
          "then": {
            "if": {
              "properties": {
                "coverage": {
                  "const": "COMPLETE"
                },
                "trust": {
                  "const": "TRUSTED"
                },
                "finality": {
                  "const": "FINAL"
                }
              }
            },
            "then": {
              "properties": {
                "ledger": {
                  "properties": {
                    "effectCount": {
                      "type": "integer",
                      "minimum": 0,
                      "maximum": 9007199254740991,
                      "description": ""
                    },
                    "totalDelta": {
                      "$ref": "#/$defs/NonNegativeInt64String"
                    }
                  }
                }
              }
            },
            "else": {
              "properties": {
                "ledger": {
                  "properties": {
                    "effectCount": {
                      "type": "null"
                    },
                    "totalDelta": {
                      "type": "null"
                    }
                  }
                }
              }
            }
          }
        }
      ]
    },
    "RuleEvaluationResponse": {
      "type": "object",
      "description": "",
      "properties": {
        "id": {
          "$ref": "#/$defs/Id"
        },
        "observedEventId": {
          "$ref": "#/$defs/Id"
        },
        "ruleId": {
          "$ref": "#/$defs/Id"
        },
        "ruleType": {
          "$ref": "#/$defs/RuleType"
        },
        "ruleVersion": {
          "$ref": "#/$defs/PositiveInt64String"
        },
        "configSnapshot": {
          "oneOf": [
            {
              "$ref": "#/$defs/TimeoutRuleConfig"
            },
            {
              "$ref": "#/$defs/DuplicateRuleConfig"
            },
            {
              "$ref": "#/$defs/InvariantRuleConfig"
            }
          ]
        },
        "inputGeneration": {
          "$ref": "#/$defs/PositiveInt64String"
        },
        "outcome": {
          "$ref": "#/$defs/RuleOutcome"
        },
        "reasonCode": {
          "type": "string",
          "description": "",
          "pattern": "^[A-Z][A-Z0-9_]{0,63}$"
        },
        "reason": {
          "type": "string",
          "description": "Lý do cho cả PASS/VIOLATION/UNKNOWN.",
          "minLength": 1,
          "maxLength": 2000,
          "pattern": "\\S"
        },
        "evaluatedAt": {
          "$ref": "#/$defs/UtcTimestamp"
        },
        "evidenceIds": {
          "type": "array",
          "items": {
            "$ref": "#/$defs/Id"
          },
          "minItems": 1,
          "uniqueItems": true
        },
        "isLatest": {
          "type": "boolean"
        }
      },
      "required": [
        "id",
        "observedEventId",
        "ruleId",
        "ruleType",
        "ruleVersion",
        "configSnapshot",
        "inputGeneration",
        "outcome",
        "reasonCode",
        "reason",
        "evaluatedAt",
        "evidenceIds",
        "isLatest"
      ],
      "additionalProperties": false,
      "allOf": [
        {
          "if": {
            "properties": {
              "ruleType": {
                "const": "TIMEOUT"
              }
            },
            "required": [
              "ruleType"
            ]
          },
          "then": {
            "properties": {
              "configSnapshot": {
                "$ref": "#/$defs/TimeoutRuleConfig"
              }
            }
          }
        },
        {
          "if": {
            "properties": {
              "ruleType": {
                "const": "DUPLICATE_BUSINESS_EFFECT"
              }
            },
            "required": [
              "ruleType"
            ]
          },
          "then": {
            "properties": {
              "configSnapshot": {
                "$ref": "#/$defs/DuplicateRuleConfig"
              }
            }
          }
        },
        {
          "if": {
            "properties": {
              "ruleType": {
                "const": "DATA_INVARIANT"
              }
            },
            "required": [
              "ruleType"
            ]
          },
          "then": {
            "properties": {
              "configSnapshot": {
                "$ref": "#/$defs/InvariantRuleConfig"
              }
            }
          }
        }
      ]
    },
    "EventDetailResponse": {
      "type": "object",
      "description": "",
      "properties": {
        "id": {
          "$ref": "#/$defs/Id"
        },
        "eventId": {
          "$ref": "#/$defs/Id"
        },
        "applicationId": {
          "$ref": "#/$defs/Id"
        },
        "applicationName": {
          "type": "string",
          "description": "Nhãn app từ projection.",
          "minLength": 1,
          "maxLength": 100,
          "pattern": "\\S"
        },
        "eventType": {
          "anyOf": [
            {
              "type": "string",
              "enum": [
                "ORDER_PAID"
              ],
              "description": ""
            },
            {
              "type": "null"
            }
          ]
        },
        "correlationId": {
          "anyOf": [
            {
              "$ref": "#/$defs/Id"
            },
            {
              "type": "null"
            }
          ]
        },
        "occurredAt": {
          "anyOf": [
            {
              "$ref": "#/$defs/UtcTimestamp"
            },
            {
              "type": "null"
            }
          ]
        },
        "observationStatus": {
          "$ref": "#/$defs/ObservationStatus"
        },
        "processingStatus": {
          "$ref": "#/$defs/ProcessingStatus"
        },
        "processingStatusReason": {
          "type": "string",
          "description": "Giải thích theo các reports nhìn thấy.",
          "minLength": 1,
          "maxLength": 1000,
          "pattern": "\\S"
        },
        "reportedAttemptCount": {
          "type": "integer",
          "minimum": 0,
          "maximum": 9007199254740991,
          "description": "Đếm unique attempts có report; không phải tổng actual attempts."
        },
        "hasReportConflict": {
          "type": "boolean"
        },
        "evaluationState": {
          "type": "string",
          "enum": [
            "CURRENT",
            "PENDING",
            "NOT_EVALUATED"
          ],
          "description": "Trạng thái queued generation, không phải business outcome."
        },
        "ruleResults": {
          "type": "array",
          "items": {
            "$ref": "#/$defs/RuleResultSummaryResponse"
          },
          "minItems": 0
        },
        "relatedIncidentId": {
          "anyOf": [
            {
              "$ref": "#/$defs/Id"
            },
            {
              "type": "null"
            }
          ]
        },
        "customerRef": {
          "anyOf": [
            {
              "$ref": "#/$defs/Id"
            },
            {
              "type": "null"
            }
          ]
        },
        "expectedPoints": {
          "anyOf": [
            {
              "$ref": "#/$defs/PositiveInt64String"
            },
            {
              "type": "null"
            }
          ]
        },
        "evidenceSourceKey": {
          "anyOf": [
            {
              "type": "string",
              "description": "Validated source key.",
              "minLength": 1,
              "maxLength": 100,
              "pattern": "\\S"
            },
            {
              "type": "null"
            }
          ]
        },
        "firstSeenAt": {
          "$ref": "#/$defs/UtcTimestamp"
        },
        "evaluationGeneration": {
          "$ref": "#/$defs/PositiveInt64String"
        },
        "evaluatedGeneration": {
          "$ref": "#/$defs/NonNegativeInt64String"
        },
        "attempts": {
          "type": "array",
          "items": {
            "$ref": "#/$defs/ProcessingAttemptResponse"
          },
          "minItems": 0
        },
        "reports": {
          "type": "array",
          "items": {
            "$ref": "#/$defs/ProcessingReportResponse"
          },
          "minItems": 0
        },
        "evaluations": {
          "type": "array",
          "items": {
            "$ref": "#/$defs/RuleEvaluationResponse"
          },
          "minItems": 0
        },
        "evidence": {
          "type": "array",
          "items": {
            "$ref": "#/$defs/EvidenceResponse"
          },
          "minItems": 0
        }
      },
      "required": [
        "id",
        "eventId",
        "applicationId",
        "applicationName",
        "eventType",
        "correlationId",
        "occurredAt",
        "observationStatus",
        "processingStatus",
        "processingStatusReason",
        "reportedAttemptCount",
        "hasReportConflict",
        "evaluationState",
        "ruleResults",
        "relatedIncidentId",
        "customerRef",
        "expectedPoints",
        "evidenceSourceKey",
        "firstSeenAt",
        "evaluationGeneration",
        "evaluatedGeneration",
        "attempts",
        "reports",
        "evaluations",
        "evidence"
      ],
      "additionalProperties": false,
      "allOf": [
        {
          "if": {
            "properties": {
              "observationStatus": {
                "const": "OBSERVED"
              }
            }
          },
          "then": {
            "properties": {
              "eventType": {
                "type": "string",
                "enum": [
                  "ORDER_PAID"
                ],
                "description": ""
              },
              "correlationId": {
                "$ref": "#/$defs/Id"
              },
              "occurredAt": {
                "$ref": "#/$defs/UtcTimestamp"
              },
              "customerRef": {
                "$ref": "#/$defs/Id"
              },
              "expectedPoints": {
                "$ref": "#/$defs/PositiveInt64String"
              },
              "evidenceSourceKey": {
                "type": "string",
                "description": "",
                "minLength": 1,
                "maxLength": 100,
                "pattern": "\\S"
              }
            }
          }
        },
        {
          "if": {
            "properties": {
              "hasReportConflict": {
                "const": true
              }
            }
          },
          "then": {
            "properties": {
              "processingStatus": {
                "const": "UNKNOWN"
              }
            }
          }
        }
      ]
    },
    "RuleReferenceResponse": {
      "type": "object",
      "description": "",
      "properties": {
        "id": {
          "$ref": "#/$defs/Id"
        },
        "ruleType": {
          "$ref": "#/$defs/RuleType"
        },
        "name": {
          "type": "string",
          "description": "Tên rule hiển thị.",
          "minLength": 1,
          "maxLength": 100,
          "pattern": "\\S"
        }
      },
      "required": [
        "id",
        "ruleType",
        "name"
      ],
      "additionalProperties": false
    },
    "IncidentSummaryResponse": {
      "type": "object",
      "description": "",
      "properties": {
        "id": {
          "$ref": "#/$defs/Id"
        },
        "applicationId": {
          "$ref": "#/$defs/Id"
        },
        "applicationName": {
          "type": "string",
          "description": "",
          "minLength": 1,
          "maxLength": 100,
          "pattern": "\\S"
        },
        "observedEventId": {
          "$ref": "#/$defs/Id"
        },
        "eventId": {
          "$ref": "#/$defs/Id"
        },
        "primaryRule": {
          "$ref": "#/$defs/RuleReferenceResponse"
        },
        "severity": {
          "type": "string",
          "enum": [
            "MEDIUM",
            "HIGH"
          ],
          "description": ""
        },
        "status": {
          "$ref": "#/$defs/IncidentStatus"
        },
        "summary": {
          "type": "string",
          "description": "Mô tả hồ sơ, không kết luận repair.",
          "minLength": 1,
          "maxLength": 500,
          "pattern": "\\S"
        },
        "openedAt": {
          "$ref": "#/$defs/UtcTimestamp"
        },
        "resolvedAt": {
          "anyOf": [
            {
              "$ref": "#/$defs/UtcTimestamp"
            },
            {
              "type": "null"
            }
          ]
        },
        "version": {
          "$ref": "#/$defs/NonNegativeInt64String"
        }
      },
      "required": [
        "id",
        "applicationId",
        "applicationName",
        "observedEventId",
        "eventId",
        "primaryRule",
        "severity",
        "status",
        "summary",
        "openedAt",
        "resolvedAt",
        "version"
      ],
      "additionalProperties": false,
      "allOf": [
        {
          "if": {
            "properties": {
              "status": {
                "const": "RESOLVED"
              }
            }
          },
          "then": {
            "properties": {
              "resolvedAt": {
                "$ref": "#/$defs/UtcTimestamp"
              }
            }
          },
          "else": {
            "properties": {
              "resolvedAt": {
                "type": "null"
              }
            }
          }
        }
      ]
    },
    "IncidentHistoryResponse": {
      "type": "object",
      "description": "",
      "properties": {
        "id": {
          "$ref": "#/$defs/Id"
        },
        "action": {
          "type": "string",
          "enum": [
            "CREATED",
            "STATUS_CHANGED",
            "EVIDENCE_ADDED",
            "SEVERITY_RAISED"
          ],
          "description": ""
        },
        "fromStatus": {
          "anyOf": [
            {
              "$ref": "#/$defs/IncidentStatus"
            },
            {
              "type": "null"
            }
          ]
        },
        "toStatus": {
          "anyOf": [
            {
              "$ref": "#/$defs/IncidentStatus"
            },
            {
              "type": "null"
            }
          ]
        },
        "actorRef": {
          "type": "string",
          "description": "Label system/local developer, không credential.",
          "minLength": 1,
          "maxLength": 100,
          "pattern": "\\S"
        },
        "note": {
          "type": "string",
          "description": "",
          "minLength": 0,
          "maxLength": 1000
        },
        "createdAt": {
          "$ref": "#/$defs/UtcTimestamp"
        }
      },
      "required": [
        "id",
        "action",
        "fromStatus",
        "toStatus",
        "actorRef",
        "note",
        "createdAt"
      ],
      "additionalProperties": false
    },
    "IncidentDetailResponse": {
      "type": "object",
      "description": "",
      "properties": {
        "id": {
          "$ref": "#/$defs/Id"
        },
        "applicationId": {
          "$ref": "#/$defs/Id"
        },
        "applicationName": {
          "type": "string",
          "description": "",
          "minLength": 1,
          "maxLength": 100,
          "pattern": "\\S"
        },
        "observedEventId": {
          "$ref": "#/$defs/Id"
        },
        "eventId": {
          "$ref": "#/$defs/Id"
        },
        "primaryRule": {
          "$ref": "#/$defs/RuleReferenceResponse"
        },
        "severity": {
          "type": "string",
          "enum": [
            "MEDIUM",
            "HIGH"
          ],
          "description": ""
        },
        "status": {
          "$ref": "#/$defs/IncidentStatus"
        },
        "summary": {
          "type": "string",
          "description": "Mô tả hồ sơ, không kết luận repair.",
          "minLength": 1,
          "maxLength": 500,
          "pattern": "\\S"
        },
        "openedAt": {
          "$ref": "#/$defs/UtcTimestamp"
        },
        "resolvedAt": {
          "anyOf": [
            {
              "$ref": "#/$defs/UtcTimestamp"
            },
            {
              "type": "null"
            }
          ]
        },
        "version": {
          "$ref": "#/$defs/NonNegativeInt64String"
        },
        "explanation": {
          "type": "string",
          "description": "",
          "minLength": 1,
          "maxLength": 2000,
          "pattern": "\\S"
        },
        "updatedAt": {
          "$ref": "#/$defs/UtcTimestamp"
        },
        "linkedEvent": {
          "$ref": "#/$defs/EventSummaryResponse"
        },
        "linkedEvaluations": {
          "type": "array",
          "items": {
            "$ref": "#/$defs/RuleEvaluationResponse"
          },
          "minItems": 1
        },
        "evidence": {
          "type": "array",
          "items": {
            "$ref": "#/$defs/EvidenceResponse"
          },
          "minItems": 1
        },
        "history": {
          "type": "array",
          "items": {
            "$ref": "#/$defs/IncidentHistoryResponse"
          },
          "minItems": 1
        }
      },
      "required": [
        "id",
        "applicationId",
        "applicationName",
        "observedEventId",
        "eventId",
        "primaryRule",
        "severity",
        "status",
        "summary",
        "openedAt",
        "resolvedAt",
        "version",
        "explanation",
        "updatedAt",
        "linkedEvent",
        "linkedEvaluations",
        "evidence",
        "history"
      ],
      "additionalProperties": false,
      "allOf": [
        {
          "if": {
            "properties": {
              "status": {
                "const": "RESOLVED"
              }
            }
          },
          "then": {
            "properties": {
              "resolvedAt": {
                "$ref": "#/$defs/UtcTimestamp"
              }
            }
          },
          "else": {
            "properties": {
              "resolvedAt": {
                "type": "null"
              }
            }
          }
        }
      ]
    },
    "UpdateIncidentStatusRequest": {
      "type": "object",
      "description": "",
      "properties": {
        "status": {
          "$ref": "#/$defs/IncidentStatus"
        },
        "expectedVersion": {
          "$ref": "#/$defs/NonNegativeInt64String"
        },
        "note": {
          "type": "string",
          "description": "Optional note; không chứa secret.",
          "minLength": 0,
          "maxLength": 500
        }
      },
      "required": [
        "status",
        "expectedVersion"
      ],
      "additionalProperties": false
    },
    "OverviewStatsResponse": {
      "type": "object",
      "description": "",
      "properties": {
        "observedEvents": {
          "type": "integer",
          "minimum": 0,
          "maximum": 9007199254740991,
          "description": ""
        },
        "confirmedProcessing": {
          "type": "integer",
          "minimum": 0,
          "maximum": 9007199254740991,
          "description": ""
        },
        "openIncidents": {
          "type": "integer",
          "minimum": 0,
          "maximum": 9007199254740991,
          "description": ""
        },
        "unknownEvaluations": {
          "type": "integer",
          "minimum": 0,
          "maximum": 9007199254740991,
          "description": ""
        }
      },
      "required": [
        "observedEvents",
        "confirmedProcessing",
        "openIncidents",
        "unknownEvaluations"
      ],
      "additionalProperties": false
    },
    "EventVolumeBucketResponse": {
      "type": "object",
      "description": "",
      "properties": {
        "startAt": {
          "$ref": "#/$defs/UtcTimestamp"
        },
        "endAt": {
          "$ref": "#/$defs/UtcTimestamp"
        },
        "count": {
          "type": "integer",
          "minimum": 0,
          "maximum": 9007199254740991,
          "description": ""
        },
        "partial": {
          "type": "boolean"
        }
      },
      "required": [
        "startAt",
        "endAt",
        "count",
        "partial"
      ],
      "additionalProperties": false
    },
    "OverviewResponse": {
      "type": "object",
      "description": "",
      "properties": {
        "range": {
          "type": "string",
          "enum": [
            "1h",
            "24h",
            "7d"
          ],
          "description": ""
        },
        "bucket": {
          "type": "string",
          "enum": [
            "hour",
            "day"
          ],
          "description": ""
        },
        "applicationId": {
          "anyOf": [
            {
              "$ref": "#/$defs/Id"
            },
            {
              "type": "null"
            }
          ]
        },
        "asOf": {
          "$ref": "#/$defs/UtcTimestamp"
        },
        "windowStart": {
          "$ref": "#/$defs/UtcTimestamp"
        },
        "windowEnd": {
          "$ref": "#/$defs/UtcTimestamp"
        },
        "stats": {
          "$ref": "#/$defs/OverviewStatsResponse"
        },
        "volumeBuckets": {
          "type": "array",
          "items": {
            "$ref": "#/$defs/EventVolumeBucketResponse"
          },
          "minItems": 0
        },
        "latestIncidents": {
          "type": "array",
          "items": {
            "$ref": "#/$defs/IncidentSummaryResponse"
          },
          "minItems": 0,
          "maxItems": 5
        }
      },
      "required": [
        "range",
        "bucket",
        "applicationId",
        "asOf",
        "windowStart",
        "windowEnd",
        "stats",
        "volumeBuckets",
        "latestIncidents"
      ],
      "additionalProperties": false
    },
    "PageResponse": {
      "type": "object",
      "description": "",
      "properties": {
        "items": {
          "type": "array",
          "items": {
            "type": "object"
          },
          "minItems": 0
        },
        "page": {
          "type": "integer",
          "minimum": 0,
          "maximum": 2147483647
        },
        "size": {
          "type": "integer",
          "minimum": 1,
          "maximum": 100
        },
        "totalItems": {
          "type": "integer",
          "minimum": 0,
          "maximum": 9007199254740991,
          "description": ""
        },
        "totalPages": {
          "type": "integer",
          "minimum": 0,
          "maximum": 9007199254740991,
          "description": ""
        }
      },
      "required": [
        "items",
        "page",
        "size",
        "totalItems",
        "totalPages"
      ],
      "additionalProperties": false
    },
    "ApplicationPageResponse": {
      "type": "object",
      "description": "",
      "properties": {
        "items": {
          "type": "array",
          "items": {
            "$ref": "#/$defs/ApplicationResponse"
          },
          "minItems": 0
        },
        "page": {
          "type": "integer",
          "minimum": 0,
          "maximum": 2147483647
        },
        "size": {
          "type": "integer",
          "minimum": 1,
          "maximum": 100
        },
        "totalItems": {
          "type": "integer",
          "minimum": 0,
          "maximum": 9007199254740991,
          "description": ""
        },
        "totalPages": {
          "type": "integer",
          "minimum": 0,
          "maximum": 9007199254740991,
          "description": ""
        }
      },
      "required": [
        "items",
        "page",
        "size",
        "totalItems",
        "totalPages"
      ],
      "additionalProperties": false
    },
    "EventPageResponse": {
      "type": "object",
      "description": "",
      "properties": {
        "items": {
          "type": "array",
          "items": {
            "$ref": "#/$defs/EventSummaryResponse"
          },
          "minItems": 0
        },
        "page": {
          "type": "integer",
          "minimum": 0,
          "maximum": 2147483647
        },
        "size": {
          "type": "integer",
          "minimum": 1,
          "maximum": 100
        },
        "totalItems": {
          "type": "integer",
          "minimum": 0,
          "maximum": 9007199254740991,
          "description": ""
        },
        "totalPages": {
          "type": "integer",
          "minimum": 0,
          "maximum": 9007199254740991,
          "description": ""
        }
      },
      "required": [
        "items",
        "page",
        "size",
        "totalItems",
        "totalPages"
      ],
      "additionalProperties": false
    },
    "RulePageResponse": {
      "type": "object",
      "description": "",
      "properties": {
        "items": {
          "type": "array",
          "items": {
            "$ref": "#/$defs/MonitoringRuleResponse"
          },
          "minItems": 0
        },
        "page": {
          "type": "integer",
          "minimum": 0,
          "maximum": 2147483647
        },
        "size": {
          "type": "integer",
          "minimum": 1,
          "maximum": 100
        },
        "totalItems": {
          "type": "integer",
          "minimum": 0,
          "maximum": 9007199254740991,
          "description": ""
        },
        "totalPages": {
          "type": "integer",
          "minimum": 0,
          "maximum": 9007199254740991,
          "description": ""
        }
      },
      "required": [
        "items",
        "page",
        "size",
        "totalItems",
        "totalPages"
      ],
      "additionalProperties": false
    },
    "IncidentPageResponse": {
      "type": "object",
      "description": "",
      "properties": {
        "items": {
          "type": "array",
          "items": {
            "$ref": "#/$defs/IncidentSummaryResponse"
          },
          "minItems": 0
        },
        "page": {
          "type": "integer",
          "minimum": 0,
          "maximum": 2147483647
        },
        "size": {
          "type": "integer",
          "minimum": 1,
          "maximum": 100
        },
        "totalItems": {
          "type": "integer",
          "minimum": 0,
          "maximum": 9007199254740991,
          "description": ""
        },
        "totalPages": {
          "type": "integer",
          "minimum": 0,
          "maximum": 9007199254740991,
          "description": ""
        }
      },
      "required": [
        "items",
        "page",
        "size",
        "totalItems",
        "totalPages"
      ],
      "additionalProperties": false
    },
    "FieldErrorResponse": {
      "type": "object",
      "description": "",
      "properties": {
        "field": {
          "type": "string",
          "description": "Field/query path.",
          "minLength": 1,
          "maxLength": 200,
          "pattern": "\\S"
        },
        "code": {
          "type": "string",
          "description": "Validation code.",
          "minLength": 1,
          "maxLength": 100,
          "pattern": "\\S"
        },
        "message": {
          "type": "string",
          "description": "Safe explanation; không echo secret.",
          "minLength": 1,
          "maxLength": 500,
          "pattern": "\\S"
        }
      },
      "required": [
        "field",
        "code",
        "message"
      ],
      "additionalProperties": false
    },
    "ApiErrorResponse": {
      "type": "object",
      "description": "",
      "properties": {
        "code": {
          "type": "string",
          "enum": [
            "MALFORMED_JSON",
            "INVALID_QUERY",
            "VALIDATION_ERROR",
            "UNAUTHENTICATED",
            "FORBIDDEN",
            "RESOURCE_NOT_FOUND",
            "VERSION_CONFLICT",
            "INVALID_STATE_TRANSITION",
            "REPORT_PAYLOAD_CONFLICT",
            "IDENTITY_CONFLICT",
            "METHOD_NOT_ALLOWED",
            "UNSUPPORTED_MEDIA_TYPE",
            "INTERNAL_ERROR",
            "SERVICE_UNAVAILABLE"
          ],
          "description": ""
        },
        "message": {
          "type": "string",
          "description": "",
          "minLength": 1,
          "maxLength": 1000,
          "pattern": "\\S"
        },
        "requestId": {
          "$ref": "#/$defs/Id"
        },
        "fieldErrors": {
          "type": "array",
          "items": {
            "$ref": "#/$defs/FieldErrorResponse"
          },
          "minItems": 0
        },
        "currentVersion": {
          "anyOf": [
            {
              "$ref": "#/$defs/NonNegativeInt64String"
            },
            {
              "type": "null"
            }
          ]
        }
      },
      "required": [
        "code",
        "message",
        "requestId",
        "fieldErrors",
        "currentVersion"
      ],
      "additionalProperties": false
    },
    "InternalProcessingReportRequest": {
      "type": "object",
      "description": "",
      "properties": {
        "applicationId": {
          "$ref": "#/$defs/Id"
        },
        "producerId": {
          "$ref": "#/$defs/Id"
        },
        "eventId": {
          "$ref": "#/$defs/Id"
        },
        "producerAttemptId": {
          "$ref": "#/$defs/Id"
        },
        "producerReportId": {
          "$ref": "#/$defs/Id"
        },
        "attemptNo": {
          "anyOf": [
            {
              "type": "integer",
              "minimum": 1,
              "maximum": 2147483647
            },
            {
              "type": "null"
            }
          ]
        },
        "reportedStatus": {
          "$ref": "#/$defs/ProcessingReportStatus"
        },
        "startedAt": {
          "anyOf": [
            {
              "$ref": "#/$defs/UtcTimestamp"
            },
            {
              "type": "null"
            }
          ]
        },
        "finishedAt": {
          "anyOf": [
            {
              "$ref": "#/$defs/UtcTimestamp"
            },
            {
              "type": "null"
            }
          ]
        },
        "reportedAt": {
          "$ref": "#/$defs/UtcTimestamp"
        },
        "errorCode": {
          "anyOf": [
            {
              "type": "string",
              "description": "",
              "minLength": 1,
              "maxLength": 100,
              "pattern": "\\S"
            },
            {
              "type": "null"
            }
          ]
        }
      },
      "required": [
        "applicationId",
        "producerId",
        "eventId",
        "producerAttemptId",
        "producerReportId",
        "attemptNo",
        "reportedStatus",
        "startedAt",
        "finishedAt",
        "reportedAt",
        "errorCode"
      ],
      "additionalProperties": false,
      "allOf": [
        {
          "if": {
            "properties": {
              "reportedStatus": {
                "const": "STARTED"
              }
            }
          },
          "then": {
            "properties": {
              "finishedAt": {
                "type": "null"
              }
            }
          }
        }
      ]
    },
    "InternalReportAckResponse": {
      "type": "object",
      "description": "",
      "properties": {
        "reportId": {
          "$ref": "#/$defs/Id"
        },
        "attemptId": {
          "$ref": "#/$defs/Id"
        },
        "observedEventId": {
          "$ref": "#/$defs/Id"
        },
        "replayed": {
          "type": "boolean"
        },
        "hasReportConflict": {
          "type": "boolean"
        }
      },
      "required": [
        "reportId",
        "attemptId",
        "observedEventId",
        "replayed",
        "hasReportConflict"
      ],
      "additionalProperties": false
    }
  }
}
```

</details>

## 8. Supplementary DTO examples

Ví dụ types dùng lồng nhau hoặc errors chưa xuất hiện riêng trong các operations. Những fields null thể hiện giới hạn quan sát, không phải JSON parse error.

### Example — TimeoutRuleConfig

<!-- schema: TimeoutRuleConfig -->
```json
{
  "thresholdSeconds": 60,
  "completionBasis": "FIRST_TRUSTED_SUCCESS"
}
```

### Example — DuplicateRuleConfig

<!-- schema: DuplicateRuleConfig -->
```json
{
  "maxEffects": 1,
  "sourcePolicy": "EVENT_BOUND_SOURCE"
}
```

### Example — InvariantRuleConfig

<!-- schema: InvariantRuleConfig -->
```json
{
  "expectedSource": "ORDER_EXPECTATION",
  "comparison": "TOTAL_DELTA_EQUALS_EXPECTED"
}
```

### Example — RuleResultSummaryResponse

<!-- schema: RuleResultSummaryResponse -->
```json
{
  "evaluationId": "eval-003-002-g1",
  "ruleId": "rule-002",
  "ruleType": "DUPLICATE_BUSINESS_EFFECT",
  "outcome": "VIOLATION",
  "reasonCode": "DUPLICATE_EFFECTS_PROVEN",
  "evaluatedAt": "2026-10-17T10:10:00Z"
}
```

### Example — EventSummaryResponse

<!-- schema: EventSummaryResponse -->
```json
{
  "id": "evt-003",
  "eventId": "order-paid-1003",
  "applicationId": "app-001",
  "applicationName": "Loyalty Sandbox",
  "eventType": "ORDER_PAID",
  "correlationId": "ord-1003",
  "occurredAt": "2026-10-17T10:02:00Z",
  "observationStatus": "OBSERVED",
  "processingStatus": "CONFIRMED",
  "processingStatusReason": "Một trusted attempt báo SUCCEEDED; business rules vẫn có thể vi phạm.",
  "reportedAttemptCount": 1,
  "hasReportConflict": false,
  "evaluationState": "CURRENT",
  "ruleResults": [
    {
      "evaluationId": "eval-003-001-g1",
      "ruleId": "rule-001",
      "ruleType": "TIMEOUT",
      "outcome": "PASS",
      "reasonCode": "COMPLETED_WITHIN_THRESHOLD",
      "evaluatedAt": "2026-10-17T10:10:00Z"
    },
    {
      "evaluationId": "eval-003-002-g1",
      "ruleId": "rule-002",
      "ruleType": "DUPLICATE_BUSINESS_EFFECT",
      "outcome": "VIOLATION",
      "reasonCode": "DUPLICATE_EFFECTS_PROVEN",
      "evaluatedAt": "2026-10-17T10:10:00Z"
    },
    {
      "evaluationId": "eval-003-003-g1",
      "ruleId": "rule-003",
      "ruleType": "DATA_INVARIANT",
      "outcome": "VIOLATION",
      "reasonCode": "TOTAL_DELTA_MISMATCH",
      "evaluatedAt": "2026-10-17T10:10:00Z"
    }
  ],
  "relatedIncidentId": "inc-001"
}
```

### Example — ProcessingReportResponse

<!-- schema: ProcessingReportResponse -->
```json
{
  "id": "rpt-003-1",
  "attemptId": "att-003-1",
  "producerReportId": "producer-rpt-003-1",
  "reportedStatus": "SUCCEEDED",
  "startedAt": "2026-10-17T10:02:01Z",
  "finishedAt": "2026-10-17T10:02:02Z",
  "reportedAt": "2026-10-17T10:02:02Z",
  "receivedAt": "2026-10-17T10:02:03Z",
  "errorCode": null
}
```

### Example — ProcessingAttemptResponse

<!-- schema: ProcessingAttemptResponse -->
```json
{
  "id": "att-003-1",
  "producerAttemptId": "producer-att-003-1",
  "attemptNo": 1,
  "status": "SUCCEEDED",
  "startedAt": "2026-10-17T10:02:01Z",
  "finishedAt": "2026-10-17T10:02:02Z",
  "reportIds": [
    "rpt-003-1"
  ],
  "hasTerminalConflict": false
}
```

### Example — EvidenceGapResponse

<!-- schema: EvidenceGapResponse -->
```json
{
  "code": "REPORT_MISSING",
  "message": "Chưa nhận processing report; chưa biết tổng attempts.",
  "missingFields": [
    "successfulFinishedAt"
  ]
}
```

### Example — BusinessEffectResponse

<!-- schema: BusinessEffectResponse -->
```json
{
  "id": "eff-003-1",
  "eventId": "order-paid-1003",
  "customerRef": "cust-demo-001",
  "delta": "100",
  "createdAt": "2026-10-17T10:02:02Z"
}
```

### Example — EvidenceScopeResponse

<!-- schema: EvidenceScopeResponse -->
```json
{
  "eventId": "order-paid-1003",
  "customerRef": "cust-demo-001",
  "runId": "run-ds03"
}
```

### Example — LedgerSnapshotResponse

<!-- schema: LedgerSnapshotResponse -->
```json
{
  "expectedPoints": "100",
  "effectCount": 2,
  "totalDelta": "200",
  "effects": [
    {
      "id": "eff-003-1",
      "eventId": "order-paid-1003",
      "customerRef": "cust-demo-001",
      "delta": "100",
      "createdAt": "2026-10-17T10:02:02Z"
    },
    {
      "id": "eff-003-2",
      "eventId": "order-paid-1003",
      "customerRef": "cust-demo-001",
      "delta": "100",
      "createdAt": "2026-10-17T10:02:02Z"
    }
  ]
}
```

### Example — EvidenceResponse

<!-- schema: EvidenceResponse -->
```json
{
  "id": "ev-003-ledger",
  "observedEventId": "evt-003",
  "kind": "LEDGER_SNAPSHOT",
  "sourceKey": "loyalty-fault-v1",
  "sourceLabel": "Sandbox injected faulty ledger",
  "scope": {
    "eventId": "order-paid-1003",
    "customerRef": "cust-demo-001",
    "runId": "run-ds03"
  },
  "coverage": "COMPLETE",
  "trust": "TRUSTED",
  "finality": "FINAL",
  "snapshotAt": "2026-10-17T10:10:00Z",
  "collectedAt": "2026-10-17T10:10:00Z",
  "supersedesEvidenceId": null,
  "ledger": {
    "expectedPoints": "100",
    "effectCount": 2,
    "totalDelta": "200",
    "effects": [
      {
        "id": "eff-003-1",
        "eventId": "order-paid-1003",
        "customerRef": "cust-demo-001",
        "delta": "100",
        "createdAt": "2026-10-17T10:02:02Z"
      },
      {
        "id": "eff-003-2",
        "eventId": "order-paid-1003",
        "customerRef": "cust-demo-001",
        "delta": "100",
        "createdAt": "2026-10-17T10:02:02Z"
      }
    ]
  },
  "reportIds": [],
  "gaps": []
}
```

### Example — RuleEvaluationResponse

<!-- schema: RuleEvaluationResponse -->
```json
{
  "id": "eval-003-002-g1",
  "observedEventId": "evt-003",
  "ruleId": "rule-002",
  "ruleType": "DUPLICATE_BUSINESS_EFFECT",
  "ruleVersion": "1",
  "configSnapshot": {
    "maxEffects": 1,
    "sourcePolicy": "EVENT_BOUND_SOURCE"
  },
  "inputGeneration": "1",
  "outcome": "VIOLATION",
  "reasonCode": "DUPLICATE_EFFECTS_PROVEN",
  "reason": "Hai distinct effect IDs cùng event và sandbox run.",
  "evaluatedAt": "2026-10-17T10:10:00Z",
  "evidenceIds": [
    "ev-003-ledger"
  ],
  "isLatest": true
}
```

### Example — RuleReferenceResponse

<!-- schema: RuleReferenceResponse -->
```json
{
  "id": "rule-002",
  "ruleType": "DUPLICATE_BUSINESS_EFFECT",
  "name": "No duplicate business effects"
}
```

### Example — IncidentSummaryResponse

<!-- schema: IncidentSummaryResponse -->
```json
{
  "id": "inc-001",
  "applicationId": "app-001",
  "applicationName": "Loyalty Sandbox",
  "observedEventId": "evt-003",
  "eventId": "order-paid-1003",
  "primaryRule": {
    "id": "rule-002",
    "ruleType": "DUPLICATE_BUSINESS_EFFECT",
    "name": "No duplicate business effects"
  },
  "severity": "HIGH",
  "status": "OPEN",
  "summary": "Hai loyalty effects cùng logical event",
  "openedAt": "2026-10-17T10:10:00Z",
  "resolvedAt": null,
  "version": "0"
}
```

### Example — IncidentHistoryResponse

<!-- schema: IncidentHistoryResponse -->
```json
{
  "id": "hist-001-1",
  "action": "CREATED",
  "fromStatus": null,
  "toStatus": "OPEN",
  "actorRef": "system",
  "note": "Duplicate và invariant evaluations vi phạm.",
  "createdAt": "2026-10-17T10:10:00Z"
}
```

### Example — OverviewStatsResponse

<!-- schema: OverviewStatsResponse -->
```json
{
  "observedEvents": 30,
  "confirmedProcessing": 18,
  "openIncidents": 3,
  "unknownEvaluations": 26
}
```

### Example — EventVolumeBucketResponse

<!-- schema: EventVolumeBucketResponse -->
```json
{
  "startAt": "2026-10-17T10:00:00Z",
  "endAt": "2026-10-17T11:00:00Z",
  "count": 5,
  "partial": true
}
```

### Example — PageResponse

<!-- schema: PageResponse -->
```json
{
  "items": [],
  "page": 0,
  "size": 10,
  "totalItems": 0,
  "totalPages": 0
}
```

### Example — FieldErrorResponse

<!-- schema: FieldErrorResponse -->
```json
{
  "field": "name",
  "code": "NOT_BLANK",
  "message": "Tên không được rỗng sau trim."
}
```

### Example — ApiErrorResponse

<!-- schema: ApiErrorResponse -->
```json
{
  "code": "VERSION_CONFLICT",
  "message": "Incident đã được thay đổi; tải lại trước khi cập nhật.",
  "requestId": "req-demo-001",
  "fieldErrors": [],
  "currentVersion": "1"
}
```

### Example — ApiErrorResponse validation failure

<!-- schema: ApiErrorResponse -->
```json
{
  "code": "VALIDATION_ERROR",
  "message": "Request không hợp lệ.",
  "requestId": "req-demo-002",
  "fieldErrors": [
    {
      "field": "name",
      "code": "NOT_BLANK",
      "message": "Tên không được rỗng sau trim."
    }
  ],
  "currentVersion": null
}
```

### Example — DS-04 — observed event, missing reports and ledger

<!-- schema: EventDetailResponse -->
```json
{
  "id": "evt-004",
  "eventId": "order-paid-1004",
  "applicationId": "app-001",
  "applicationName": "Loyalty Sandbox",
  "eventType": "ORDER_PAID",
  "correlationId": "ord-1004",
  "occurredAt": "2026-10-17T10:03:00Z",
  "observationStatus": "OBSERVED",
  "processingStatus": "UNKNOWN",
  "processingStatusReason": "Chưa có processing report; actual attempts và business effects chưa đủ bằng chứng.",
  "reportedAttemptCount": 0,
  "hasReportConflict": false,
  "evaluationState": "CURRENT",
  "ruleResults": [
    {
      "evaluationId": "eval-004-001-g1",
      "ruleId": "rule-001",
      "ruleType": "TIMEOUT",
      "outcome": "UNKNOWN",
      "reasonCode": "TIMEOUT_CANDIDATE",
      "evaluatedAt": "2026-10-17T10:10:00Z"
    },
    {
      "evaluationId": "eval-004-002-g1",
      "ruleId": "rule-002",
      "ruleType": "DUPLICATE_BUSINESS_EFFECT",
      "outcome": "UNKNOWN",
      "reasonCode": "EVIDENCE_UNAVAILABLE",
      "evaluatedAt": "2026-10-17T10:10:00Z"
    },
    {
      "evaluationId": "eval-004-003-g1",
      "ruleId": "rule-003",
      "ruleType": "DATA_INVARIANT",
      "outcome": "UNKNOWN",
      "reasonCode": "EVIDENCE_UNAVAILABLE",
      "evaluatedAt": "2026-10-17T10:10:00Z"
    }
  ],
  "relatedIncidentId": null,
  "customerRef": "cust-demo-001",
  "expectedPoints": "100",
  "evidenceSourceKey": "loyalty-normal-v1",
  "firstSeenAt": "2026-10-17T10:03:01Z",
  "evaluationGeneration": "1",
  "evaluatedGeneration": "1",
  "attempts": [],
  "reports": [],
  "evaluations": [
    {
      "id": "eval-004-001-g1",
      "observedEventId": "evt-004",
      "ruleId": "rule-001",
      "ruleType": "TIMEOUT",
      "ruleVersion": "1",
      "configSnapshot": {
        "thresholdSeconds": 60,
        "completionBasis": "FIRST_TRUSTED_SUCCESS"
      },
      "inputGeneration": "1",
      "outcome": "UNKNOWN",
      "reasonCode": "TIMEOUT_CANDIDATE",
      "reason": "Elapsed 420 giây tại evaluatedAt, thiếu successful finishedAt nên chỉ là candidate.",
      "evaluatedAt": "2026-10-17T10:10:00Z",
      "evidenceIds": [
        "ev-004-missing"
      ],
      "isLatest": true
    },
    {
      "id": "eval-004-002-g1",
      "observedEventId": "evt-004",
      "ruleId": "rule-002",
      "ruleType": "DUPLICATE_BUSINESS_EFFECT",
      "ruleVersion": "1",
      "configSnapshot": {
        "maxEffects": 1,
        "sourcePolicy": "EVENT_BOUND_SOURCE"
      },
      "inputGeneration": "1",
      "outcome": "UNKNOWN",
      "reasonCode": "EVIDENCE_UNAVAILABLE",
      "reason": "Không có ledger evidence đủ scope để kết luận.",
      "evaluatedAt": "2026-10-17T10:10:00Z",
      "evidenceIds": [
        "ev-004-missing"
      ],
      "isLatest": true
    },
    {
      "id": "eval-004-003-g1",
      "observedEventId": "evt-004",
      "ruleId": "rule-003",
      "ruleType": "DATA_INVARIANT",
      "ruleVersion": "1",
      "configSnapshot": {
        "expectedSource": "ORDER_EXPECTATION",
        "comparison": "TOTAL_DELTA_EQUALS_EXPECTED"
      },
      "inputGeneration": "1",
      "outcome": "UNKNOWN",
      "reasonCode": "EVIDENCE_UNAVAILABLE",
      "reason": "Không có ledger evidence đủ scope để kết luận.",
      "evaluatedAt": "2026-10-17T10:10:00Z",
      "evidenceIds": [
        "ev-004-missing"
      ],
      "isLatest": true
    }
  ],
  "evidence": [
    {
      "id": "ev-004-missing",
      "observedEventId": "evt-004",
      "kind": "GAP",
      "sourceKey": "event-observer",
      "sourceLabel": "Observation with missing business evidence",
      "scope": {
        "eventId": "order-paid-1004",
        "customerRef": "cust-demo-001",
        "runId": null
      },
      "coverage": "NONE",
      "trust": "UNTRUSTED",
      "finality": "UNKNOWN",
      "snapshotAt": null,
      "collectedAt": "2026-10-17T10:10:00Z",
      "supersedesEvidenceId": null,
      "ledger": null,
      "reportIds": [],
      "gaps": [
        {
          "code": "REPORT_MISSING",
          "message": "Chưa có report cho event này.",
          "missingFields": [
            "successfulFinishedAt"
          ]
        },
        {
          "code": "EVIDENCE_UNAVAILABLE",
          "message": "Chưa có independent ledger snapshot đủ dùng.",
          "missingFields": [
            "ledgerSnapshot"
          ]
        }
      ]
    }
  ]
}
```

### Example — DS-05 — independent ledger without attempt timeline

<!-- schema: EventDetailResponse -->
```json
{
  "id": "evt-005",
  "eventId": "order-paid-1005",
  "applicationId": "app-001",
  "applicationName": "Loyalty Sandbox",
  "eventType": "ORDER_PAID",
  "correlationId": "ord-1005",
  "occurredAt": "2026-10-17T10:04:00Z",
  "observationStatus": "OBSERVED",
  "processingStatus": "UNKNOWN",
  "processingStatusReason": "Report chưa tới; independent ledger không khôi phục timeline attempts.",
  "reportedAttemptCount": 0,
  "hasReportConflict": false,
  "evaluationState": "CURRENT",
  "ruleResults": [
    {
      "evaluationId": "eval-005-001-g1",
      "ruleId": "rule-001",
      "ruleType": "TIMEOUT",
      "outcome": "UNKNOWN",
      "reasonCode": "SUCCESSFUL_COMPLETION_MISSING",
      "evaluatedAt": "2026-10-17T10:10:00Z"
    },
    {
      "evaluationId": "eval-005-002-g1",
      "ruleId": "rule-002",
      "ruleType": "DUPLICATE_BUSINESS_EFFECT",
      "outcome": "PASS",
      "reasonCode": "NO_DUPLICATE_IN_FINAL_SCOPE",
      "evaluatedAt": "2026-10-17T10:10:00Z"
    },
    {
      "evaluationId": "eval-005-003-g1",
      "ruleId": "rule-003",
      "ruleType": "DATA_INVARIANT",
      "outcome": "PASS",
      "reasonCode": "EXPECTED_TOTAL_MATCHES",
      "evaluatedAt": "2026-10-17T10:10:00Z"
    }
  ],
  "relatedIncidentId": null,
  "customerRef": "cust-demo-001",
  "expectedPoints": "100",
  "evidenceSourceKey": "loyalty-normal-v1",
  "firstSeenAt": "2026-10-17T10:04:01Z",
  "evaluationGeneration": "1",
  "evaluatedGeneration": "1",
  "attempts": [],
  "reports": [],
  "evaluations": [
    {
      "id": "eval-005-001-g1",
      "observedEventId": "evt-005",
      "ruleId": "rule-001",
      "ruleType": "TIMEOUT",
      "ruleVersion": "1",
      "configSnapshot": {
        "thresholdSeconds": 60,
        "completionBasis": "FIRST_TRUSTED_SUCCESS"
      },
      "inputGeneration": "1",
      "outcome": "UNKNOWN",
      "reasonCode": "SUCCESSFUL_COMPLETION_MISSING",
      "reason": "Ledger snapshot không có successful finishedAt.",
      "evaluatedAt": "2026-10-17T10:10:00Z",
      "evidenceIds": [
        "ev-005-ledger"
      ],
      "isLatest": true
    },
    {
      "id": "eval-005-002-g1",
      "observedEventId": "evt-005",
      "ruleId": "rule-002",
      "ruleType": "DUPLICATE_BUSINESS_EFFECT",
      "ruleVersion": "1",
      "configSnapshot": {
        "maxEffects": 1,
        "sourcePolicy": "EVENT_BOUND_SOURCE"
      },
      "inputGeneration": "1",
      "outcome": "PASS",
      "reasonCode": "NO_DUPLICATE_IN_FINAL_SCOPE",
      "reason": "Independent COMPLETE/TRUSTED/FINAL ledger có một effect +100 đúng expectation.",
      "evaluatedAt": "2026-10-17T10:10:00Z",
      "evidenceIds": [
        "ev-005-ledger"
      ],
      "isLatest": true
    },
    {
      "id": "eval-005-003-g1",
      "observedEventId": "evt-005",
      "ruleId": "rule-003",
      "ruleType": "DATA_INVARIANT",
      "ruleVersion": "1",
      "configSnapshot": {
        "expectedSource": "ORDER_EXPECTATION",
        "comparison": "TOTAL_DELTA_EQUALS_EXPECTED"
      },
      "inputGeneration": "1",
      "outcome": "PASS",
      "reasonCode": "EXPECTED_TOTAL_MATCHES",
      "reason": "Independent COMPLETE/TRUSTED/FINAL ledger có một effect +100 đúng expectation.",
      "evaluatedAt": "2026-10-17T10:10:00Z",
      "evidenceIds": [
        "ev-005-ledger"
      ],
      "isLatest": true
    }
  ],
  "evidence": [
    {
      "id": "ev-005-ledger",
      "observedEventId": "evt-005",
      "kind": "LEDGER_SNAPSHOT",
      "sourceKey": "loyalty-normal-v1",
      "sourceLabel": "Independent normal ledger",
      "scope": {
        "eventId": "order-paid-1005",
        "customerRef": "cust-demo-001",
        "runId": null
      },
      "coverage": "COMPLETE",
      "trust": "TRUSTED",
      "finality": "FINAL",
      "snapshotAt": "2026-10-17T10:10:00Z",
      "collectedAt": "2026-10-17T10:10:00Z",
      "supersedesEvidenceId": null,
      "ledger": {
        "expectedPoints": "100",
        "effectCount": 1,
        "totalDelta": "100",
        "effects": [
          {
            "id": "eff-005-1",
            "eventId": "order-paid-1005",
            "customerRef": "cust-demo-001",
            "delta": "100",
            "createdAt": "2026-10-17T10:04:02Z"
          }
        ]
      },
      "reportIds": [],
      "gaps": []
    }
  ]
}
```

### Example — Same-attempt conflict — latest and historical revisions

<!-- schema: EventDetailResponse -->
```json
{
  "id": "evt-010",
  "eventId": "order-paid-1010",
  "applicationId": "app-001",
  "applicationName": "Loyalty Sandbox",
  "eventType": "ORDER_PAID",
  "correlationId": "ord-1010",
  "occurredAt": "2026-10-17T09:04:00Z",
  "observationStatus": "OBSERVED",
  "processingStatus": "UNKNOWN",
  "processingStatusReason": "Cùng một attempt có terminal reports SUCCEEDED và FAILED; không chọn một success để che conflict.",
  "reportedAttemptCount": 1,
  "hasReportConflict": true,
  "evaluationState": "CURRENT",
  "ruleResults": [
    {
      "evaluationId": "eval-010-001-g2",
      "ruleId": "rule-001",
      "ruleType": "TIMEOUT",
      "outcome": "UNKNOWN",
      "reasonCode": "CONFLICTING_TERMINAL_REPORTS",
      "evaluatedAt": "2026-10-17T10:10:00Z"
    },
    {
      "evaluationId": "eval-010-002-g2",
      "ruleId": "rule-002",
      "ruleType": "DUPLICATE_BUSINESS_EFFECT",
      "outcome": "PASS",
      "reasonCode": "NO_DUPLICATE_IN_FINAL_SCOPE",
      "evaluatedAt": "2026-10-17T10:10:00Z"
    },
    {
      "evaluationId": "eval-010-003-g2",
      "ruleId": "rule-003",
      "ruleType": "DATA_INVARIANT",
      "outcome": "PASS",
      "reasonCode": "EXPECTED_TOTAL_MATCHES",
      "evaluatedAt": "2026-10-17T10:10:00Z"
    }
  ],
  "relatedIncidentId": null,
  "customerRef": "cust-demo-001",
  "expectedPoints": "100",
  "evidenceSourceKey": "loyalty-normal-v1",
  "firstSeenAt": "2026-10-17T09:04:01Z",
  "evaluationGeneration": "2",
  "evaluatedGeneration": "2",
  "attempts": [
    {
      "id": "att-010-1",
      "producerAttemptId": "producer-att-010-1",
      "attemptNo": 1,
      "status": "CONFLICTED",
      "startedAt": "2026-10-17T09:04:01Z",
      "finishedAt": null,
      "reportIds": [
        "rpt-010-1",
        "rpt-010-2"
      ],
      "hasTerminalConflict": true
    }
  ],
  "reports": [
    {
      "id": "rpt-010-1",
      "attemptId": "att-010-1",
      "producerReportId": "producer-rpt-010-1",
      "reportedStatus": "SUCCEEDED",
      "startedAt": "2026-10-17T09:04:01Z",
      "finishedAt": "2026-10-17T09:04:02Z",
      "reportedAt": "2026-10-17T09:04:02Z",
      "receivedAt": "2026-10-17T09:04:03Z",
      "errorCode": null
    },
    {
      "id": "rpt-010-2",
      "attemptId": "att-010-1",
      "producerReportId": "producer-rpt-010-2",
      "reportedStatus": "FAILED",
      "startedAt": "2026-10-17T09:04:01Z",
      "finishedAt": "2026-10-17T09:04:02Z",
      "reportedAt": "2026-10-17T09:04:03Z",
      "receivedAt": "2026-10-17T09:04:04Z",
      "errorCode": "CONTRADICTORY_TERMINAL_REPORT"
    }
  ],
  "evaluations": [
    {
      "id": "eval-010-001-g2",
      "observedEventId": "evt-010",
      "ruleId": "rule-001",
      "ruleType": "TIMEOUT",
      "ruleVersion": "1",
      "configSnapshot": {
        "thresholdSeconds": 60,
        "completionBasis": "FIRST_TRUSTED_SUCCESS"
      },
      "inputGeneration": "2",
      "outcome": "UNKNOWN",
      "reasonCode": "CONFLICTING_TERMINAL_REPORTS",
      "reason": "Terminal conflict chưa reconcile; TIMEOUT chưa đủ căn cứ.",
      "evaluatedAt": "2026-10-17T10:10:00Z",
      "evidenceIds": [
        "ev-010-report",
        "ev-010-conflict"
      ],
      "isLatest": true
    },
    {
      "id": "eval-010-002-g2",
      "observedEventId": "evt-010",
      "ruleId": "rule-002",
      "ruleType": "DUPLICATE_BUSINESS_EFFECT",
      "ruleVersion": "1",
      "configSnapshot": {
        "maxEffects": 1,
        "sourcePolicy": "EVENT_BOUND_SOURCE"
      },
      "inputGeneration": "2",
      "outcome": "PASS",
      "reasonCode": "NO_DUPLICATE_IN_FINAL_SCOPE",
      "reason": "Independent ledger vẫn đủ bằng chứng cho business rule.",
      "evaluatedAt": "2026-10-17T10:10:00Z",
      "evidenceIds": [
        "ev-010-ledger"
      ],
      "isLatest": true
    },
    {
      "id": "eval-010-003-g2",
      "observedEventId": "evt-010",
      "ruleId": "rule-003",
      "ruleType": "DATA_INVARIANT",
      "ruleVersion": "1",
      "configSnapshot": {
        "expectedSource": "ORDER_EXPECTATION",
        "comparison": "TOTAL_DELTA_EQUALS_EXPECTED"
      },
      "inputGeneration": "2",
      "outcome": "PASS",
      "reasonCode": "EXPECTED_TOTAL_MATCHES",
      "reason": "Independent ledger vẫn đủ bằng chứng cho business rule.",
      "evaluatedAt": "2026-10-17T10:10:00Z",
      "evidenceIds": [
        "ev-010-ledger"
      ],
      "isLatest": true
    },
    {
      "id": "eval-010-001-g1",
      "observedEventId": "evt-010",
      "ruleId": "rule-001",
      "ruleType": "TIMEOUT",
      "ruleVersion": "1",
      "configSnapshot": {
        "thresholdSeconds": 60,
        "completionBasis": "FIRST_TRUSTED_SUCCESS"
      },
      "inputGeneration": "1",
      "outcome": "PASS",
      "reasonCode": "COMPLETED_WITHIN_THRESHOLD",
      "reason": "Kết luận tại generation trước khi report conflict tới.",
      "evaluatedAt": "2026-10-17T09:04:03Z",
      "evidenceIds": [
        "ev-010-reports-g1"
      ],
      "isLatest": false
    },
    {
      "id": "eval-010-002-g1",
      "observedEventId": "evt-010",
      "ruleId": "rule-002",
      "ruleType": "DUPLICATE_BUSINESS_EFFECT",
      "ruleVersion": "1",
      "configSnapshot": {
        "maxEffects": 1,
        "sourcePolicy": "EVENT_BOUND_SOURCE"
      },
      "inputGeneration": "1",
      "outcome": "PASS",
      "reasonCode": "NO_DUPLICATE_IN_FINAL_SCOPE",
      "reason": "Kết luận tại generation trước khi report conflict tới.",
      "evaluatedAt": "2026-10-17T09:04:03Z",
      "evidenceIds": [
        "ev-010-ledger-g1"
      ],
      "isLatest": false
    },
    {
      "id": "eval-010-003-g1",
      "observedEventId": "evt-010",
      "ruleId": "rule-003",
      "ruleType": "DATA_INVARIANT",
      "ruleVersion": "1",
      "configSnapshot": {
        "expectedSource": "ORDER_EXPECTATION",
        "comparison": "TOTAL_DELTA_EQUALS_EXPECTED"
      },
      "inputGeneration": "1",
      "outcome": "PASS",
      "reasonCode": "EXPECTED_TOTAL_MATCHES",
      "reason": "Kết luận tại generation trước khi report conflict tới.",
      "evaluatedAt": "2026-10-17T09:04:03Z",
      "evidenceIds": [
        "ev-010-ledger-g1"
      ],
      "isLatest": false
    }
  ],
  "evidence": [
    {
      "id": "ev-010-reports-g1",
      "observedEventId": "evt-010",
      "kind": "REPORT_BATCH",
      "sourceKey": "processing-report",
      "sourceLabel": "Authenticated report before conflict",
      "scope": {
        "eventId": "order-paid-1010",
        "customerRef": "cust-demo-001",
        "runId": null
      },
      "coverage": "COMPLETE",
      "trust": "TRUSTED",
      "finality": "UNKNOWN",
      "snapshotAt": "2026-10-17T09:04:02Z",
      "collectedAt": "2026-10-17T09:04:03Z",
      "supersedesEvidenceId": null,
      "ledger": null,
      "reportIds": [
        "rpt-010-1"
      ],
      "gaps": []
    },
    {
      "id": "ev-010-ledger-g1",
      "observedEventId": "evt-010",
      "kind": "LEDGER_SNAPSHOT",
      "sourceKey": "loyalty-normal-v1",
      "sourceLabel": "Independent normal ledger",
      "scope": {
        "eventId": "order-paid-1010",
        "customerRef": "cust-demo-001",
        "runId": null
      },
      "coverage": "COMPLETE",
      "trust": "TRUSTED",
      "finality": "FINAL",
      "snapshotAt": "2026-10-17T09:04:03Z",
      "collectedAt": "2026-10-17T09:04:03Z",
      "supersedesEvidenceId": null,
      "ledger": {
        "expectedPoints": "100",
        "effectCount": 1,
        "totalDelta": "100",
        "effects": [
          {
            "id": "eff-010-1",
            "eventId": "order-paid-1010",
            "customerRef": "cust-demo-001",
            "delta": "100",
            "createdAt": "2026-10-17T09:04:02Z"
          }
        ]
      },
      "reportIds": [],
      "gaps": []
    },
    {
      "id": "ev-010-report",
      "observedEventId": "evt-010",
      "kind": "REPORT_BATCH",
      "sourceKey": "processing-report",
      "sourceLabel": "Authenticated conflicting reports",
      "scope": {
        "eventId": "order-paid-1010",
        "customerRef": "cust-demo-001",
        "runId": null
      },
      "coverage": "COMPLETE",
      "trust": "CONFLICTED",
      "finality": "UNKNOWN",
      "snapshotAt": "2026-10-17T09:04:03Z",
      "collectedAt": "2026-10-17T09:04:04Z",
      "supersedesEvidenceId": "ev-010-reports-g1",
      "ledger": null,
      "reportIds": [
        "rpt-010-1",
        "rpt-010-2"
      ],
      "gaps": []
    },
    {
      "id": "ev-010-conflict",
      "observedEventId": "evt-010",
      "kind": "CORRELATION_CONFLICT",
      "sourceKey": "processing-report",
      "sourceLabel": "Same-attempt terminal conflict",
      "scope": {
        "eventId": "order-paid-1010",
        "customerRef": "cust-demo-001",
        "runId": null
      },
      "coverage": "PARTIAL",
      "trust": "CONFLICTED",
      "finality": "UNKNOWN",
      "snapshotAt": null,
      "collectedAt": "2026-10-17T09:04:04Z",
      "supersedesEvidenceId": null,
      "ledger": null,
      "reportIds": [
        "rpt-010-1",
        "rpt-010-2"
      ],
      "gaps": [
        {
          "code": "CONFLICTING_TERMINAL_REPORTS",
          "message": "Một producerAttemptId có hai terminal results trái nhau.",
          "missingFields": [
            "nonConflictingSuccessfulCompletion"
          ]
        }
      ]
    },
    {
      "id": "ev-010-ledger",
      "observedEventId": "evt-010",
      "kind": "LEDGER_SNAPSHOT",
      "sourceKey": "loyalty-normal-v1",
      "sourceLabel": "Independent normal ledger",
      "scope": {
        "eventId": "order-paid-1010",
        "customerRef": "cust-demo-001",
        "runId": null
      },
      "coverage": "COMPLETE",
      "trust": "TRUSTED",
      "finality": "FINAL",
      "snapshotAt": "2026-10-17T10:10:00Z",
      "collectedAt": "2026-10-17T10:10:00Z",
      "supersedesEvidenceId": "ev-010-ledger-g1",
      "ledger": {
        "expectedPoints": "100",
        "effectCount": 1,
        "totalDelta": "100",
        "effects": [
          {
            "id": "eff-010-1",
            "eventId": "order-paid-1010",
            "customerRef": "cust-demo-001",
            "delta": "100",
            "createdAt": "2026-10-17T09:04:02Z"
          }
        ]
      },
      "reportIds": [],
      "gaps": []
    }
  ]
}
```


## 9. Traceability và implementation boundary

Ma trận [Use Case ↔ Screen ↔ Endpoint ↔ DTO ↔ Fixture ↔ AC](07-mock-data-spec.md#7-traceability) bao phủ tám screens, bảy luồng UC và mọi thao tác mock. Các acceptance criteria của tài liệu này là điều kiện kiểm khi triển khai, không là kết quả runtime đã đạt. Không có endpoint repair/replay, SQL rule editor hoặc ingestion từ browser.

Nguồn kỹ thuật: [HTTP Semantics — RFC 9110](https://www.rfc-editor.org/rfc/rfc9110.html), [Bearer header — RFC 6750](https://www.rfc-editor.org/rfc/rfc6750.html), [JavaScript safe integers](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Number/MAX_SAFE_INTEGER), [JSON Schema 2020-12](https://json-schema.org/draft/2020-12/json-schema-core). Status/error policy, decimal string wire format, local-demo boundary và version-check order ở đây là các lựa chọn cụ thể của ERM.
