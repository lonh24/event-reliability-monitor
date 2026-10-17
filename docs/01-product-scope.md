# ERM — Product Scope

## 1. Bài toán và người sử dụng

Event Reliability Monitor (ERM) hướng tới một dashboard giúp backend developer điều tra sự kiện bất đồng bộ và tác động nghiệp vụ liên quan. Consumer có thể đã nhận hoặc báo xử lý một event nhưng dữ liệu nghiệp vụ vẫn thiếu, sai hoặc bị ghi nhiều lần. Developer cần lần theo event, các lần xử lý và bằng chứng để phân biệt lỗi thực sự với tình huống chưa đủ thông tin.

**Primary user:** backend developer vận hành hoặc điều tra ứng dụng Spring Boot sử dụng event bất đồng bộ.

**Main job:** tìm event xử lý chậm/lỗi, kiểm tra bất biến nghiệp vụ và hiểu timeline xử lý để quyết định bước điều tra tiếp theo. ERM cung cấp thông tin và bằng chứng; developer chịu trách nhiệm quyết định cách khắc phục.

### Vấn đề của cách nhìn chỉ dựa vào Kafka

Kafka offset và consumer lag phản ánh tiến độ tiêu thụ thông điệp theo cơ chế của broker/consumer. Lag bằng 0 không chứng minh một giao dịch nghiệp vụ đã ghi đúng: ứng dụng có thể ghi sai dữ liệu hoặc commit offset không đồng bộ với kết quả nghiệp vụ. Một thông báo thành công từ consumer cũng chỉ là báo cáo của ứng dụng, chưa thay thế việc đối chiếu trạng thái nghiệp vụ.

ERM không cam kết suy ra toàn bộ business truth từ Kafka hoặc từ một processing report đơn lẻ.

## 2. Mục tiêu sản phẩm và hiện trạng

Mục tiêu là giúp developer trả lời: event nào cần chú ý, đã được thử xử lý bao nhiêu lần, bằng chứng nào đang có, rule kết luận được gì và incident nào cần điều tra.

| Phạm vi thời gian | Kết quả mục tiêu | Giới hạn |
|---|---|---|
| Starter kit 5 ngày | Tài liệu nghiệp vụ/thiết kế, frontend React + TypeScript + Vite dùng mock data, roadmap Backend 24 tuần | Không có monitoring live, Backend/Kafka/PostgreSQL runtime |
| Giai đoạn Backend về sau | Demo order/loyalty, xử lý event, thu reports, đối chiếu evidence và cung cấp Monitor API | Chưa triển khai; thiết kế kỹ thuật và cách kiểm chứng sẽ được chốt riêng |
| Hiện tại | Repository có cấu trúc, placeholder và tài liệu phạm vi này | Chưa có frontend hoặc Backend chạy được |

Các mục dưới đây là yêu cầu thiết kế, không phải tuyên bố chức năng đã được hiện thực hoặc đo đạt.

## 3. Các khái niệm phải tách biệt

| Khái niệm | Ý nghĩa | Ví dụ |
|---|---|---|
| Monitored application | Ứng dụng là nguồn event/report được theo dõi | Loyalty application |
| Event | Một sự kiện logic có danh tính dùng để đối chiếu | OrderPaid của một đơn hàng |
| Processing attempt | Một lần consumer thử xử lý event | Lần đầu xử lý; lần thử lại sau crash |
| Business effect | Tác động nghiệp vụ thực tế | Một bút toán cộng điểm loyalty |
| Monitoring rule | Quy tắc kiểm tra dựa trên bằng chứng | Kiểm tra effect bị nhân đôi |
| Rule evaluation | Kết quả đánh giá rule dựa trên evidence tại thời điểm kiểm tra | PASS, VIOLATION hoặc UNKNOWN |
| Incident | Hồ sơ vấn đề cần điều tra, liên kết event/rule/evidence | Có chứng cứ cộng điểm trùng |

Hai attempts không mặc nhiên tương đương hai effects. Trạng thái quan sát event, trạng thái xử lý, kết quả evaluation và trạng thái incident là các miền riêng; không dùng một trạng thái chung thay cho tất cả.

## 4. Đầu vào, bằng chứng và đầu ra

### Đầu vào

