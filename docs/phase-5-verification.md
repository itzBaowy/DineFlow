# Phase 5 — Realtime

Kiểm chứng local ngày **2026-10-09**: Windows, Node 22, pnpm 9, PostgreSQL/Redis/MinIO Compose, Chromium desktop/mobile và Next production build. Hoàn thành Socket.IO, đồng bộ đơn/bàn, theo dõi đơn khách, service requests và reconnect/refetch. Ghi nhận tiền, bill, receipt và đóng phiên có đơn thuộc Phase 6.

## Chức năng chạy được

- Đơn QR/thủ công mới tự xuất hiện ở staff queue, có thông báo đơn mới. Chỉ sau xác nhận bếp mới nhận đơn. Confirm → prepare → ready → served tự cập nhật staff/kitchen và lịch sử của khách tạo đơn.
- Mở/đóng phiên rỗng, dọn bàn và thay đổi cấu hình bàn phát hint sau commit. Dashboard/phiên bàn refetch dữ liệu REST; khách nhận closing hint rồi mất quyền truy cập phiên cũ.
- Guest history giữ scope token hiện tại, không lộ đơn của người khác cùng bàn hay đơn STAFF. Cards tiến độ có mốc đã commit, future steps chưa có giờ; cancelled giữ mốc đã xảy ra, thời gian/lý do hủy.
- Badge Đang đồng bộ chỉ xuất hiện sau `realtime.ready`. Mất mạng/disconnect hiển thị fallback; khi online lại client lấy vé mới, refetch và thấy bước đơn đã bỏ lỡ. Tab visible cũng refetch; có nút cập nhật REST.
- Khách **Gọi nhân viên** hoặc xác nhận dialog **Yêu cầu thanh toán**. Các khách cùng phiên thấy trạng thái yêu cầu chung, không thấy danh tính người gửi. Nút cùng loại bị khóa khi request còn active.
- `/staff/requests`: OWNER/MANAGER/WAITER đọc/tiếp nhận/hoàn tất cả hai loại; CASHIER chỉ xử lý REQUEST_PAYMENT; KITCHEN không đọc/xử lý service requests. Lọc trạng thái, FIFO, phân trang 12, loading/error/retry và stale conflict refetch.
- REQUEST_PAYMENT chuyển OPEN → PAYMENT_REQUESTED, có timestamp và audit trong cùng transaction. Ngừng đơn mới nhưng cho hoàn thành đơn cũ. Hoàn tất service request **không** tạo Payment, ghi nhận tiền, đóng bàn hoặc mở lại OPEN.

## API / Socket

| Endpoint `/api/v1` | Scope / quyền |
|---|---|
| `POST /realtime/ticket` | Staff principal/cookie đã kiểm chứng, body strict `{}` |
| `POST /public/tables/:code/realtime-ticket` | Guest token đúng code/active session, body strict `{}` |
| `GET /public/tables/:code/service-requests` | Guest cùng phiên; 2 requests active được ưu tiên, tối đa 18 resolved gần đây |
| `POST /public/tables/:code/service-requests` | Strict `{diningSessionId,type}`; token/current session/CSRF/rate limit |
| `GET /service-requests?status=&page=&pageSize=` | OWNER/MANAGER/WAITER/CASHIER, nhà hàng hiện tại, active session |
| `PATCH /service-requests/:id/status` | Strict `{from,to}`, role/type policy, tenant scope và current state |
| Socket.IO `/realtime/socket.io` | Single-use ticket trong handshake auth; không có mutation qua socket |

Vé opaque 32 bytes, SHA-256 key trong memory, hạn 60 giây, chỉ dùng một lần kể cả handshake thất bại. REST cấp vé yêu cầu auth và mutation CSRF guard; guest cấp vé giới hạn 30/phút/IP, gửi request 10/phút/IP và cooldown cùng type 30 giây. Staff áp dụng throttler chung. Không trả access JWT/guest cookie cho JavaScript; vé chỉ giữ tạm trong memory, không lưu storage hay URL.

Server chọn rooms `staff:{restaurantId}:{role}`, `guest:{guestId}`, `session:{diningSessionId}`. Client không chọn tenant/role/room, `join`/`subscribe` bị từ chối. Trước từng delivery và mỗi 15 giây server kiểm tra lại user/membership/AuthSession/token hoặc guest expiry/revocation/table/session. Logout, đổi role, hết hạn và đóng phiên disconnect. Closing hint chỉ chứa scope đã biết, gửi trước disconnect guest revoked.

Events `order.created`, `order.accepted`, `order.status_changed`, `table.status_changed`, `service_request.created`, `service_request.updated`, `dining_session.closed` chỉ chứa IDs/kind/time. Guest order events chỉ tới guest tạo đơn; service/table/session events tới guests cùng phiên. Kitchen không nhận đơn chưa xác nhận hay service requests. Khác nhà hàng không nhận events. Client validate/deduplicate hints rồi invalidate queries; dữ liệu hiển thị luôn đọc lại qua REST.

Origin sai hoặc Sec-Fetch-Site cross-site bị chặn. Same-origin polling GET có thể không gửi Origin, nhưng vẫn bắt buộc vé hợp lệ. Path không có trailing slash (`addTrailingSlash: false` cả server/client) tránh Next 308 redirect handshake; dùng cùng Next rewrite cho WebSocket upgrade và polling. Reconnect lấy vé mới, backoff 1–30 giây, không tự replay mutation.

## Transaction / database

