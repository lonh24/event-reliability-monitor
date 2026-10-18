# ERM — Architecture Decision Records

Các ADR ghi quyết định thiết kế của ERM, dựa trên [Product Scope](01-product-scope.md), [Architecture](04-architecture.md), [Data Model](05-data-model.md), [API Contract](06-api-contract.md) và [Mock Data Spec](07-mock-data-spec.md). Status Accepted dưới đây có nghĩa lựa chọn thiết kế được dùng làm nền; không xác nhận thành phần đã được implement, triển khai hoặc kiểm thử runtime.

## ADR-01 — Frontend Technology

**Status:** Accepted — design; implementation pending.

**Context:** Dashboard có năm màn hình chính, hai detail routes, 404, forms/filters và shared state qua adapter. Prototype phải chạy bằng mock, có thể đổi sang Spring Boot API mà không viết lại business contracts.

**Alternatives:**

- React + TypeScript + Vite: client-rendered dashboard, typed DTOs và build tooling gọn.
- Spring MVC + Thymeleaf: thuận lợi nếu giao diện render cùng Backend, nhưng prototype phụ thuộc backend/view layer và khó chia sẻ đúng mock/HTTP interface theo mục tiêu hiện tại.
- Next.js/SSR: hỗ trợ server-rendering/full-stack, nhưng ERM không có SEO/public content requirement hoặc nhu cầu thêm Node server.
- Vanilla TypeScript: ít dependency, phải tự quản lý component/rendering/form/routing khi màn hình tăng.

**Decision:** React + TypeScript + Vite, client routing, shared service abstraction. Mock/HTTP adapters cùng method/type contract; pages không import fixtures hoặc gọi fetch rải rác. Không thêm Redux/Next.js nếu chưa có nhu cầu cụ thể.

**Rationale:** Phù hợp dữ liệu bảng/detail có tương tác và Spring Boot JSON API. TypeScript giữ field/status consistency; Vite phục vụ local/build mà không thêm application server vào kiến trúc mục tiêu.

**Consequences/trade-offs:** Cần quản lý client loading/error/stale requests và SPA route fallback khi deploy. Type checking không thay runtime response validation. Mock demo không chứng minh HTTP adapter hoạt động; setup/build/browser verification phải thực hiện riêng.

## ADR-02 — Kafka Integration Strategy

**Status:** Accepted — design; implementation pending.

**Context:** Prototype cần minh họa workflow bằng dữ liệu ổn định trước khi monitoring Backend hiện thực. Sản phẩm mục tiêu cần OrderPaid được publish/consume bất đồng bộ và có redelivery/failure windows.

**Alternatives:**

- Dashboard luôn gọi Kafka/Backend thật: khó chạy độc lập khi các components chưa tồn tại.
- Mock toàn bộ và bỏ Kafka khỏi sản phẩm cuối: không đáp ứng event-driven processing và các failure scenarios của ERM.
- Mock adapter cho prototype, Kafka bắt buộc trong Backend mục tiêu: chia rõ ranh giới triển khai và verification.

**Decision:** Dashboard prototype dùng deterministic mock adapter. Backend mục tiêu dùng topic erm.order-paid.v1, business group erm-loyalty-v1 và observer group erm-monitor-observer-v1 theo Architecture. Kafka là thành phần của sản phẩm mục tiêu, không phải lựa chọn có thể bỏ mà vẫn tuyên bố ERM end-to-end đã hoàn thành.

**Rationale:** UI có thể được xây và kiểm riêng bằng cùng contract, đồng thời giữ requirements cho real integration/crash/redelivery. Không buộc frontend mock phải có Docker/Kafka/PostgreSQL đang chạy.

**Consequences/trade-offs:** Mock không tái tạo latency, partition assignment, retention hoặc offset semantics thật. Phải thay adapter và chạy end-to-end/integration tests trước khi mô tả monitoring live. Không gắn nhãn consumer lag=0 như business correctness.

## ADR-03 — Monitoring Without Automatic Repair