| Nhóm dữ liệu | Nội dung cần có về mặt nghiệp vụ | Giới hạn tin cậy |
|---|---|---|
| Application context | Danh tính ứng dụng và môi trường | Cấu hình demo không phải kết nối production |
| Observed event | Danh tính event, loại event, thời điểm, liên hệ với đơn hàng | Thấy event không chứng minh nghiệp vụ hoàn tất |
| Processing report | Attempt, thời điểm bắt đầu/kết thúc, trạng thái hoặc lỗi do ứng dụng báo | Có thể thiếu, trễ hoặc thất lạc |
| Business evidence | Bằng chứng về tác động nghiệp vụ, nguồn và thời điểm kiểm tra | Chỉ đọc; thiếu hoặc không tin cậy thì không được kết luận chắc chắn |
| Rule configuration | Điều kiện kiểm tra và ngưỡng liên quan | Chưa chốt schema, API hoặc rule engine ở tài liệu này |

Ở starter kit, các đầu vào được mô phỏng bằng fixtures và mock adapter. Luồng nhận dữ liệu thật thuộc giai đoạn Backend về sau.

### Observed, reported và verified

- **Observed:** monitor có ghi nhận được thông tin về event.
- **Reported:** ứng dụng thông báo một attempt đã diễn ra và báo kết quả xử lý.
- **Verified:** evidence đủ tin cậy và phù hợp đã được đối chiếu cho điều kiện nghiệp vụ đang kiểm tra.

Verified luôn gắn với phạm vi điều kiện, nguồn và thời điểm bằng chứng; không có nghĩa toàn bộ hệ thống đã được chứng minh đúng. Không gán nhãn verified chỉ vì có report thành công.

### Đầu ra

- Overview tổng hợp event, kết quả xử lý, incident và phần chưa đủ bằng chứng.
- Event detail cho phép đọc metadata, timeline attempts, evaluations và evidence đã che thông tin nhạy cảm.
- Evaluation giải thích rule đã kiểm tra gì, kết quả là gì và evidence hỗ trợ hoặc còn thiếu.
- Incident liên kết vấn đề với event/evidence để developer điều tra và theo dõi trạng thái xử lý hồ sơ.

Đây là output mục tiêu; trong frontend starter chúng đều là dữ liệu giả lập có nhãn **Demo data**.

### Quy tắc kết luận

| Bằng chứng hiện có | Kết luận cho rule liên quan | Cách diễn giải |
|---|---|---|
| Đủ bằng chứng, điều kiện rule được thỏa mãn | PASS | Đúng trong phạm vi rule và thời điểm kiểm tra |
| Đủ bằng chứng cho thấy vi phạm | VIOLATION | Có căn cứ mở/liên kết incident để điều tra |
| Tổng bằng chứng sẵn có chưa đủ, quá trễ hoặc không đủ độ tin cậy để đánh giá rule | UNKNOWN / INSUFFICIENT_EVIDENCE | Nêu bằng chứng thiếu; chưa được suy ra FAILED hoặc VIOLATION |

Mất processing report không bắt buộc dẫn đến UNKNOWN. Nếu tồn tại evidence độc lập, đáng tin cậy, liên kết được với event và đủ để đánh giá một rule cụ thể, evaluation của rule đó vẫn có thể là PASS hoặc VIOLATION. Kết luận này không tự khôi phục timeline attempts bị thiếu hoặc chứng minh mọi bước xử lý đều thành công. UNKNOWN chỉ áp dụng khi tổng bằng chứng sẵn có chưa đủ cho rule đang xét.

Processing FAILED cần căn cứ cho lỗi xử lý; không suy ra FAILED chỉ vì monitor chưa nhận report. Event quá ngưỡng mà chưa có kết quả là timeout candidate để chú ý, chưa tự chứng minh nghiệp vụ sai. Không tự tạo incident lỗi nghiệp vụ chỉ từ việc thiếu tín hiệu; quy tắc escalation chi tiết sẽ được đặc tả ở giai đoạn phù hợp.

Chuyển incident sang RESOLVED là thay đổi trạng thái hồ sơ điều tra, không tự sửa dữ liệu nghiệp vụ hoặc xóa bằng chứng vi phạm trước đó.

