# E-Audit — local reconstruction

React, Tailwind, Monaco 0.55.1 và Express mock API. Giữ giao diện login/confirm, 10 câu hỏi, ảnh/ASCII, editor tối, điều hướng từ bản ghi trước; watermark đã được bỏ theo yêu cầu; bổ sung cơ chế giám sát theo tài liệu phân tích người dùng cung cấp.

## Chạy

```sh
npm install
npm run dev
```

Mở http://localhost:5173, nhập mã 6 hoặc 8 ký tự (ví dụ `ABC123`), bắt đầu bài thi và cho phép fullscreen. Nếu server cũ đang chạy, dừng và chạy lại để nạp mock backend mới.

## Deploy

Ứng dụng cần chạy Node/Express để xử lý các request `/api/*`; deploy riêng thư mục `dist` lên static hosting sẽ không có backend và có thể trả body rỗng/HTML thay cho JSON. Trên dịch vụ Node, dùng build command `npm run build`, start command `npm start`, đặt `NODE_ENV=production`; dịch vụ phải chuyển tiếp request đến cổng `PORT` được cấp.

## Quyết định vi phạm

Mock backend giữ trạng thái trong RAM theo `session_id`, không có database. **Mọi loại vi phạm chính thức trong 15 loại đều có trọng số 1; vi phạm thứ hai khóa và tự submit**. Đây là chính sách mock theo yêu cầu, vì tài liệu không có implementation server gốc.

- Client gửi UUID `eventId`; tối đa 5 retry sau 1, 2, 4, 8, 16 giây với cùng ID. Backend deduplicate ID, không tăng số lần khi retry.
- Client dùng `violation_count` và `locked` từ server; hỗ trợ phản hồi `ignored`, `forensic_only`. Mẫu backend hiện tính cả 15 loại, không phân loại forensic-only.
- Cooldown 3 giây riêng từng loại; DevTools 10 giây. `recording_stopped`, `extension_panel`, `suspicious_paste` không có cooldown chung. Nhấn giữ một phím không tăng nhiều lần. Hai lần cùng loại trong cooldown không phải hai báo cáo được chấp nhận.
- Khóa editor/điều hướng trước khi submit; gửi toàn bộ đáp án mới nhất đúng một lần. Retry submit không thay payload server đã lưu. Forced-submit thất bại giữ khóa và nút Retry; không cho quay lại làm bài.
- API heartbeat đồng bộ thời gian. Mock backend trả HTTP 410 cho `timeout`, `absent_too_long` (120 giây không có heartbeat present), `submitted`, `concurrent_session`. Phiên mới cùng student thay thế phiên trước. Trạng thái server mất khi restart; đăng nhập lại để mở demo mới.

## Detector

| Event | Cơ chế |
|---|---|
| `fullscreen_exit` | Grace 5 giây, báo lần hai khi liên tục rời fullscreen 10 giây; reset khi quay lại |
| `tab_switch` | Trang hidden qua visibilitychange |
| `focus_lost` | Blur và sau 3 giây vẫn không focus |
| `devtools_open` | F12, Ctrl+Shift+I/J/C/K, Cmd+Option+I/J/C |
| `view_source` | Ctrl+U, Cmd+Option+U |
| `screenshot_attempt` | PrintScreen/Snapshot, Cmd+Shift+3/4/5 |
| `print_attempt` | Ctrl/Cmd+P, beforeprint |
| `copy_attempt`, `cut_attempt`, `paste_attempt` | Monaco clipboard shortcuts/menu, Insert/Delete variants và drag/drop |
| `suspicious_paste` | Một model change chèn ≥300 ký tự: undo, preview tối đa 500 ký tự, ngoại lệ snippet đã biết |
| `rapid_text_insertion` | Tổng ≥300 ký tự/2.5 giây, mỗi change <300, khoảng cách báo 10 giây; giữ nội dung |
| `extension_panel` | Fullscreen viewport thu hẹp ≥80px, polling 1.5 giây, 2 lượt liên tiếp, tối đa 2 báo cáo |
| `multiple_display_detected` | screen.isExtended mỗi 3 giây, một báo cáo mỗi chuyển sang true |
| `recording_stopped` | Dừng chia sẻ mô phỏng hoặc video track thật ended; overlay yêu cầu chia sẻ lại |

