# Phase 4 — Staff & Kitchen

Kiểm chứng local ngày **2026-10-09**: Windows, Node 22, pnpm 9, PostgreSQL/Redis/MinIO Compose, Chromium và Next production build. Phase này hoàn thành nhận đơn → bếp → phục vụ; thanh toán và realtime thuộc các phase sau.

## Chức năng chạy được

- Dashboard có số đơn chờ xác nhận/đang chế biến/sẵn sàng và bàn đang phục vụ từ database, scope nhà hàng và phiên hiện tại.
- `/staff/orders`: lọc trạng thái/bàn, 12 đơn/trang, cập nhật REST, chi tiết món/tùy chọn/ghi chú và nguồn QR hoặc nhân viên. OWNER/MANAGER/WAITER xác nhận PENDING_CONFIRMATION → ACCEPTED, từ chối với lý do và ghi nhận READY → SERVED. CASHIER chỉ đọc.
- `/staff/kitchen`: OWNER/MANAGER/KITCHEN xem ba hàng đợi ACCEPTED/PREPARING/READY, phân trang từng cột, ưu tiên thời điểm vào bước cũ nhất. Nút Bắt đầu chế biến và Món đã sẵn sàng; READY chờ nhân viên phục vụ. KITCHEN không xác nhận, hủy hay phục vụ.
- Ticket hiển thị tên bàn, số đơn, quantity, snapshot món/modifiers và ghi chú. Nhãn Chờ lâu từ 15 phút theo bước hiện tại, đồng hồ cập nhật mỗi 30 giây; nút Cập nhật lấy lại dữ liệu REST. Không gọi đây là realtime.
- Ghi đơn từ `/staff/tables/{sessionId}/order`, giỏ tại `/cart`; chỉ OWNER/MANAGER/WAITER và phiên OPEN. Dùng chung thực đơn, modifiers, server pricing và snapshots với đơn QR. Giỏ/note giữ qua reload, payload retry bất biến theo staff user/session.
- Đơn thủ công source STAFF, guestSessionId null, PENDING_CONFIRMATION; sau ghi nhận nhân viên xác nhận để chuyển bếp. Hash gắn userId nhân viên; cùng key/payload trả đơn cũ, khác người/nội dung/source trả 409. Guest history không lộ đơn STAFF.
- Hủy bắt buộc lý do 3–500 ký tự. OWNER/MANAGER được hủy ACCEPTED; WAITER chỉ từ chối PENDING_CONFIRMATION. Không hủy từ PREPARING, không bỏ bước/chuyển ngược/mở lại đơn terminal. Lý do hiển thị trong ticket và lịch sử khách của chính đơn đó.
- Mỗi bước lưu acceptedAt/preparingAt/readyAt/servedAt/cancelledAt và ActivityLog cùng transaction; kiểm tra session/table scope, active session và RBAC backend. PAYMENT_REQUESTED vẫn cho hoàn tất đơn đã có, chặn đơn mới; CLOSED không cho thay đổi.

## API và transaction

| Endpoint `/api/v1` | Quyền |
|---|---|
| `GET /orders/overview` | Tất cả 5 staff roles, dữ liệu nhà hàng hiện tại |
| `GET /orders?status=&tableId=&page=&pageSize=` | OWNER/MANAGER/WAITER/CASHIER |
| `GET /kitchen/orders?status=&page=&pageSize=` | OWNER/MANAGER/KITCHEN; chỉ ACCEPTED/PREPARING/READY |
| `PATCH /orders/:id/status` | OWNER/MANAGER/WAITER/KITCHEN + policy từng cạnh |
| `GET /dining-sessions/:id/menu` | OWNER/MANAGER/WAITER, session thuộc nhà hàng và OPEN |
| `POST /dining-sessions/:id/orders` | OWNER/MANAGER/WAITER, pricing/idempotency/session validation |

PATCH body strict `{from, to, reason}`; non-cancellation dùng reason null. Không nhận role/restaurant scope từ client. Query page 1–10000, pageSize 1–50; UI dùng 12. Counts/list cùng snapshot RepeatableRead.

