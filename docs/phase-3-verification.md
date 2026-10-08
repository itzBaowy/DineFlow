# Phase 3 — Customer Ordering

Kiểm chứng local ngày **2026-10-09**: Windows, Node 22, pnpm 9, PostgreSQL/Redis/MinIO Compose và Chromium. Phase này hoàn thành luồng nhận đơn; chưa phải E2E toàn bộ MVP đến thanh toán.

## Chức năng chạy được

- Nhân viên OWNER/MANAGER/WAITER mở bàn AVAILABLE → OCCUPIED và tạo phiên OPEN. Cùng bàn chỉ có một phiên active, kể cả hai request đồng thời.
- `/staff/tables` hiển thị trạng thái/sức chứa, thời điểm mở, số đơn và tổng tiền món; đọc các đơn trong phiên hiện tại theo scope nhà hàng. CASHIER được đọc nhưng không mở/dọn bàn; KITCHEN bị từ chối API.
- OWNER/MANAGER/CASHIER đóng phiên OPEN chưa có bất kỳ đơn nào, bắt buộc lý do. Lưu CLOSED, thu hồi guest tokens, chuyển bàn sang NEEDS_CLEANING. OWNER/MANAGER/WAITER xác nhận đã dọn → AVAILABLE.
- Menu QR công khai chỉ hiện danh mục đang bán và món chưa archive; món/tùy chọn hết được đánh dấu. Tìm kiếm, lọc danh mục, bảng size/topping, số lượng và ghi chú có validation.
- Khách nhấn “Bắt đầu gọi món” để được admission vào đúng phiên đã thấy. Không cần tài khoản. Token random 32 bytes ở HttpOnly cookie; DB chỉ giữ SHA-256. Cookie path theo public table code, TTL mặc định 4 giờ (`GUEST_TOKEN_TTL_SECONDS`, 300–86400 giây).
- Giỏ/cart note và payload retry lưu trong sessionStorage theo table/session/guest; không lưu guest token trong JavaScript. Giỏ giữ qua điều hướng và reload. Chỉ nhận tối đa 20 dòng, 20 phần/dòng, 100 option IDs/dòng và ghi chú 500 ký tự.
- Server xác minh món/category/modifier còn bán, option thuộc nhóm của món, min/max, quantity và scope. Không nhận giá/snapshot do client tự đặt. Tổng tiền tính bằng số nguyên VND, giới hạn 2.147.483.647đ. `expectedTotal` đối chiếu số tiền khách đã xem; giá đổi trả 409 để xem lại.
- Tạo Order PENDING_CONFIRMATION, OrderItems và modifier snapshots với audit trong một transaction. Gọi thêm tạo đơn khác cùng DiningSession. Sửa giá/tên menu không thay đổi đơn cũ.
- UUID idempotency key + request hash + guest ownership: cùng key/payload trả đơn đã lưu, không tạo bản sao; key khác nội dung hoặc dùng bởi guest khác trả 409. Replay được lookup trước validation menu.
- Lịch sử khách chỉ có đơn do guest token hiện tại gửi trong phiên hiện hành. Guest khác ở cùng bàn không đọc đơn của người trước. Phiên CLOSED, token hết hạn/revoked hoặc QR đã đổi không có quyền vào lịch sử cũ; PAYMENT_REQUESTED không nhận thêm đơn.

## Transaction và xử lý mất kết nối

Setup, admission và tạo đơn dùng thứ tự khóa **Restaurant → DiningTable → DiningSession**. Snapshot không bị xen giữa bởi sửa giá/archive; tạo đơn đồng thời với đóng phiên rỗng chỉ có một kết quả hợp lệ. Restaurant lock đơn giản cho MVP một nhà hàng; chưa benchmark tải cao.

Trước khi gửi, client lưu payload/key bất biến. Network/5xx/response schema errors giữ giỏ khóa chỉnh sửa; thử lại hoặc reload vẫn dùng cùng key. Rejection 4xx của lần gửi đầu cho phép cập nhật giỏ. Rejection của lần retry, kể cả 429, giữ key vì đơn đầu có thể đã commit. Nếu phiên/token hết hạn trong lúc chưa xác định kết quả, cần nhờ nhân viên kiểm tra đơn của phiên; không tự tạo credential mới để khôi phục lịch sử cũ.