**Status:** Accepted — design; implementation pending.

**Context:** Evidence có thể thiếu, trễ, xung đột hoặc chỉ đúng trong một snapshot/source. Sửa dữ liệu từ kết luận chưa đủ căn cứ có thể làm tăng sai lệch và phá ownership.

**Alternatives:**

- Monitor tự sửa balance/ledger hoặc replay event khi thấy anomaly.
- Monitor chỉ dựa reports và phát cảnh báo không có business evidence.
- Monitor thu evidence chỉ đọc, đánh giá có giải thích và cung cấp incident workflow cho developer.

**Decision:** Monitor chỉ SELECT evidence views; không business DML/production replay/repair endpoints. Incident RESOLVED chỉ là hồ sơ điều tra, không rewrite business effect hoặc historical outcome.

**Rationale:** Giữ nguyên trách nhiệm Demo Application và cho con người kiểm tra trước khi khắc phục. UNKNOWN được công bố rõ thay vì tạo hành động sửa tự động từ thiếu tín hiệu.

**Consequences/trade-offs:** ERM hỗ trợ điều tra, không tự hoàn tất remediation. Developer cần dùng quy trình sửa của application ngoài Dashboard. Read-only role và masking phải được chứng minh bằng permissions/tests; đây chưa là security implementation đã có.

## ADR-04 — Service Boundaries

**Status:** Accepted — design; implementation pending.

**Context:** Business processing và monitoring có ownership, failure behavior và quyền dữ liệu khác nhau. Tách quá nhiều services sẽ tăng vận hành mà không thêm giá trị cho phạm vi hiện tại.

**Alternatives:**

- Một service/database chia mọi bảng và quyền: đơn giản lúc đầu nhưng dễ để Monitor thay business data và trộn observation với processing.
- Mỗi producer/consumer/evaluator/evidence/case là một microservice: nhiều network hops, deploy units và failure modes chưa cần thiết.
- Hai Spring Boot services với modules bên trong và hai logical databases.

**Decision:** Demo Service chứa Order API, outbox relay, Loyalty consumer và sandbox fault module. Monitor Service chứa observer, report ingestion, evidence adapter, evaluator, incident manager và Dashboard API. PostgreSQL có thể chung một instance nhưng demo_db và monitor_db tách ownership; không cross-database FK. Evidence source là views, không service thứ ba.

**Rationale:** Đủ thể hiện distributed boundaries và independent observation nhưng giữ architecture triển khai được trong một MVP. HTTP processing reports và Kafka observation là các luồng riêng, không nhập làm một nguồn bằng chứng.

**Consequences/trade-offs:** Direct read-only evidence datasource coupling Monitor với views của Demo DB; adapter abstraction giúp thay transport sau này. Cần quản lý hai datasource quyền khác nhau trong Monitor; không có distributed snapshot/transaction xuyên hai DB. Service authentication nội bộ đơn giản theo producer allowlist, không xây IAM đa tenant ở phạm vi này.

## ADR-05 — Transactional Outbox & Idempotency

**Status:** Accepted — design; implementation pending.

**Context:** Order commit, Kafka publish và consumer database commit không phải một atomic transaction. Relay/consumer crash có thể tạo publish/redelivery lặp hoặc mất ý định publish nếu chỉ ghi DB rồi send.

**Alternatives:**

- Ghi order rồi publish trực tiếp: mất event nếu crash giữa hai bước.
- Đồng bộ Spring DB/Kafka transactions: vẫn có cửa sổ một resource đã commit còn resource kia lỗi.
- Transactional outbox + polling relay: thêm storage/worker nhưng giữ durable publish intent.
- Outbox + CDC: thêm hạ tầng hợp lý khi scale/operational needs rõ hơn.

**Decision:** T1 ghi order PAID + immutable outbox envelope trong demo_db. Relay publish cùng logical eventId, chỉ đánh published sau broker ack; có thể publish lại khi crash trước đánh dấu. T3 consumer claim processed_events bằng PK/ON CONFLICT, ghi loyalty_entries với UNIQUE(event_id) và atomic account increment trong cùng transaction. Ack business offset sau T3 commit; reporter best effort riêng.

