# SaaS 3 — bảo mật tài khoản

Project: `7484965213377838536`; design system: `assets/23ff43d04b194e6c8c13fab28e1e0fc8` (Artisanal Operations).

Screen: `38329f8018444840a196f482daa86948`, desktop responsive. HTML gốc: [security.reference.html](security.reference.html). Screenshot và kết quả MCP được giữ trong `.stitch/designs/` local.

## Nội dung prompt

Thiết kế trang Bảo mật tài khoản bằng tiếng Việt cho DineFlow. Dùng lại workspace sidebar và Artisanal Operations: pine `#173e32`, ivory `#faf9f5`, Newsreader cho tiêu đề và Be Vietnam Pro cho nội dung.

Tiêu đề editorial “An tâm trong mỗi phiên làm việc.” Giải thích email/mật khẩu thuộc một tài khoản dùng chung ở mọi nhà hàng. Thẻ email có địa chỉ, trạng thái xác minh thật và nút gửi email xác minh. Form đổi mật khẩu gồm mật khẩu hiện tại, mật khẩu mới tối thiểu 12 ký tự, nhập lại và thông báo mọi phiên sẽ bị thu hồi. Có liên kết quên mật khẩu và các trạng thái validation, pending, success/error.

Thiết kế riêng bước MFA admin nền tảng: QR Authenticator, khóa thiết lập và mã sáu chữ số; chỉ hiển thị credential do API trả về trong bước thiết lập. Không bịa IP/thiết bị, điểm bảo mật, dữ liệu doanh thu, pricing/subscription hoặc cấu hình ngân hàng. Responsive desktop/mobile, nhãn input rõ ràng, thao tác đủ lớn.

## Ánh xạ vào ứng dụng

- `/staff/security`: trạng thái email và đổi mật khẩu; quyền của tài khoản hiện tại.
- `/platform/security`: đổi mật khẩu admin; truy cập bằng platform session đã qua MFA.
- `/verify-email`: link trong email, xác nhận bằng thao tác rõ ràng hoặc yêu cầu gửi lại.
- `/forgot-password`, `/reset-password`: yêu cầu generic và tiêu thụ link dùng một lần.
- `/platform/login`: mật khẩu → challenge giới hạn → thiết lập/nhập TOTP → console.

Reference tự thêm hotline, ca trực, thông báo POS, tiêu chí mật khẩu chữ hoa/ký tự đặc biệt và quyền MFA cho hoàn tiền. Những chi tiết đó không được đưa vào sản phẩm. MVP kiểm tra độ dài mật khẩu, dùng link email thay email OTP; MFA bắt buộc cho admin nền tảng, không áp dụng tự động cho Owner. HTML tham chiếu không được chạy trong web.
