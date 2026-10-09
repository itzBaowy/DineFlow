# Phase 7 — Admin/Analytics

Triển khai và kiểm chứng local ngày 09/10/2026. API/DTO, giao diện quản trị và tests đã có; browser suite gần nhất đạt 13/14, chưa xác nhận lại toàn bộ với runner chia batch. API hiện chạy trong Docker và web để người dùng tự chạy terminal theo yêu cầu.

## Màn hình và cách dùng

OWNER/MANAGER mở `/admin` để chuyển đến `/admin/reports`. Sidebar có Báo cáo, Lịch sử đơn, Nhật ký hoạt động và Nhân viên. Các role khác bị chặn cả UI lẫn backend.

- `/admin/reports`: mặc định 30 ngày local gần nhất; chọn ngày đầu/cuối, nhóm ngày/tháng, phương thức rồi áp dụng. Có tiền đã thu, số hóa đơn, giá trị trung bình, tiền món, giảm giá/phí/thuế; chart và bảng số liệu phân trang, methods và top 10 món. Ngày không phát sinh có 0, không dùng dữ liệu mẫu.
- `/admin/orders`: lọc theo ngày tạo đơn, trạng thái, nguồn QR/nhân viên, trạng thái phiên và mã đơn; chứa cả phiên CLOSED. Detail giữ món/tùy chọn/giá/ghi chú snapshot, mốc xử lý/lý do hủy, liên kết biên nhận. Tên bàn là tên hiện tại; receipt giữ tên lúc thanh toán.
- `/admin/activity`: lọc ngày, action chính xác, actor và phân trang; actor có thể là hệ thống/khách. Chỉ render scalar metadata backend whitelist. Bộ chọn actor lấy 50 nhân viên đầu và nêu giới hạn nếu nhiều hơn.
- `/admin/staff`: tìm tên/email, lọc role/trạng thái, phân trang; tạo tài khoản, sửa tên/role/quyền truy cập, reset password với reason. Stale update trả 409 và yêu cầu mở lại form. Không lưu password vào browser storage hoặc audit.

TanStack Query có loading/error/retry/empty states. Socket hints, reconnect và tab visible invalidate admin queries, REST là nguồn dữ liệu. Không tự retry mutation. Giữ thiết kế Artisanal Operations từ cùng Stitch project, bổ sung screen `b352c7f92d5e45ce92c795188410b3e2`.

## API

Prefix `/api/v1`, tất cả endpoint dưới đây chỉ OWNER/MANAGER, restaurant scope từ principal.

| Endpoint | Nội dung |
|---|---|
| `GET /reports/revenue` | from/to, groupBy day/month, optional CASH/BANK_TRANSFER |
| `GET /reports/orders` | dates/pagination, status/source/sessionStatus/tableId/orderNumber |
| `GET /reports/orders/:id` | Snapshot đơn, phiên và payment ID; ngoài scope trả 404 |
| `GET /reports/activity` | dates/pagination, exact action/actorUserId |
| `GET /staff` | search/role/isActive/pagination, không trả password hash |
| `POST /staff` | name/email/password/role, chỉ tạo User mới |
| `PATCH /staff/:membershipId` | name/role/isActive/expectedUpdatedAt |
| `POST /staff/:membershipId/password` | password/reason/expectedUpdatedAt, revoke sessions |

Strict Zod từ chối query/body lạ, query trùng key và restaurant ID tùy ý. Khoảng ngày gồm cả hai đầu, tối đa 366 ngày trong 2000–2100. Pagination tối đa 50 rows/page. Mutations có CSRF/transactions/audit; create/reset có throttling.

## Dữ liệu và quyền

Revenue chỉ lấy Payment COMPLETED có completedAt trong kỳ. SQL chuyển 00:00 ngày đầu và 00:00 sau ngày cuối từ timezone nhà hàng sang UTC, không giả định một ngày luôn 24 giờ. Gom tháng vẫn giới hạn đúng hai ngày đã chọn. Payment tổng 0 vẫn được đếm; payment legacy thiếu receipt snapshot vẫn được tính revenue.

