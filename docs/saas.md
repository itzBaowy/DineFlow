# SaaS miễn phí — chủ nhà hàng và admin nền tảng

Phạm vi cập nhật ngày 09/10/2026, thay thế giới hạn một nhà hàng ban đầu của Requirement.md. DineFlow có nhiều nhà hàng độc lập trên cùng ứng dụng. Chưa thu phí hoặc có subscription/trial/checkout chủ quán; billing khách ăn tại nhà hàng giữ nguyên.

## Chủ nhà hàng

Mở <http://localhost:3000/register> (trang `/` cũng chuyển đến đây), nhập tên/email/mật khẩu, tên nhà hàng, slug duy nhất và timezone. Đăng ký tạo User, Restaurant ACTIVE, membership OWNER và activity log trong cùng transaction. Nhà hàng bắt đầu trống, không seed menu/bàn/đơn/doanh thu giả. Thành công có liên kết đăng nhập bằng tài khoản vừa tạo.

Trong workspace, Owner thêm settings/menu/bàn/QR và mở `/admin/staff` để tạo Manager/Waiter/Kitchen/Cashier. Manager cũng tạo/quản lý nhân viên nhưng không tạo/sửa/khóa/reset Owner. Các tài khoản dùng email duy nhất trên nền tảng; tài khoản có sẵn của tenant khác không tự được gắn vào nhà hàng. Quyền nghiệp vụ và bảo vệ Owner active cuối cùng vẫn áp dụng.

Tenant ID lấy từ membership trong phiên staff, không nhận tenant tùy ý từ body/query. Menu, bàn, đơn, payments, reports, media ownership và audit tiếp tục tenant-scoped, có composite foreign keys. QR có public code riêng, guest scope đúng table/current dining session. Global admin không phải một role của nhà hàng.

## Admin nền tảng

Tài khoản admin được cấp bằng CLI, không có đường đăng ký admin công khai. Trên máy local hiện đã tạo `admin@dineflow.local`; mật khẩu là **PLATFORM_ADMIN_PASSWORD trong `.env`**, riêng với SEED_DEMO_PASSWORD. Nếu bạn cấu hình email khác, dùng PLATFORM_ADMIN_EMAIL trong `.env`.

Đăng nhập <http://localhost:3000/platform/login>, console tại `/platform`:

- Tổng số tenants, active/suspended và users; uptime API, kiểm tra PostgreSQL thật, số dining sessions chưa đóng.
- Tìm tên/slug, lọc trạng thái, xem owners và số staff/bàn/menu records theo tenant; phân trang.
- Tạm ngừng/mở lại tenant với lý do và expectedUpdatedAt; conflict cần đóng/mở lại form để lấy phiên bản hiện tại.
- Bật/tắt đăng ký nhà hàng mới; không ảnh hưởng tenant đang dùng.
- Nhật ký riêng cho login/logout/bootstrap, suspension/resumption và thay đổi đăng ký; không chứa passwords/tokens/hash.

Admin sử dụng opaque token ngẫu nhiên 32 bytes, chỉ hash SHA-256 trong PlatformSession; cookie HttpOnly/SameSite=Strict, path `/api/v1/platform`, Secure theo env. Phiên tuyệt đối 8 giờ, không refresh/sliding; hết hạn phải đăng nhập lại. Backend kiểm tra session/User active/isPlatformAdmin mỗi request. Owner/Manager cookies không được dùng cho platform APIs; platform cookie không cấp quyền business tenant.

Console quản lý tenant/access/config và đọc tình trạng API/database. Chưa có fleet monitoring, thao tác restart container từ web, Redis adapter, quản lý secrets hoặc deploy qua console. Docker vận hành qua terminal theo [Docker API](docker-api.md).

## Tạm ngừng tenant

Platform mutation khóa Restaurant, kiểm tra admin còn hợp lệ và updatedAt, cập nhật status, revoke mọi AuthSession thuộc membership và GuestSession thuộc tenant, ghi PlatformAudit trong cùng transaction. Không xóa dữ liệu hoặc tự đóng dining sessions/thanh toán.

Staff login/auth/refresh bị chặn; public table/menu/admission/order/request/bill/ticket bị chặn; realtime revalidation ngắt kết nối bị thu hồi. Các business writers khóa Restaurant và recheck ACTIVE trước khi ghi, nên request đang đợi lock không ghi sau suspension commit. Upload đã put object nhưng transaction bị chặn sẽ cleanup object. Các reads đã được authorize trước lúc suspension có thể hoàn tất; request kế tiếp bị từ chối.

Mở lại cho dùng dữ liệu/phiên bàn cũ nhưng không hồi sinh credentials đã revoke. Nhân viên đăng nhập lại; khách được cấp token mới nếu phiên bàn còn cho admission. Trình duyệt có thể còn ảnh public đã cache; suspension là kiểm soát truy cập/ordering, không xóa ảnh đã tải về.