API giới hạn JSON 128 KB; malformed JSON trả 400, quá cỡ trả 413. Guest admission 20 request/phút/IP, create order 30 request/phút/IP/handler; các GET dùng throttle mặc định. Mutation yêu cầu JSON/custom header và Origin hợp lệ. Đây là throttler in-memory cho một instance, chưa phải shared rate limiter.

## Kiểm tra đã chạy

| Lệnh | Kết quả |
|---|---|
| `pnpm lint` | Pass cả shared/API/web |
| `pnpm typecheck` | Pass strict TypeScript, Prisma generation và Next route types |
| `pnpm test` | 9/9 unit tests |
| `pnpm test:integration` | 30/30 với PostgreSQL thật, MinIO và QR decoding |
| `pnpm build` | Pass API/shared và Next production; web rebuild sau sửa retry |
| `CI=1 pnpm test:browser` | 6/6 Chromium flows, API local + Next production ổn định |

Integration Phase 3 có 9 scenarios + parent: public/RBAC/concurrent open; admission/cookie scope; invalid pricing/quantity/options; concurrent retries/snapshots; multiple orders/private history/changed price; revoked/expired/closed/payment-requested sessions; empty close/clean/new session; close/order race; CSRF, malformed/oversized JSON và rate limiting. Foundation/setup tests vẫn pass.

Hai browser flows Phase 3 dùng restaurant/users ngẫu nhiên riêng. Flow chính: QR bàn chưa mở → waiter mở → admission → search/size/topping/note → giỏ/reload → gửi đơn thật rồi cố tình mất phản hồi → reload → retry 429 → retry cùng key chỉ một đơn → guest khác không thấy đơn → giá đổi → gửi đơn thứ hai → staff đọc cả hai. Flow còn lại: owner mở → guest admission → đóng rỗng có lý do → revoke → dọn → mở phiên mới không lộ lịch sử. Fixtures chỉ cleanup đúng tenant được tạo; không truncate/reset dữ liệu nhà hàng demo.

Đã xem screenshots `.local/qa/customer-menu-mobile.png`, `customer-modifiers-mobile.png`, `customer-cart-mobile.png`, `customer-orders-mobile.png`, `customer-menu-desktop.png`, `staff-sessions-desktop.png`, `staff-sessions-mobile.png`. Mobile 390px không tràn ngang; Dialog/nút giỏ có safe-area, font và màu theo Stitch. Artwork món do Stitch sinh chỉ giữ làm tham chiếu; web hiện ảnh nhà hàng upload hoặc placeholder.

## Dùng thử

1. Chạy local theo README, đăng nhập owner/manager/waiter bằng demo password trong `.env`.
2. Mở **Phiên bàn** (`/staff/tables`), nhấn **Mở bàn** cho bàn sẵn sàng.
3. Từ QR quản trị hoặc “Xem thực đơn QR”, mở URL `/t/{tableCode}` trong browser/điện thoại. Nhấn **Bắt đầu gọi món**.
4. Chọn món, size/topping, số lượng và ghi chú; mở giỏ rồi **Xác nhận đặt món**.
5. Xem **Đơn đã đặt**, gọi thêm món; staff nhấn **Cập nhật bàn** / **Xem đơn của phiên** để đọc đơn.

## Phần kế tiếp và giới hạn

Phase 4 sẽ xác nhận/từ chối, kitchen board, timestamps/transitions và tạo đơn thủ công. Phase 5 mới có Socket.IO/service requests; hiện cập nhật bằng REST/manual refresh, không quảng bá realtime. Phase 6 mới có bill/payment/close cho phiên có đơn; Phase 3 không thể đóng/reset một bàn đã nhận đơn để bỏ lịch sử.

QR cố định không chứng minh khách có mặt; phải xác nhận đơn trước khi chế biến. Chưa có PIN/QR động, payment hay deployment/HTTPS thực tế. Mất guest cookie/hết TTL không khôi phục lịch sử khách; nhân viên vẫn đọc đơn của phiên. Chưa kiểm tra Safari/Firefox, thiết bị/máy in thật, load test hay E2E đến thanh toán. Redis hiện chạy nhưng chưa dùng vào luồng đặt món.