Phím F11 thử chuyển fullscreen; context menu bị chặn khi ở trang thi. Tên `devtools_open` ghi nhận shortcut, không chứng minh DevTools thực sự đang mở. Side panel là heuristic, không đọc danh sách extension. `screen.isExtended` không hỗ trợ thì không kết luận nhiều màn hình. Website không giám sát tiến trình AI ở OS và không bảo đảm chặn shortcut hệ điều hành.

## Recording

Mặc định **simulated**, không capture màn hình. Trang xác nhận chọn mode `none`, `live`, `local`, `s3`. API recording, upload và live đều chạy local mock.

Bật **Capture real Entire Screen** để kiểm tra capture thật; browser luôn yêu cầu người dùng chọn màn hình. Stream chọn tab/window bị từ chối. Capture yêu cầu 5 FPS, không audio; MediaRecorder ưu tiên VP9 rồi VP8/WebM, 600 kbps, timeslice 1 giây, gom part mỗi 5 phút.

- `s3`: PUT WebM vào `/api/mock-recording/:session/:part` ở Express local. Đây là upload sink giả, không phải S3 thật, không lưu video trên server.
- `local`: với capture thật, chọn thư mục và password trước khi bắt đầu. Mỗi part là ZIP AES-256 bằng zip.js, tên `exam_YYYYMMDD-HHMMSS_part000.zip`. Theo tài liệu, password được lưu bằng khóa localStorage `recordingPassword`.
- `none` / `live`: không tạo recording blob; screen track có thể chạy để kiểm tra interruption. Live API mặc định tắt viewer, không có admin stream/WebRTC signaling server thật trong bản mock.
- Upload/ack/seal/finalize retry tối đa 5 lần, backoff bắt đầu 3 giây; API timeout 25 giây và PUT 120 giây. Pending ack lưu sessionStorage và replay khi start capture. Finalization dừng recorder, xử lý part cuối và seal/finalize qua API giả.
- Khi capture ended, báo `recording_stopped` và khóa thao tác tạm thời cho tới Share Entire Screen Again. Lần dừng thứ hai sẽ tự submit theo cùng chính sách 2 vi phạm.

Bản dựng bám các hành vi và ngưỡng được mô tả; không thể chứng nhận byte-for-byte giống hệ thống gốc chỉ từ tài liệu phân tích. Không có S3/admin/signaling hay authentication backend thật.

## API và kiểm thử

Các endpoint gốc ở `mock-api.mjs`; thêm `POST /api/student/exam/heartbeat` và local PUT upload sink. API log timestamp, path và payload trong terminal, không gọi website gốc. Mã chính: `src/anti-cheat.js`, `src/CodeEditor.jsx`, `src/Exam.jsx`, `src/exam-recorder.js`.

```sh
npm test
npm run build
npm run test:browser
```

Playwright tự chạy server riêng tại port 5193, dùng Chrome cài sẵn. Kiểm thử bao gồm giữ đáp án khi submit, retry, cooldown, dedupe server, mixed violations, fullscreen grace, recording interruption, một lần chèn lớn và chèn nhanh nhỏ. Capture tests dùng canvas MediaStream giả để xác minh lifecycle; chọn Entire Screen thật vẫn cần nghiệm thu thủ công. Unit test ZIP xác minh archive mã hóa, sai password không đọc được và đúng password trả lại nội dung.

Extension/native tool trong `extendsion/` vẫn giữ adapter chỉ đọc để kiểm thử có cấp phép. Bộ detector mới sẽ đánh giá editor changes như các thao tác khác; không có ngoại lệ riêng cho tool tự động.
