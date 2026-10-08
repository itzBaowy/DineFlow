# Phase 6 — Billing

Kiểm chứng local ngày 09/10/2026. Phase 6 nối luồng QR/đơn thủ công → xác nhận → bếp → phục vụ → thanh toán → đóng phiên → dọn/mở lại bàn. Giai đoạn kế tiếp là Phase 7 — Admin/Analytics.

## Phạm vi đã triển khai

- `/staff/cashier`: phiên đang mở/yêu cầu thanh toán và 20 biên nhận gần nhất; chi tiết bill theo session ID; receipt theo payment ID.
- Bill tổng hợp mọi đơn QR/STAFF không CANCELLED trong phiên. Hiển thị các đơn hủy để đối chiếu nhưng không cộng tiền. Cần ít nhất một đơn hợp lệ và tất cả đã SERVED trước giảm giá/thanh toán.
- Giảm giá số VND cố định, reason 3–500 ký tự; xóa discount gửi amount 0/reason null. OWNER/MANAGER tới subtotal; CASHIER theo `cashierMaxDiscountBps` trong settings, mặc định 0. Backend kiểm tra cap lúc lưu và lúc thanh toán.
- CASH hoặc BANK_TRANSFER thủ công, `receivedConfirmed: true`, số tiền nhận bằng đúng total. Chuyển khoản cần mã đã kiểm tra 3–120 ký tự; tiền mặt không nhận reference. UI có checkbox và dialog cuối trước gửi.
- Nhân viên yêu cầu PAYMENT_REQUESTED hoặc mở lại OPEN trước thanh toán với reason; đối chiếu `from`. Mở lại resolve các REQUEST_PAYMENT đang chờ và cho gọi thêm; CLOSED không mở lại.
- Một payment toàn phần mỗi phiên. Payment COMPLETED, session CLOSED, bàn NEEDS_CLEANING, revoke guests, resolve service requests và hai audit được ghi nguyên tử. Socket hints gửi sau commit.
- Phiên rỗng hoặc chỉ có CANCELLED orders đóng không thu tiền với reason; không tạo Payment, không xóa đơn hủy. Discount 100% trên các đơn đã SERVED vẫn tạo Payment/receipt tổng 0.
- Receipt snapshot bất biến, giữ nhà hàng/bàn, món/tùy chọn/giá, fees/tax/discount và timestamps lúc ghi nhận tiền. In/lưu PDF A5, ẩn sidebar/actions; QR A4 giữ nguyên.
- Guest `/t/[tableCode]/bill` chỉ trả tổng tiền và số đơn/trạng thái phiên hiện tại với token hợp lệ. Không trả chi tiết đơn khách khác, ghi chú, danh tính hoặc lý do discount. Guest bị revoke khi đóng; lịch sử của khách vẫn chỉ gồm đơn họ gửi.

## API và quyền

Các đường dẫn dưới prefix `/api/v1`. Scope restaurant lấy từ staff principal; mutation chịu CSRF, strict Zod và throttler. ID sai scope trả 404.

| Endpoint | Quyền / hành vi |
|---|---|
| `GET /billing/sessions/:id/bill` | OWNER/MANAGER/CASHIER/WAITER; phiên active |
| `PATCH /billing/sessions/:id/discount` | OWNER/MANAGER/CASHIER; revision hiện tại, cap/reason, mọi đơn hợp lệ SERVED |
| `POST /billing/sessions/:id/status` | Bốn role trên; OPEN ↔ PAYMENT_REQUESTED, mở lại cần reason |
| `POST /billing/sessions/:id/payments` | OWNER/MANAGER/CASHIER; toàn phần, xác nhận tiền, revision và idempotency |
| `GET /billing/sessions/:id/receipt` | Bốn role trên; tra receipt của phiên, hỗ trợ mất phản hồi |
| `GET /billing/receipts` | Bốn role trên; 20 receipt mới nhất của nhà hàng |
| `GET /billing/receipts/:id` | Bốn role trên; snapshot gốc kể cả table/menu/settings đã đổi |
| `GET /public/tables/:code/bill` | Guest token chưa hết hạn/revoke, đúng table/current session; aggregate an toàn |
| `POST /dining-sessions/tables/:id/close-empty` | OWNER/MANAGER/CASHIER; table ID, không có đơn non-CANCELLED, reason bắt buộc |

KITCHEN không truy cập billing/receipt hoặc nhận payment hints. WAITER chỉ đọc và yêu cầu/mở lại, không giảm giá/ghi nhận tiền/đóng không thu tiền.

## Số tiền, transaction và retry

VND nguyên, tối đa Int32; dùng BigInt cho phép nhân/chia để tránh sai số float. Rates/cap là basis points 0..10000 từ settings, không hard-code tỷ lệ thuế. Với `net = subtotal − discount`:

```text
serviceCharge = roundHalfUp(net × serviceChargeBps / 10000)
tax           = roundHalfUp((net + serviceCharge) × taxBps / 10000)
total         = net + serviceCharge + tax
```

Ví dụ fixture: subtotal 80.000, discount 4.000, phí 5%, thuế 8% → phí 3.800, thuế 6.384, total 86.184 VND. Đây là cấu hình kiểm thử, không phải tỷ lệ thuế mặc định.