## CLI và Docker

```powershell
pnpm setup:env
pnpm api:up
# Cấp admin lần đầu; không tự nâng quyền tài khoản tenant có sẵn:
pnpm platform:bootstrap
# Bạn tự chạy FE bằng terminal:
pnpm dev:web
```

`setup:env` bổ sung PLATFORM_ADMIN_EMAIL/NAME/PASSWORD thiếu mà giữ nguyên cấu hình cũ; password ngẫu nhiên riêng, không log credentials. `platform:bootstrap` yêu cầu migration đã áp dụng, từ chối email thuộc tài khoản khác hoặc tạo admin thứ hai. Chạy lại admin đã có không reset password/role. API image không chứa `.env` hoặc bootstrap password; credentials này chỉ được CLI đọc trên host.

Migration `202610090007_saas` thêm status/suspensionReason vào Restaurant, isPlatformAdmin mặc định false vào User và ba bảng PlatformSession/Settings/Audit. Tenant hiện có trở thành ACTIVE; không reset users/settings/orders/payments. PlatformSettings singleton mặc định mở đăng ký. Không có thay đổi Docker chạy web; web vẫn do người dùng tự mở.

## API mới

Prefix `/api/v1`:

| Endpoint | Quyền |
|---|---|
| `GET /auth/registration-settings` | Public, chỉ registrationsEnabled |
| `POST /auth/register` | Public, strict DTO; 10 requests/IP/giờ, kể cả email khác nhau |
| `POST /platform/auth/login` | Public, 5 requests/email+IP/phút, chỉ User isPlatformAdmin |
| `POST /platform/auth/logout` | Revoke opaque session, clear cookie |
| `GET /platform/auth/me` | Platform session hợp lệ |
| `GET /platform/overview` | Platform admin |
| `GET /platform/tenants` | Platform admin; search/status/page/pageSize |
| `PATCH /platform/tenants/:id/status` | Platform admin; status/reason/expectedUpdatedAt |
| `PATCH /platform/settings` | Platform admin; registrationsEnabled/reason/expectedUpdatedAt |
| `GET /platform/audit` | Platform admin; page/pageSize |

Platform controllers skip staff authentication để dùng guard riêng, vẫn có global CSRF/throttler và PlatformGuard. Public signup không nhận role/isPlatformAdmin/isActive/restaurantId; server quyết định Owner/ACTIVE. Registration và settings change cùng khóa singleton để đóng đăng ký không xen vào transaction tạo tenant.

## Kiểm chứng

- Lint, typecheck, 17 unit tests và 84 integration tests đều qua; shared/API/Next production build qua. Có 11 SaaS checks mới (10 subtests + parent) về signup atomic/races, tenant isolation, manager restrictions, platform auth separation, suspension/guest/QR/refresh, resume, registration settings/audit, waiting writer recheck, admin expiry/logout và signup IP limit.
- Docker rebuild và migration exit 0; API/PostgreSQL/Redis/MinIO healthy. Direct container smoke qua auth/reports/history/staff, platform login/overview/tenants/audit/logout, Socket.IO và sharp/MinIO.
- Luồng Docker thực tế tạo tenant fixture trống → Owner tạo Manager → admin list/suspend/resume → phiên Owner/Manager cũ 401 → login mới được; cleanup đúng tenant/user IDs, giữ dữ liệu hiện có.
- Bootstrap local thành công, account không có membership nhà hàng. FE có `/register`, `/platform/login`, `/platform`; kiểu dữ liệu/build đã kiểm chứng. Tham chiếu Stitch signup được xem và lưu, không chạy scripts HTML mẫu.
- Browser discover đủ **15 flows**, gồm SaaS mới trên desktop/390/320px. Chưa chạy browser suite hoặc chụp UI SaaS thực tế vì web do người dùng tự chạy; không khởi động web. Sau khi web sẵn sàng, chạy `pnpm test:browser` (runner dùng server bên ngoài/chia batch). Lần suite Phase 7 trước đó 13/14, setup owner gặp rate-limit 429; không tính test SaaS mới là đã qua.

## Giới hạn giai đoạn đầu

Mỗi đăng ký tạo một tenant cho Owner mới; mỗi tài khoản staff đăng nhập duy nhất một membership active. Chưa có tenant switcher/chuỗi chi nhánh cho một user, custom subdomain, invitation, xác minh email, self-service password recovery, MFA admin, charging hoặc PostgreSQL RLS. Isolation được thực thi bởi auth principal, scoped queries và composite foreign keys. Production HTTPS/backup/monitoring/CI/CD và full browser QA tiếp tục trong roadmap; đây là bản SaaS foundation chạy local.