Thứ tự khóa **Restaurant → DiningTable → DiningSession → Order** cho transition, thống nhất với setup/order/session mutations. Đối chiếu trạng thái thực tế với `from` sau lock, stale request trả 409. Xác nhận và từ chối đồng thời, hoặc chế biến và quản lý hủy đồng thời, chỉ một request ghi được trạng thái/audit. Không tự retry mutation; UI invalidate/refetch sau thành công hoặc xung đột. Restaurant lock phù hợp MVP, chưa benchmark tải cao. Không cần migration Phase 4 vì schema timestamps/source đã có.

## Kiểm tra đã chạy

| Lệnh | Kết quả |
|---|---|
| `pnpm lint` | Pass shared/API/web; web lint lại sau hoàn thiện E2E |
| `pnpm typecheck` | Pass strict TypeScript, Prisma generation, Next routes; web kiểm tra lại sau E2E |
| `pnpm test` | 9/9 unit tests |
| `pnpm test:integration` | 40/40 với PostgreSQL thật, MinIO và QR decoding |
| `pnpm build` | Pass shared/API và Next production |
| `CI=1 pnpm test:browser` | 8/8 Chromium flows, API local và Next production |

Phase 4 thêm 9 integration scenarios + parent: scopes/RBAC/pagination; invalid transitions/body; confirm → prepare → ready → serve, timestamps/audit/history; manual pricing/snapshots/idempotency ownership; rejection/manager cancellation; confirm/reject race; prepare/cancel race; counters/pagination; PAYMENT_REQUESTED/CLOSED. Các tests Phase 1–3 vẫn pass.

Hai browser flows mới dùng tenant riêng, users cho 5 roles, orders tạo qua API/UI thật và cleanup đúng fixture IDs. Flow chính kiểm tra QR → waiter confirm → kitchen prepare/ready → waiter serve → guest refresh, ghi đơn thủ công/modifiers/note/reload, reject reason validation và guest history không chứa STAFF orders. Flow thứ hai kiểm tra stale confirmation 409/refetch/audit chỉ một lần, WAITER không hủy ACCEPTED, CASHIER chỉ đọc và KITCHEN bị chặn staff orders. Test QR quản trị không giả định bàn demo chưa mở; đọc menu vẫn yêu cầu admission để gọi món/đọc lịch sử.

Đã xem `.local/qa/kitchen-desktop.png`, `kitchen-mobile.png`, `staff-orders-mobile.png`, `manual-cart-desktop.png`; browser cũng chụp `staff-orders-desktop.png`. Staff orders được kiểm tra không tràn ngang ở 390px và 320px, kitchen ở 390px. Chưa kiểm tra Safari/Firefox, thiết bị bếp thật, load test hay deployment/HTTPS.

## Dùng thử

1. Đăng nhập waiter/owner/manager tại `/staff/login`, mở bàn trong **Phiên bàn**. Khách đặt qua QR hoặc nhân viên nhấn **Ghi đơn cho khách**.
2. Vào **Đơn gọi món**, chọn **Chờ xác nhận**. Kiểm tra món/tùy chọn/ghi chú rồi **Xác nhận đơn**, hoặc **Từ chối đơn** và nhập lý do.
3. Đăng nhập kitchen/owner/manager, vào **Màn hình bếp**, nhấn **Cập nhật bếp** để lấy đơn. Chọn **Bắt đầu chế biến**, sau đó **Món đã sẵn sàng**.
4. Waiter cập nhật danh sách, chọn **Sẵn sàng** và nhấn **Đã phục vụ** sau khi mang món đến bàn. Khách nhấn **Cập nhật** trong **Đơn đã đặt** để thấy tiến độ.
5. Đơn thủ công sau ghi nhận vẫn cần bước xác nhận; guest chỉ thấy các đơn tự đặt bằng token hiện tại. Tài khoản demo dùng password trong `.env` local theo README.

## Giai đoạn kế tiếp

Phase 5 thêm Socket authentication/rooms, tracking, service requests, reconnect và REST refetch. Hiện không có notification bell, station split, WebSocket hay auto-polling. Phase 6 mới có bill/payment/đóng phiên có đơn; không đóng hoặc reset bàn để bỏ lịch sử đã phát sinh.
