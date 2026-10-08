# DineFlow

Hệ thống QR Ordering và quản lý nhà hàng theo [Requirement.md](Requirement.md). Đã triển khai **Phase 1 — Foundation và Phase 2 — Restaurant Setup**, với giao diện Google Stitch chuyển thành Next.js components kết nối NestJS/PostgreSQL/MinIO thật.

## Đã có

- pnpm monorepo, Next.js 16.4/React 19.3, NestJS 12.1, TypeScript strict, Prisma 7.10 stable + pg adapter.
- PostgreSQL schema, SQL migrations, composite foreign keys, money checks và partial unique index cho phiên bàn active.
- Seed: một nhà hàng, 10 bàn, 5 danh mục, 20 món, size/topping và 5 nhân viên. Không seed đơn/doanh thu giả.
- Đăng nhập/đăng xuất nhân viên; access JWT, refresh token rotation, cookie HttpOnly, chống replay, CSRF kiểm tra origin/custom header, login rate limit, RBAC backend.
- `/staff/login`, `/staff/dashboard`; workspace responsive, loading/error states, refresh phiên tự động cho GET.
- Owner/Manager quản lý settings/logo/phí/thuế, danh mục, món/giá/trạng thái bán, size/topping, bàn và QR. Tạo/download PNG/SVG, chọn nhãn để in hoặc lưu PDF A4.
- Upload JPEG/PNG/WebP qua S3 abstraction/MinIO, kiểm tra nội dung và kích thước, chuẩn hóa WebP; kiểm tra quyền sở hữu ảnh khi gắn vào món/logo.
- Archive bảo toàn lịch sử, tenant-scoped mutations, RBAC backend, transactions và ActivityLog.
- Swagger, health checks, environment validation, tests với PostgreSQL/MinIO thật, QR decoding và browser E2E.

Chưa có mở phiên bàn/gọi món/bếp/realtime/thanh toán/báo cáo. Các luồng này thuộc Phase 3–8. Trang `/t/[tableCode]` hiện xác minh bàn và hiển thị thông tin nhà hàng, chưa nhận đơn.

## Chạy local

Yêu cầu Node **22.12+**, pnpm **9.15.9**, Docker Desktop với Linux containers đang chạy. Ports mặc định web3000/api4000/PG5432/Redis6379/MinIO9000,9001 phải còn trống. Lần đầu build MinIO cần mạng để tải Go modules.

```powershell
pnpm install --frozen-lockfile
pnpm setup:env
pnpm infra:up
pnpm db:generate
pnpm db:migrate
pnpm db:seed
pnpm dev
```

`setup:env` sinh secrets ngẫu nhiên vào `.env` đã được gitignore. Với `.env` từ Phase 1, chỉ bổ sung S3 credentials còn thiếu từ MinIO local và giữ giá trị đã có. Đừng dùng nguyên marker trong `.env.example`. Nếu đổi PostgreSQL password khi volume đã có dữ liệu, phải đổi password trong DB tương ứng; environment của image chỉ tạo credentials lần đầu.

- Web: <http://localhost:3000/staff/login>
- Swagger: <http://localhost:4000/api/docs> (không bật trong production)
- Liveness: <http://localhost:4000/api/v1/health/live>
- Readiness kiểm tra PostgreSQL: <http://localhost:4000/api/v1/health/ready>
- MinIO console local: <http://localhost:9001> (credentials trong `.env`, chỉ dùng local)

Tài khoản demo: `owner@dineflow.local`, `manager@dineflow.local`, `waiter@dineflow.local`, `kitchen@dineflow.local`, `cashier@dineflow.local`. Tất cả dùng giá trị **SEED_DEMO_PASSWORD trong `.env` local**. Seed chạy lại không reset password, role hay dữ liệu đã chỉnh. Không chạy demo seed trong production.

Web gọi `/api/v1` qua Next rewrite để dùng cookie cùng origin. `APP_ORIGIN` phải khớp địa chỉ trình duyệt, không có trailing slash; `API_INTERNAL_URL` là địa chỉ backend mà Next truy cập. Khi đổi origin phải restart cả hai. Cookie trong production bắt buộc Secure và HTTPS.

`pnpm infra:up` khởi động cả PostgreSQL/Redis/MinIO. MinIO được build từ security release source chính thức đã pin trong `docker/minio.Dockerfile`, vì image registry cũ không còn tải được. Chỉ khởi động storage nếu cần:

```powershell
docker compose --profile storage up -d --build --wait minio
```

S3 cấu hình qua `S3_ENDPOINT`, `S3_REGION`, `S3_BUCKET`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`. Local cho phép `S3_AUTO_CREATE_BUCKET=true`; production yêu cầu provision bucket trước và đặt false. Bucket private, backend phục vụ ảnh công khai đã ghi nhận qua `/api/v1/storage/images/:id`; không gửi storage credentials cho browser. Redis chưa dùng như cache/queue; worker và Redis Socket adapter chỉ thêm khi cần.

QR dùng `APP_ORIGIN` làm URL. Muốn quét trên điện thoại, đổi origin sang địa chỉ LAN/domain truy cập được, cấu hình đường dẫn API phù hợp, restart web/API rồi in lại. QR trỏ localhost chỉ dùng trên máy đang chạy web.

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

Integration tự tạo/migrate database riêng `dineflow_test` trên server cùng connection URL local. Tài khoản PG cần quyền tạo DB (Compose local đã có). Có thể truyền `TEST_DATABASE_URL`; tên DB bắt buộc kết thúc `_test`. Tests tạo fixtures riêng và cleanup đúng IDs/objects, không truncate DB dev. 20 tests về auth, RBAC, CSRF, refresh/replay/concurrency, DB constraints, setup scope/validation/archive, QR decoding/regeneration, upload MinIO và audit. Storage phải chạy và có credentials hợp lệ. Chưa có test API thanh toán/gọi món vì endpoint chưa triển khai.

Browser tests dùng DB dev đã seed và password local để kiểm tra dữ liệu thật. Build trước; Playwright tự khởi động API/web nếu ports còn trống, hoặc dùng server đang chạy. 4 flows desktop/mobile kiểm tra auth, dữ liệu DB, role denial, drawer, setup CRUD, upload ảnh, QR download/print/regeneration và settings. Fixtures test được archive qua API; thay đổi settings được khôi phục. Screenshots/PDF QA lưu `.local/qa/`; traces/test-results được gitignore.

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
- [Phase 2 verification](docs/phase-2-verification.md)
- [Stitch → Next.js](docs/design/implementation.md)
- [Stitch design system](docs/design/DESIGN.md)
- [Stitch project](https://stitch.withgoogle.com/projects/7484965213377838536)

HTML tham chiếu Stitch trong `docs/design/*.reference.html` chỉ để đối chiếu; không dùng scripts giả lập của chúng trong sản phẩm. IDs các màn hình được lưu ở `docs/stitch-project.json` để tiếp tục thiết kế trong cùng project.

## Giới hạn hiện tại

Chỉ xác minh local Windows, PostgreSQL/Redis/MinIO Compose và Chromium desktop/mobile. Chưa kiểm tra deployment, production Docker app images/S3, HTTPS thực tế, Safari/Firefox, máy in vật lý, Socket.IO hay E2E ordering toàn quy trình. Strict refresh replay policy có thể buộc đăng nhập lại khi nhiều tab refresh cùng lúc. Throttler in-memory chỉ phù hợp một backend instance. Chưa có job dọn ảnh upload bỏ dở. Demo seed, Swagger và MinIO hiện tại chỉ dành cho development.