Khóa Restaurant → DiningTable → DiningSession → ServiceRequest, thống nhất với setup/order writers. Guest tạo request dưới session lock; request cũ cùng loại PENDING/ACKNOWLEDGED được trả lại, không tạo audit/event trùng. Migration `202610090004_service_request_integrity` thêm partial unique index live type/session và constraint `resolvedAt` chỉ có ở RESOLVED.

Staff chuyển PENDING → ACKNOWLEDGED → RESOLVED, không bỏ bước/mở lại; đối chiếu `from` sau lock. Hai nhân viên tiếp nhận đồng thời chỉ một thành công, một 409 và một audit. Thu ngân không xử lý CALL_STAFF. Đóng phiên OPEN chưa có bất kỳ đơn nào resolve requests còn active, revoke guests và chuyển NEEDS_CLEANING trong transaction đóng. PAYMENT_REQUESTED chưa thể đóng bằng close-empty hoặc mở lại trong phase này.

Publication nằm sau commit, idempotent order replay không phát event mới. Lỗi delivery không đảo ngược transaction. Không có durable outbox/replay: sự kiện best-effort, reconnect/tab visible/manual refresh lấy lại dữ liệu REST bị lỡ.

## Kiểm tra đã chạy

| Lệnh | Kết quả |
|---|---|
| `pnpm lint` | Pass shared/API/web; API và web lint lại sau hoàn thiện |
| `pnpm typecheck` | Pass strict TypeScript, Prisma generation và Next routes |
| `pnpm test` | 9/9 unit tests |
| `pnpm test:integration` | 50/50 PostgreSQL thật, MinIO/QR và Socket.IO thật |
| `pnpm build` | Pass shared/API và Next production; web build lại sau hoàn thiện |
| `CI=1 pnpm test:browser` | 10/10 Chromium flows, API local và Next production |

Phase 5 thêm 9 integration scenarios + parent: ticket auth/CSRF/strict scope; origin/expiry/replay; server-only room và tenant/guest/kitchen isolation; post-commit creation/transition; request concurrency/deduplication/safe DTO; role/stages/race/cooldown; payment request chặn món nhưng không tạo tiền/đóng; logout/role change/guest expiry; empty close/cleanup/table hint. Observer của publisher đọc Order/ActivityLog qua connection DB riêng **trước khi gọi publisher thật**, kiểm chứng commit đã nhìn thấy được; vẫn dùng socket thật cho delivery. Test trực tiếp unique/check constraints, mutation foreign tenant 404, invalid create không phát events và idempotent replay không phát trùng.

Hai browser flows mới dùng tenant/users/guests riêng và cleanup đúng IDs. Flow chính không nhấn refresh cho QR → staff → kitchen → guest; kiểm tra own-guest history, chặn optional WebSocket upgrade của một guest để chạy polling thật, offline → kitchen update → online/vé mới/REST reconcile, served, CALL_STAFF ack/resolve, dialog payment request chưa commit trước confirm, PAYMENT_REQUESTED và Payment count 0. Staff kiểm chứng WebSocket frames qua Next rewrite. Flow còn lại kiểm tra closing hint, guest tự trở về trạng thái bàn chưa mở và request không còn pending. Stale-request test Phase 4 trì hoãn request HTTP thật để tái hiện 409 dù realtime có thể cập nhật UI trước thao tác.

Đã xem `.local/qa/guest-tracking-mobile.png`, `guest-disconnected-mobile.png`, `service-requests-desktop.png`, `service-requests-mobile.png`. Browser kiểm tra không tràn ngang requests ở 390px và 320px, guest tracking ở 390px. Không có page errors trong luồng realtime chính. Artifacts/logs/traces QA được gitignore.

## Dùng thử

1. Waiter/owner/manager mở bàn trong **Phiên bàn**; khách vào QR rồi **Bắt đầu gọi món**. Kiểm tra badge **Đang đồng bộ**.
2. Khách gửi đơn; staff thấy đơn/thông báo mới trong **Đơn gọi món**, xác nhận. Bếp chuyển chế biến/sẵn sàng; waiter ghi nhận phục vụ. Khách mở **Đơn đã đặt** để theo dõi tự động.
3. Khách **Gọi nhân viên**; staff vào **Yêu cầu phục vụ**, **Tiếp nhận yêu cầu**, chọn trạng thái đã tiếp nhận và **Đã hỗ trợ khách**. Khách thấy trạng thái đổi tự động.
4. Khách **Yêu cầu thanh toán**, đọc dialog rồi xác nhận. Bàn ngừng nhận món mới; staff/thu ngân tiếp nhận yêu cầu. Tiền và việc đóng phiên chưa được xử lý trong phase này.
5. Mất mạng rồi online lại tự lấy vé mới/refetch. Nếu server socket lỗi, dùng nút cập nhật REST khi mạng hoạt động; không báo đồng bộ thành công khi socket chưa ready.

## Giới hạn / phase kế tiếp

Một API instance: tickets/connections/rooms và throttler in-memory, chưa Redis adapter/shared tickets/outbox, chưa load test fan-out hoặc auth revalidation. Vé đang chờ tối đa 10.000, connections tối đa 8/principal; chưa benchmark production. Chưa kiểm tra HTTPS/deployment, Safari/Firefox hay thiết bị bếp thật. Redis Compose vẫn chưa được dùng làm Socket adapter.

Phase 6 — Billing: aggregate non-CANCELLED orders, discount/fee/tax, kiểm tra pending/unserved, xác nhận cash/manual transfer, chống trả tiền/đóng hai lần, Payment + CLOSED + NEEDS_CLEANING + revoke guests trong transaction, mở lại trước thanh toán theo policy và receipt. Không coi hoàn tất service request là hoàn tất thanh toán.