RepeatableRead giữ cards/totals/buckets/methods/best-sellers nhất quán. SQL parameterize; SUM BigInt được kiểm tra MAX_SAFE_INTEGER trước JSON; average làm tròn half-up về VND nguyên. Tổng nhiều payments có thể vượt Int32 của từng payment.

Best-sellers chỉ lấy items non-CANCELLED từ phiên có payment eligible, nhóm menuItemId + nameSnapshot, cộng quantity/lineTotal có tùy chọn và đếm đơn riêng. Tiền món trước discount/phí/thuế; không phải lợi nhuận hoặc tự phân bổ discount. Menu đổi tên/giá/archive không viết lại snapshots. History lọc Order.createdAt, khác revenue lọc Payment.completedAt. Detail không trả idempotency/request hash/guest credential. Audit loại secrets, guest IDs và JSON tùy ý, chỉ trả fields nghiệp vụ whitelist.

MANAGER không tạo/sửa/khóa/reset OWNER. Không tự đổi role/khóa/reset password; được sửa tên mình. Luôn còn một OWNER có User và membership active. Staff mutation khóa Restaurant, recheck actor trong transaction và đối chiếu updatedAt, xử lý race hai OWNER đổi quyền lẫn nhau.

Đổi role/khóa/reset revoke AuthSessions của membership; access/refresh cũ bị từ chối ở request tiếp theo. Bật lại không phục hồi phiên cũ. Password scrypt và audit không có password/hash. Email có sẵn ở tenant khác trả conflict; chặn sửa tên/password toàn cục nếu User có memberships tại nhà hàng khác. Không xóa tài khoản/lịch sử; chưa có invitation hoặc self-service password flow.

## Kết quả kiểm tra

| Kiểm tra | Kết quả thực tế |
|---|---|
| `pnpm lint` | Qua, không warning |
| `pnpm typecheck` | Qua toàn workspace |
| `pnpm test` | 17/17: shared 14 + API 3 |
| `pnpm test:integration` | 73/73, PostgreSQL/MinIO thật |
| `pnpm build` | Qua shared/API/Next production build |
| Browser trước yêu cầu không chạy web | 13/14, hai admin flows qua; setup owner gặp 429 do lưu lượng chung IP |
| Browser runner mới | Discover đủ 14 tests; thiếu web thì preflight dừng đúng, không khởi động server |
| Docker API | Build/rebuild, migration exit 0, API/dependencies healthy; auth/reports/history/activity/staff/WebSocket/MinIO smoke qua |
| `pnpm test:docker` | 3/3 |

12 integration checks admin (11 subtests + parent) thêm vào 61 tests Phase 6: RBAC/tenant/validation, local boundaries/zero ngày/100% discount, partial months/tổng hơn 2 tỷ, DST New York, closed/archive snapshots, audit an toàn, staff create/OWNER restrictions, stale edits/role/active revocation, password reset và concurrent OWNER demotion. Fixtures hai tenants/đủ roles, cleanup đúng IDs, không truncate dev.

Hai browser flows mới kiểm tra real cash/manual transfer totals, bỏ đơn chưa trả tiền/hủy khỏi revenue, rename/archive giữ snapshots, ngày/tháng/method/empty/invalid dates, detail/receipt/audit và mobile 390/320px; staff create, role/reset password/old sessions, disable và MANAGER restrictions. Đã đối chiếu `.local/qa/reports-desktop.png`, `reports-mobile.png`, `staff-admin-mobile.png`. Chart spacing/bảng mặc định kỳ mới nhất đã chỉnh tiếp sau screenshot; build qua, cần chụp lại khi người dùng chạy web.

Runner mặc định dùng server bên ngoài, tối đa ba spec mỗi batch và chờ 65 giây giữa batches để rate limiter thật hết cửa sổ. Chưa chạy lại runner vì web do người dùng tự chạy. Sau khi web sẵn sàng:

```powershell
pnpm test:browser
```

Xem [Docker API](docker-api.md) để chạy backend/web riêng. Phase 8 tiếp tục E2E với runner mới, logs/monitoring, backup, hardening, HTTPS và CI/CD/deployment. Chưa có bank gateway, refund, profit accounting hoặc báo cáo ca làm việc.