## 5. Phạm vi bao gồm

| Thành phần | Phạm vi nghiệp vụ của starter kit |
|---|---|
| Applications | Xem các ứng dụng được theo dõi, tạo cấu hình ứng dụng mẫu bằng thao tác mock |
| Events và attempts | Tìm/lọc event, đọc metadata và timeline các lần xử lý |
| Rules và evaluations | Hiển thị các quy tắc TIMEOUT, DUPLICATE_BUSINESS_EFFECT, DATA_INVARIANT; bật/tắt mock và đọc kết quả dựa trên evidence |
| Incidents | Xem vấn đề, evidence, event liên quan và thao tác trạng thái OPEN → INVESTIGATING → RESOLVED trong mock |
| Overview | Tổng hợp nhất quán từ cùng dataset, phân biệt kết quả đã xác định với UNKNOWN |

UI mục tiêu gồm năm màn hình chính: Overview, Applications, Event Explorer, Monitoring Rules và Incidents; hai màn hình Event Detail, Incident Detail; cùng route 404. Yêu cầu trường và luồng thao tác chi tiết, use cases và toàn bộ kịch bản demo sẽ được đặc tả riêng sau tài liệu phạm vi.

## 6. Ngoài phạm vi

Trong starter kit 5 ngày không triển khai Spring Boot services chạy thật, PostgreSQL runtime, Kafka thật, consumer/background worker production, rule engine thật hoặc truy vấn evidence live. Hai Backend và infrastructure chỉ là placeholder tài liệu.

Các tính năng sau không thuộc phạm vi đã khóa: tự sửa dữ liệu production, production replay, hỗ trợ nhiều brokers, AI root-cause analysis, billing, xác thực multi-tenant phức tạp, BI nâng cao, cloud production deployment và benchmark không có phép đo thực tế.

Monitor không ghi vào database nghiệp vụ thông qua evidence adapter. Evidence cần được mask; không thu hoặc commit credentials production. Số lượng attempts không phải chỉ số số lần cộng điểm và Kafka lag không phải thước đo tính đúng đắn nghiệp vụ.

## 7. Luồng end-to-end dự kiến

Ứng dụng demo phát sinh một sự kiện OrderPaid sau khi đơn hàng được thanh toán.
Kafka chuyển event tới consumer và có thể giao lại khi consumer gặp sự cố.
Consumer xử lý event để tạo bút toán cộng điểm trong demo database; mục tiêu là các lần giao lại vẫn chỉ tạo một business effect.
Ứng dụng gửi processing reports để monitor ghi nhận từng attempt, nhưng report có thể trễ hoặc thất lạc.
Monitor kết hợp thông tin đã quan sát, reports và khi cần evidence adapter chỉ đọc để đánh giá rule; thiếu bằng chứng phải giữ UNKNOWN.
Developer xem Overview, mở Incident liên quan rồi Event Detail và Evidence để hiểu vấn đề; trong starter kit toàn bộ luồng này chỉ được mô phỏng bằng mock data.

### Ví dụ OrderPaid bị giao lại

**Đầu vào:** một OrderPaid có danh tính `order-paid-1001`, dự kiến cộng 100 điểm; consumer thử xử lý hai lần sau một sự cố.

**Xử lý mục tiêu:** hai attempts cùng liên kết về một event; cơ chế chống trùng của consumer thuộc giai đoạn Backend giữ tác động nghiệp vụ không bị lặp. Monitor không phải thành phần thực hiện chống trùng hay tự sửa ledger.

**Đầu ra khi có evidence đầy đủ:** tìm thấy đúng một bút toán +100 cho event, rule kiểm tra nhân đôi có kết quả PASS và không có duplicate incident. Hai attempts tự thân không phải vi phạm.

**Nếu report thất lạc:** thiếu report tự thân chưa chứng minh xử lý thành công hoặc thất bại. Nếu evidence độc lập, đáng tin cậy và đủ cho rule chống nhân đôi xác nhận đúng một bút toán +100 liên kết với event, rule đó có thể PASS dù report chưa được phục hồi; evidence đủ cho thấy nhiều effects thì rule có thể VIOLATION. Chỉ giữ UNKNOWN khi tổng bằng chứng chưa đủ để đánh giá rule. Cách chống trùng, transaction, constraint và nguồn evidence sẽ được thiết kế ở bước kiến trúc/data model; tài liệu này không tự quyết định thay.

