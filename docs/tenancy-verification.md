# SaaS 2 — cùng tài khoản, nhiều nhà hàng

Ngày 09/10/2026. API chạy Docker; web do người dùng mở trên terminal. Không migration mới, reset seed hoặc sao chép dữ liệu tenant.

## Cách sử dụng

1. Đăng nhập Owner, mở **Nhà hàng của tôi** (`/staff/restaurants`) trong menu.
2. **Tạo thêm nhà hàng**, nhập tên, mã duy nhất và múi giờ. Cùng User nhận membership OWNER tại tenant trống. Phiên hiện tại giữ nguyên.
3. Chọn **Chuyển nhà hàng** và xác nhận. Workspace tải lại dashboard, áp dụng dữ liệu/vai trò đích; thiết lập menu/bàn/nhân viên riêng.
4. Lần đăng nhập sau, tài khoản có nhiều memberships ACTIVE nhận bước **Chọn nhà hàng** sau khi kiểm tra mật khẩu. Một membership ACTIVE vẫn đăng nhập trực tiếp.

Tạm ngừng tenant do admin nền tảng quản lý. Tenant suspended vẫn hiện trong danh sách của user nhưng không thể chuyển vào. Membership inactive không hiện; ID thuộc user khác không được truy cập. Admin tắt đăng ký cũng chặn Owner tạo thêm tenant.

## Contracts và transactions

| Endpoint dưới `/api/v1` | Hành vi |
|---|---|
| `POST /auth/login` | email/password; restaurantId tùy chọn. Nếu chưa chọn khi có nhiều membership: `{ selectionRequired: true, restaurants: [...] }`, không tạo phiên/cookies mới. Chọn ID phải xác thực lại mật khẩu và membership. |
| `GET /auth/restaurants` | Staff session hợp lệ; chỉ memberships active của chính user, tên/mã/timezone/status/role; không trả dữ liệu nghiệp vụ tenant khác. |
| `POST /auth/restaurants` | OWNER; strict restaurantName/slug/timezone; 10 requests/IP/giờ. User + membership hiện tại được recheck trong transaction; chỉ tạo Restaurant, OWNER membership và audit. |
| `POST /auth/switch-restaurant` | Staff; strict restaurantId. Khóa Restaurant nguồn/đích theo UUID tăng dần rồi AuthSession; recheck nguồn/đích, revoke nguồn, tạo phiên đích và refresh hash, audit cả hai tenant trong cùng transaction. |

Switch giữ hạn tuyệt đối của session nguồn, không kéo dài đăng nhập. Cookie HttpOnly/refresh rotation giữ nguyên; không trả access/refresh tokens cho JS. Vai trò đích lấy từ DB, không mang quyền OWNER từ tenant nguồn sang tenant đích. Session nguồn/access/refresh không sử dụng lại được; hai switch đồng thời chỉ một lần thành công. `auth.tenant_left`/`auth.tenant_entered` ghi trong audit tương ứng, không log credentials.

Web tháo operational pages và LiveSync trước mutation, chờ refresh đang chạy ở tab hiện tại, hủy queries, xóa giỏ staff của tài khoản rồi tải lại toàn trang. Guest carts giữ riêng. Storage event yêu cầu các tab workspace khác xóa giỏ và reload. Header `X-DineFlow-Restaurant` là expected scope; guard đối chiếu với tenant của cookie, trả 409 + `X-DineFlow-Scope-Mismatch` trước controller nếu tab dùng tenant cũ. Header không cấp quyền chọn tenant.

Request được authorize trước switch có thể hoàn tất trong tenant nguồn. Các tab đồng thời rotate refresh vẫn có thể buộc đăng nhập lại theo strict replay policy hiện có; không tự retry mutations. Các phiên đăng nhập độc lập khác của user không bị revoke bởi switch của một session.

## Kiểm chứng

- Lint/typecheck/shared/API/Next production build qua. 17 unit tests và **94/94 integration checks** qua trên PostgreSQL thật.
- 10 checks multi-restaurant mới: empty tenant/cùng User, role injection/manager/CSRF/conflict, registration pause, password trước selection, scope/status membership, switch access/refresh/expiry/audit/data, expected-scope guard, concurrent switch, target role, inactive/expired source.
- Chromium flow multi-restaurant qua: tạo tenant trên UI, responsive desktop/390/320px, chuyển và đồng bộ hai tab, xóa giỏ staff/giữ giỏ guest, session cũ 401, scope cũ 409, menu tách biệt, foreign item 404, chuyển lại và đăng nhập chọn tenant. Fixture dùng UUID riêng, cleanup đúng IDs; không thay demo data.
- Chromium signup/platform flow cũng đã qua; selector validation được sửa để không nhầm với Next route announcer. Screenshot desktop/mobile thật và Stitch reference đã được xem.
- API Docker rebuild/migrations/readiness qua; các dịch vụ API/PostgreSQL/Redis/MinIO healthy. Web dùng phiên Next dev đang chạy của người dùng, không khởi động thêm server.
- Bộ browser hồi quy **16/16 qua**, chia 3 batches (6 + 6 + 4), giữ nguyên throttler và dùng server ngoài. Bao gồm auth/setup/QR, ordering, staff/kitchen, realtime, billing, admin, SaaS signup/platform và multi-restaurant.

Log QA local: `.local/qa/tenancy-full-integration.log`, `tenancy-unit.log`, `tenancy-lint.log`, `tenancy-full-build.log`, `tenancy-full-browser.log`, `tenancy-browser.log`, `tenancy-saas-browser.log`, `tenancy-docker-build.log`. Screenshots: `restaurants-desktop.png`, `restaurants-mobile.png`, signup/platform screenshots trong cùng thư mục. Các artifacts QA được gitignore.

## Giới hạn còn lại

Chưa có nhóm/chuỗi chi nhánh, lời mời/gắn staff account có sẵn sang tenant khác, email verification/recovery, MFA admin, custom domains hoặc thu phí. Tên/password User dùng chung: admin nhà hàng không được sửa toàn cục khi User có membership ở nhà hàng khác; role/trạng thái membership vẫn scoped. Tenant isolation qua backend scope/composite FKs, chưa có PostgreSQL RLS.

Phase tiếp theo đề xuất: xác minh email, quên mật khẩu và bảo vệ tài khoản admin; sau đó HTTPS, backup, monitoring, CI/CD và deployment production.
