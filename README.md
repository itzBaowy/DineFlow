# DineFlow

Hệ thống QR Ordering và quản lý nhà hàng theo [Requirement.md](Requirement.md). Hiện triển khai **Phase 1 — Foundation**, với giao diện được thiết kế bằng Google Stitch và chuyển thành Next.js components kết nối NestJS/PostgreSQL thật.

## Đã có

- pnpm monorepo, Next.js 16.4/React 19.3, NestJS 12.1, TypeScript strict, Prisma 7.10 stable + pg adapter.
- PostgreSQL schema, SQL migrations, composite foreign keys, money checks và partial unique index cho phiên bàn active.
- Seed: một nhà hàng, 10 bàn, 5 danh mục, 20 món, size/topping và 5 nhân viên. Không seed đơn/doanh thu giả.
- Đăng nhập/đăng xuất nhân viên; access JWT, refresh token rotation, cookie HttpOnly, chống replay, CSRF kiểm tra origin/custom header, login rate limit, RBAC backend.
- `/staff/login`, `/staff/dashboard`, `/admin/settings` (owner/manager, read-only); dữ liệu cấu hình lấy từ API thật. Responsive mobile drawer, loading/error states, refresh phiên tự động cho GET.
- Swagger, health checks, environment validation, tests với PostgreSQL thật và browser E2E cho foundation.

Chưa có luồng mở bàn/QR/gọi món/bếp/realtime/thanh toán/báo cáo. Những phần này thuộc Phase 2–8, không phải tính năng đã hoàn thành chỉ vì schema đã được tạo.

## Chạy local

Yêu cầu Node **22.12+**, pnpm **9.15.9**, Docker Desktop với Linux containers đang chạy. Ports mặc định web3000/api4000/PG5432/Redis6379 phải còn trống.

```powershell
pnpm install --frozen-lockfile
pnpm setup:env
pnpm infra:up
pnpm db:generate
pnpm db:migrate
pnpm db:seed
pnpm dev
```

`setup:env` sinh secrets ngẫu nhiên vào `.env` đã được gitignore và không ghi đè khi file tồn tại. Đừng dùng nguyên marker trong `.env.example`. Nếu đổi PostgreSQL password khi volume đã có dữ liệu, phải đổi password trong DB tương ứng; environment của image chỉ tạo credentials lần đầu.

- Web: <http://localhost:3000/staff/login>
- Swagger: <http://localhost:4000/api/docs> (không bật trong production)
- Liveness: <http://localhost:4000/api/v1/health/live>
- Readiness kiểm tra PostgreSQL: <http://localhost:4000/api/v1/health/ready>

Tài khoản demo: `owner@dineflow.local`, `manager@dineflow.local`, `waiter@dineflow.local`, `kitchen@dineflow.local`, `cashier@dineflow.local`. Tất cả dùng giá trị **SEED_DEMO_PASSWORD trong `.env` local**. Seed chạy lại không reset password, role hay dữ liệu đã chỉnh. Không chạy demo seed trong production.

Web gọi `/api/v1` qua Next rewrite để dùng cookie cùng origin. `APP_ORIGIN` phải khớp địa chỉ trình duyệt, không có trailing slash; `API_INTERNAL_URL` là địa chỉ backend mà Next truy cập. Khi đổi origin phải restart cả hai. Cookie trong production bắt buộc Secure và HTTPS.

MinIO chưa dùng trong Phase 1; có thể khởi động profile khi bắt đầu upload:

```powershell
docker compose --profile storage up -d --wait
```

Redis được chuẩn bị trong Compose, chưa được dùng như cache/queue; MinIO upload, worker và Redis Socket adapter chỉ thêm khi phase tương ứng cần.

## Kiểm tra

```powershell
pnpm lint
pnpm typecheck
pnpm test
pnpm test:integration
pnpm build
pnpm --filter @dineflow/web exec playwright install chromium
pnpm test:browser
```

Integration tự tạo/migrate database riêng `dineflow_test` trên server cùng connection URL local. Tài khoản PG cần quyền tạo DB (Compose local đã có). Có thể truyền `TEST_DATABASE_URL`; tên DB bắt buộc kết thúc `_test`. Tests tạo fixtures riêng và cleanup đúng IDs, không truncate DB dev. Có 11 integration scenarios + parent test (Node báo 12 tests) về HTTP auth, CSRF, RBAC 5 roles, refresh replay/concurrency, logout/expiry/disable, scope, rate limit và DB constraints. Đây chưa phải test API thanh toán/gọi món, vì API đó chưa có.

Browser tests dùng DB dev đã seed và password local để kiểm tra dữ liệu thật. Build trước; Playwright tự khởi động API/web nếu ports còn trống, hoặc dùng server đang chạy. Có 2 flows desktop/mobile: redirect khi chưa login, form validation/password toggle, login, metrics, owner settings, rotate refresh, role denial, mobile drawer và logout. Screenshots lưu `.local/qa/`; traces/test-results được gitignore.

Chạy web production build local (API vẫn dùng env dev):

```powershell
pnpm --filter @dineflow/api start
# Terminal khác
pnpm --filter @dineflow/web start
```

`pnpm infra:down` dừng containers và giữ volumes. Không dùng `down -v` nếu cần giữ dữ liệu.

## Thiết kế và nghiệp vụ

- [Architecture / scope](docs/architecture.md)
- [Database ERD](docs/database.md)
- [State machines / role policy](docs/state-machines.md)
- [Roadmap](docs/roadmap.md)
- [Stitch → Next.js](docs/design/implementation.md)
- [Stitch design system](docs/design/DESIGN.md)
- [Stitch project](https://stitch.withgoogle.com/projects/7484965213377838536)

HTML tham chiếu Stitch trong `docs/design/*.reference.html` chỉ để đối chiếu; không dùng scripts giả lập của chúng trong sản phẩm. IDs các màn hình được lưu ở `docs/stitch-project.json` để tiếp tục thiết kế trong cùng project.

## Giới hạn hiện tại

Chỉ xác minh local Windows, PostgreSQL/Redis Compose và Chromium desktop/mobile. Chưa kiểm tra deployment, production Docker app images, HTTPS thực tế, Safari/Firefox, Socket.IO hay E2E restaurant ordering toàn quy trình. Strict refresh replay policy có thể buộc đăng nhập lại khi nhiều tab refresh cùng lúc. Throttler in-memory chỉ phù hợp một backend instance. Demo seed và Swagger chỉ dành cho development.