## 8. Tiêu chí thành công và cách nghiệm thu

Các chỉ tiêu dưới đây là mục tiêu nghiệm thu, chưa phải số đo đã đạt.

| ID | Tiêu chí | Cách kiểm tra khi có sản phẩm phù hợp |
|---|---|---|
| SC-01 | Từ Overview → Incident Detail → Event Detail → Evidence trong tối đa 4 thao tác điều hướng | Bắt đầu tại Overview đã mở; đếm click/menu/tab, không tính cuộn hoặc đọc; nếu đi qua Incident list thì tính thêm một thao tác |
| SC-02 | Phân biệt một event, hai attempts và một effect | Đối chiếu timeline và evidence của ví dụ giao lại; không có duplicate incident khi chỉ có một effect |
| SC-03 | Thiếu report không bị đánh đồng với FAILED/VIOLATION | Thiếu report và không có evidence độc lập đủ dùng: UNKNOWN; có evidence độc lập đáng tin, đủ cho rule: PASS hoặc VIOLATION theo evidence; không suy diễn timeline attempts đã đầy đủ |
| SC-04 | Kết quả có thể truy nguyên tới evidence | Từ evaluation/incident tìm được event, evidence nguồn/thời điểm hoặc lời giải thích chưa đủ chứng cứ |
| SC-05 | Người xem hiểu rõ trạng thái mô phỏng | Các trang mock gắn Demo data; tài liệu không tuyên bố Backend/Kafka/monitoring thật đã chạy |
| SC-06 | Người học giải thích được ERM trong khoảng 2 phút | Tự trình bày problem, người dùng, input/output, event/attempt/effect và giới hạn; trả lời ví dụ giao lại và mất report |

Nghiệm thu tài liệu phạm vi: nội dung phải thống nhất với kế hoạch 5 ngày, tách mục tiêu và hiện trạng, nêu đủ in/out scope và không yêu cầu triển khai runtime trong starter kit. Nghiệm thu UI, rule engine hoặc hiệu năng chưa thể thực hiện chỉ bằng tài liệu này.

### Bản giới thiệu ngắn để tự luyện

ERM giúp backend developer điều tra event bất đồng bộ bằng cách nối thông tin event, các lần xử lý và bằng chứng nghiệp vụ. Ví dụ một OrderPaid có thể được giao hai lần nhưng nghiệp vụ vẫn chỉ được cộng điểm một lần. Tiến độ Kafka và report thành công chưa đủ chứng minh dữ liệu đúng. Monitor dự kiến đối chiếu evidence chỉ đọc để đánh giá rule; thiếu bằng chứng thì trả UNKNOWN. Developer đi từ Overview tới Incident, Event Detail và Evidence để hiểu vấn đề, còn cách khắc phục do con người quyết định. Starter kit hiện hướng tới frontend mock và tài liệu thiết kế; Backend, Kafka và giám sát thật được phát triển về sau.


## 9. Open Questions — cần giải quyết ở chặng 2A

| ID | Câu hỏi kiến trúc chưa chốt | Yêu cầu giải quyết tại 2A |
|---|---|---|
| OQ-01 | Monitor quan sát được event từ nguồn nào khi processing report thất lạc? | Xác định nguồn ghi nhận event, cách liên kết danh tính event với evidence và giới hạn quan sát khi mất report; không mặc định monitor đã biết event chỉ nhờ report bị mất |
| OQ-02 | Làm thế nào demo phát hiện duplicate business effect khi schema dự kiến có `loyalty_entries.event_id UNIQUE`? | Phân tích xung đột giữa hai effects cùng event và UNIQUE trong cùng bảng/cấu hình; đề xuất các phương án sandbox/evidence an toàn để người dùng chốt, bảo toàn invariant mặc định |

Cả hai câu hỏi là đầu vào bắt buộc của chặng 2A (Architecture và Data Model), chưa phải quyết định kiến trúc ở 1A. Không tự chọn nguồn quan sát event, thiết kế schema, tách sandbox hoặc bỏ ràng buộc UNIQUE trong tài liệu phạm vi này.