Khóa Restaurant → Table → Session dùng chung với order/state/setup writers. Bill revision SHA-256 bao gồm dữ liệu phiên/đơn/snapshot/cấu hình/totals; thay đổi rates, cap, discount hoặc trạng thái khiến revision cũ trả 409 trước ghi nhận tiền. Payment unique session và hash payload gắn staff user: cùng key/body/user replay receipt gốc; key/body/user khác trả 409. Lookup replay trước kiểm tra phiên CLOSED để mất phản hồi không tạo payment thứ hai.

Web lưu nguyên payload/key trong sessionStorage theo staff user/session trước POST, không lưu credentials. Network/5xx giữ pending, reload khôi phục và có nút gửi lại cùng mã hoặc tra receipt. 4xx lần đầu cho sửa dữ liệu; 4xx lúc retry giữ payload vì lần trước có thể đã commit. Không tự retry mutation. Nếu storage bị chặn, UI không gửi payment mới khi không lưu được trạng thái.

Hai migrations `202610090005_billing`/`202610090006_payment_integrity` đã áp dụng cho DB dev/test. SQL kiểm tra discount/reason/cap, bộ key/hash/snapshot cùng có hoặc cùng null, hash hợp lệ và công thức fee/tax cho payment có snapshot. BEFORE UPDATE trigger bảo vệ mọi Payment. Payment legacy thiếu snapshot trả 409 khi đọc receipt; không dựng lịch sử từ menu/settings hiện tại.

## Kết quả kiểm tra

| Kiểm tra | Kết quả |
|---|---|
| `pnpm lint` | Pass |
| `pnpm typecheck` | Pass |
| `pnpm test` | 14 pass: shared 11, API 3 |
| `pnpm test:integration` | 61 pass, PostgreSQL/MinIO thật |
| `pnpm build` | Shared/API và Next production build pass |
| `pnpm test:browser` | 12 flows Chromium pass |

Billing integration có 10 scenarios + parent, thêm 11 vào 50 tests trước: scopes/RBAC/guest privacy; multiple orders và unserved blockers; discount/cap/reason; config/stale revision/wrong amount/manual transfer validation; request/reopen; concurrent same-key payment; immutable receipt/tenant isolation; bank transfer/discount 100%; no-charge và SQL integrity; pay-vs-order/reopen races. Publisher observer đọc DB lúc phát event và xác minh mọi tác động đóng đã commit; socket clients xác minh đúng recipients.

Hai browser flows mới dùng API/DB thật với tenant/user ngẫu nhiên: QR nhiều đơn + một đơn từ chối → waiter/kitchen/served → discount → cash → receipt/print → guest revoke → dọn và cùng QR cho phiên mới; manual transfer → cố tình mất phản hồi **sau POST thật đã commit** → reload → retry cùng payload/key → đúng một Payment/audit, cùng receipt; đóng không thu tiền phiên chỉ có đơn hủy. Kiểm tra quyền WAITER, không có Payment trước dialog cuối, viewport 390/320px và không có page errors. Mobile setup dùng drawer và retry GET workspace khi cả suite chung IP chạm giới hạn thật; không tắt throttler hay retry payment tự động.

Logs nằm trong `.local/qa/phase6-{unit,integration,build,browser}.log`; screenshots gồm `cashier-bill-desktop.png`, `cashier-bill-mobile.png`, `receipt-print.png`, `payment-retry-after-reload.png` và PDF `payment-receipt.pdf`. Artifacts local/test traces được gitignore. Đã đối chiếu screenshots với Stitch screen `1ea9154da32d4af09ba92db2aaca0b61`, prompt/reference lưu trong `docs/design/`.

## Dùng thử

1. OWNER/MANAGER đặt phí/thuế và hạn mức discount thu ngân ở Thông tin nhà hàng. Đăng nhập WAITER mở bàn, dùng QR nhập phiên và gửi đơn.
2. Nhân viên xác nhận; bếp chế biến/sẵn sàng; nhân viên ghi đã phục vụ. Mở Thu ngân, chọn phiên hoặc dùng Xem hóa đơn tại Phiên bàn.
3. Kiểm tra các đơn, discount/reason và total. Có thể yêu cầu thanh toán để ngừng món mới; mở lại cần lý do nếu khách gọi thêm.
4. Sau mọi đơn hợp lệ SERVED, chọn tiền mặt hoặc chuyển khoản. Kiểm tra tiền thực nhận; nhập đúng total/mã chuyển khoản, đánh dấu đã nhận và xác nhận dialog cuối.
5. Xem/in biên nhận. Phiên đã đóng, khách hết quyền truy cập, bàn cần dọn. WAITER xác nhận đã dọn rồi mở phiên mới với cùng QR.
6. Nếu mất phản hồi, tải lại đúng trang phiên và kiểm tra giao dịch đã ghi nhận; cần retry thì dùng nút cùng mã, tránh tạo yêu cầu mới.

## Giới hạn

Kiểm chứng local Windows và Chromium với production web build, API env development. Chưa kiểm tra HTTPS/deployment, Safari/Firefox, máy in vật lý hoặc tải đồng thời production. Chuyển khoản kiểm tra thủ công, chưa gateway/bank webhook/QR thanh toán; chưa split/partial/refund/hóa đơn điện tử. Receipt hỗ trợ giấy A5, chưa tối ưu máy in nhiệt. Realtime/throttler/tickets vẫn một API instance, events best-effort và REST refetch; chưa Redis adapter/durable outbox. Báo cáo doanh thu/món bán chạy/audit UI thuộc Phase 7.