**Rationale:** Bảo toàn ý định publish và at-most-one normal business effect dù delivery at-least-once, không cần thêm distributed transaction manager. Hai concurrent claims được DB unique constraints phân xử, không check-then-insert bằng SELECT.

**Consequences/trade-offs:** Outbox thêm polling latency/cleanup/worker responsibility; một relay worker ban đầu. Không hứa exactly-once toàn bộ hệ thống hoặc report delivery bền vững. Kafka idempotent producer không thay PostgreSQL idempotency. Cần integration/concurrency tests cho crash trước/sau commit và lost update account; schema không tự chứng minh customer/delta đúng nếu application validation sai.

## ADR-06 — Independent Event Observation

**Status:** Accepted — design; implementation pending.

**Context:** Khi processing report mất, Monitor cần một cách biết logical event tồn tại để thể hiện DS-04/05. Reports-only không đáp ứng yêu cầu đó.

**Alternatives:**

- Chỉ reports: ít ingestion paths, nhưng mất report thì mất dấu event.
- Observer Kafka group riêng: dùng event log hiện có và độc lập business group.
- Durable audit/outbox feed riêng: đối soát được thêm blind spots nhưng cần thêm nguồn/quyền/ingestion.

**Decision:** erm-monitor-observer-v1 consume erm.order-paid.v1 độc lập erm-loyalty-v1. UNIQUE(application_id,event_id) + DB-first offset ack. Report-first tạo REPORTED_ONLY placeholder, observer envelope hợp lệ nâng thành OBSERVED mà không tạo event thứ hai. Event identity conflict không overwrite canonical silently.

**Rationale:** Phân biệt event existence observation với thông tin attempt do application báo, không phụ thuộc một report đến thành công.

**Consequences/trade-offs:** Event chưa publish hoặc đã mất do retention không được bảo đảm quan sát. Initial earliest không phục hồi deleted records. Resume offsets + DB dedup cần test; audit/backfill feed chưa được triển khai. Fixture seed không phải lời giải ingestion runtime.

## ADR-07 — Evidence & UNKNOWN Semantics

**Status:** Accepted — design; contract details specified, implementation pending.

**Context:** Processing report thành công không đủ chứng minh ledger đúng; ngược lại mất report không bắt buộc tất cả rules UNKNOWN nếu business evidence độc lập đủ dùng. Report conflict và latest/history phải được giải thích nhất quán.

**Alternatives:**

- Binary pass/fail từ reports hoặc Kafka lag: dễ hiển thị nhưng đưa kết luận không có bằng chứng.
- Mất report luôn UNKNOWN cho mọi rule: bỏ qua independent proof đủ dùng.
- Rule-specific PASS/VIOLATION/UNKNOWN với provenance/scope/coverage/trust/finality và immutable history.

**Decision:** Chọn kết luận rule-specific theo Architecture. Evidence collector chỉ đọc consistent source snapshots; normal finality dựa committed processed marker, fault finality dựa SEALED run. Snapshot/processed marker timestamps không thay attempt finishedAt. Same-attempt terminal conflict làm processing và TIMEOUT UNKNOWN, giữ reports/flags; FAILED→SUCCEEDED ở hai attempts DS-02 không conflict. Business rules có thể kết luận từ ledger độc lập không chịu report conflict.

**Rationale:** Mỗi rule chỉ kết luận điều bằng chứng phù hợp cho phép. UNKNOWN là business outcome giải thích được, không HTTP error. Late evidence append revision với config/input snapshot, không sửa conclusion cũ để đẹp lịch sử.

**Consequences/trade-offs:** DTOs và read models phải biểu diễn null/gaps/conflicts thay một status tổng hợp. Latest counters không cộng mọi historical revisions. Source trust phụ thuộc configured producer/adapter và quyền truy cập, không chỉ label tự khai hoặc hash. Report auth token không chứng minh clocks/business truth; timing trust và conflict checks vẫn cần thiết.

## ADR-08 — Sandbox Fault Injection

**Status:** Accepted — design; implementation pending.

**Context:** DS-03 yêu cầu hai distinct effects cùng logical event, trong khi normal loyalty_entries có UNIQUE(event_id). Bỏ constraint để tạo lỗi sẽ phá invariant mặc định và làm demo sai ý nghĩa.

**Alternatives:**

- Disable/drop normal UNIQUE để tạo duplicate: không chấp nhận.
- Evidence-only fixture/adapter: nhẹ cho frontend, không minh họa đường ghi/đọc lỗi thực trong Backend.
- Fault database riêng: isolation mạnh hơn, thêm provisioning/datasource.
- Faulty ledger riêng trong schema sandbox với role/source/run rõ ràng.

**Decision:** Chọn demo_db.sandbox.fault_runs và faulty_loyalty_entries, fault_writer riêng, profile local/test allowlist và SEALED immutable run. Normal core ledger giữ UNIQUE/atomic account logic. DS-03 một invocation ghi eff-003-1 và eff-003-2 +100 trong run-ds03; không đồng thời credit normal account. Adapter đọc đúng bound source, không union normal/fault rows.

**Rationale:** Duplicate proof gồm hai stored effect identities và nguồn/coverage cụ thể, giữ normal system an toàn theo thiết kế mà không thêm service mới.

**Consequences/trade-offs:** Đây là fault injection có chủ đích, không bằng chứng normal UNIQUE bị vượt qua. Schema/role/gating/trigger SEALED cần tests khi triển khai. Prototype vẫn dùng deterministic fixture cùng identities và source label injected; không quảng cáo fixture là DB đã chạy.

## ADR-09 — Incident Grouping

**Status:** Accepted — design; contract details specified, implementation pending.

**Context:** Một event có thể vi phạm duplicate và invariant cùng lúc. Hai hồ sơ độc lập cho cùng anomaly làm loãng investigation; xóa violation sau resolve lại mất lịch sử.

**Alternatives:**

- Một incident cho mỗi rule evaluation: nhiều hồ sơ cho cùng event, không khớp DS-03.
- Một incident/event nhưng chỉ giữ primary rule: thiếu evidence từ rule khác.
- Một incident/observed event, nhiều linked historical VIOLATION evaluations và immutable history.

**Decision:** UNIQUE(observed_event_id) case; nhiều violation links; primary ở batch mở case ưu tiên DUPLICATE > DATA_INVARIANT > TIMEOUT rồi rule ID, giữ primary sau khi tạo. DS-03 có inc-001 primary rule-002/HIGH và hai links. Workflow OPEN→INVESTIGATING→RESOLVED, không direct resolve/reopen. API status mutation check expectedVersion trước transition, update version/status/history atomic; same-state/current-version là no-op.

**Rationale:** Một investigation có đủ các conclusions/evidence liên quan và concurrency rõ. RESOLVED là state của hồ sơ, không sửa business ledger hoặc historical evaluation. Late violations vẫn nối case cũ, không tự reopen; late PASS/UNKNOWN không tự đóng case.

**Consequences/trade-offs:** Chưa hỗ trợ recurring incidents/reopen cho cùng immutable event. Client phải xử lý409 bằng refetch, không retry stale version mù quáng. Incidents đã RESOLVED vẫn có thể hiển thị violations và late evidence; Dashboard cần giải thích rõ sự khác biệt giữa case lifecycle và business correctness.

## Contract conventions liên quan

[API Contract](06-api-contract.md) chốt thêm local-demo/protected boundaries, decimal-string BIGINT, strict DTO/query validation, stable pagination, POST rule config instances và internal report auth. [Mock Spec](07-mock-data-spec.md) chốt deterministic dataset, failure controls và reset. Những quy ước này cụ thể hóa các decisions ở trên; không thêm repair, rule scripting, service hoặc schema ownership trái Architecture.
