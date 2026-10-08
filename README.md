# DineFlow

Hệ thống QR Ordering và quản lý nhà hàng theo [Requirement.md](Requirement.md). Đã triển khai **Phase 1–5: Foundation, Restaurant Setup, Customer Ordering, Staff & Kitchen và Realtime**, với giao diện Google Stitch chuyển thành Next.js components kết nối NestJS/PostgreSQL/MinIO thật.

## Đã có

- pnpm monorepo, Next.js 16.4/React 19.3, NestJS 12.1, TypeScript strict, Prisma 7.10 stable + pg adapter.
- PostgreSQL schema, SQL migrations, composite foreign keys, money checks và partial unique index cho phiên bàn active.
- Seed: một nhà hàng, 10 bàn, 5 danh mục, 20 món, size/topping và 5 nhân viên. Không seed đơn/doanh thu giả.
- Đăng nhập/đăng xuất nhân viên; access JWT, refresh token rotation, cookie HttpOnly, chống replay, CSRF kiểm tra origin/custom header, login rate limit, RBAC backend.
- `/staff/login`, `/staff/dashboard`; workspace responsive, loading/error states, refresh phiên tự động cho GET.
- Owner/Manager quản lý settings/logo/phí/thuế, danh mục, món/giá/trạng thái bán, size/topping, bàn và QR. Tạo/download PNG/SVG, chọn nhãn để in hoặc lưu PDF A4.
- Upload JPEG/PNG/WebP qua S3 abstraction/MinIO, kiểm tra nội dung và kích thước, chuẩn hóa WebP; kiểm tra quyền sở hữu ảnh khi gắn vào món/logo.
- Archive bảo toàn lịch sử, tenant-scoped mutations, RBAC backend, transactions và ActivityLog.
- `/staff/tables`: mở phiên bàn, đọc các đơn của phiên, đóng phiên rỗng có lý do và xác nhận đã dọn theo RBAC.
- `/t/[tableCode]`, `/cart`, `/orders`: thực đơn công khai, tìm kiếm/danh mục, size/topping, ghi chú, giỏ hàng giữ qua tải lại, checkout và lịch sử các đơn do khách hiện tại gửi.
- Guest admission vào phiên do nhân viên mở, opaque token HttpOnly có hạn và scope bàn/phiên; giá tính ở server, snapshot món/tùy chọn, idempotency và transaction chống xung đột.
- `/staff/orders`: lọc bàn/trạng thái, phân trang, xác nhận/từ chối có lý do và ghi nhận đã phục vụ theo role; dashboard hiển thị số đơn/bàn hiện tại từ database.
- `/staff/kitchen`: ba hàng đợi đã nhận/đang chế biến/sẵn sàng, món và ghi chú snapshot, thời gian chờ, nút chế biến lớn; chỉ đơn đã xác nhận được chuyển bếp.
- Ghi đơn thủ công từ phiên bàn OPEN, dùng chung menu/cart/pricing/modifiers, giữ giỏ qua reload và idempotency theo nhân viên. Chuyển trạng thái lưu timestamps/audit trong transaction, từ chối request đã lỗi thời.
- Socket.IO xác thực qua vé một lần, scope nhà hàng/role/guest/phiên do server quyết định. Đơn mới, tiến độ và trạng thái bàn tự cập nhật sau commit; hiển thị trạng thái kết nối, thông báo đơn/yêu cầu mới và refetch REST khi kết nối lại.
- Khách gọi nhân viên/yêu cầu thanh toán; `/staff/requests` tiếp nhận và hoàn tất theo role, chống gửi trùng và xung đột. Yêu cầu thanh toán chuyển phiên sang PAYMENT_REQUESTED, ngừng món mới và có dialog xác nhận.
- Swagger, health checks, environment validation, tests với PostgreSQL/MinIO thật, QR decoding và browser E2E.

Đơn QR và đơn thủ công mới ở trạng thái **Chờ xác nhận**. Nhân viên xác nhận → bếp chế biến → món sẵn sàng → nhân viên phục vụ; các màn hình tự cập nhật qua Socket.IO và vẫn có nút Cập nhật REST. Yêu cầu thanh toán chưa ghi nhận tiền, đóng bàn hay mở lại phiên; các thao tác đó thuộc Phase 6. Chỉ đóng được phiên OPEN chưa có đơn; không xóa lịch sử để làm trống bàn. Báo cáo và triển khai production thuộc các phase sau.

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

`setup:env` sinh secrets ngẫu nhiên vào `.env` đã được gitignore. Với `.env` cũ, chỉ bổ sung cấu hình guest/S3 còn thiếu và giữ giá trị đã có. Đừng dùng nguyên marker trong `.env.example`. Nếu đổi PostgreSQL password khi volume đã có dữ liệu, phải đổi password trong DB tương ứng; environment của image chỉ tạo credentials lần đầu.

- Web: <http://localhost:3000/staff/login>
- Swagger: <http://localhost:4000/api/docs> (không bật trong production)
- Liveness: <http://localhost:4000/api/v1/health/live>
- Readiness kiểm tra PostgreSQL: <http://localhost:4000/api/v1/health/ready>
- MinIO console local: <http://localhost:9001> (credentials trong `.env`, chỉ dùng local)

Tài khoản demo: `owner@dineflow.local`, `manager@dineflow.local`, `waiter@dineflow.local`, `kitchen@dineflow.local`, `cashier@dineflow.local`. Tất cả dùng giá trị **SEED_DEMO_PASSWORD trong `.env` local**. Seed chạy lại không reset password, role hay dữ liệu đã chỉnh. Không chạy demo seed trong production.

Web gọi `/api/v1` qua Next rewrite để dùng cookie cùng origin. `APP_ORIGIN` phải khớp địa chỉ trình duyệt, không có trailing slash; `API_INTERNAL_URL` là địa chỉ backend mà Next truy cập. Khi đổi origin phải restart cả hai. Cookie trong production bắt buộc Secure và HTTPS.

Socket.IO dùng `/api/v1/realtime/socket.io` qua cùng Next rewrite, hỗ trợ WebSocket upgrade và HTTP polling dự phòng. Server/client đặt `addTrailingSlash: false` để tránh Next redirect handshake. Vé kết nối có hạn 60 giây, chỉ dùng một lần, không lưu storage. Reconnect lấy vé mới và refetch; không tự gửi lại mutation. Realtime hiện dùng một API instance, events best-effort; REST là dữ liệu gốc.

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

Integration tự tạo/migrate database riêng `dineflow_test` trên server cùng connection URL local. Tài khoản PG cần quyền tạo DB (Compose local đã có). Có thể truyền `TEST_DATABASE_URL`; tên DB bắt buộc kết thúc `_test`. Tests tạo fixtures riêng và cleanup đúng IDs/objects, không truncate DB dev. 50 tests về auth, RBAC, CSRF, refresh/replay/concurrency, DB constraints, setup, QR, MinIO, mở/đóng phiên, guest isolation, pricing/modifiers, snapshot, idempotency, staff/kitchen transitions, socket tickets/rooms/revocation/post-commit events và service requests. Storage phải chạy và có credentials hợp lệ. Chưa có API/test ghi nhận thanh toán.

Browser tests dùng DB dev đã seed và password local để kiểm tra dữ liệu thật. Dừng dev server rồi build trước; Playwright tự khởi động API/web nếu ports còn trống, hoặc dùng server đang chạy. 10 flows desktop/mobile kiểm tra auth/setup/QR, ordering/retry, đóng phiên rỗng, xác nhận → bếp → phục vụ, đơn thủ công/từ chối, stale request/RBAC, WebSocket qua Next, polling fallback, mất mạng/reconnect và dịch vụ tại bàn. Ordering, operations và realtime dùng restaurant/users ngẫu nhiên riêng, cleanup chỉ đúng tenant fixture; setup archive fixtures qua API và khôi phục settings. Screenshots/PDF QA lưu `.local/qa/`; traces/test-results được gitignore.

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
- [Phase 3 verification và hướng dẫn dùng](docs/phase-3-verification.md)
- [Phase 4 verification và hướng dẫn nhân viên/bếp](docs/phase-4-verification.md)
- [Phase 5 verification và hướng dẫn realtime/phục vụ](docs/phase-5-verification.md)
- [Stitch → Next.js](docs/design/implementation.md)
- [Stitch design system](docs/design/DESIGN.md)
- [Stitch project](https://stitch.withgoogle.com/projects/7484965213377838536)

HTML tham chiếu Stitch trong `docs/design/*.reference.html` chỉ để đối chiếu; không dùng scripts giả lập của chúng trong sản phẩm. IDs các màn hình được lưu ở `docs/stitch-project.json` để tiếp tục thiết kế trong cùng project.

## Giới hạn hiện tại

Chỉ xác minh local Windows, PostgreSQL/Redis/MinIO Compose và Chromium desktop/mobile. Chưa kiểm tra deployment, production Docker app images/S3, HTTPS thực tế, Safari/Firefox, máy in vật lý hay E2E toàn quy trình đến thanh toán. QR cố định không xác minh khách có mặt; đơn phải được nhân viên xác nhận trước bếp. Guest cookie mặc định 4 giờ, không khôi phục lịch sử nếu mất cookie hoặc hết hạn. Strict refresh replay policy có thể buộc nhân viên đăng nhập lại khi nhiều tab refresh cùng lúc. Throttler, socket tickets và connections hiện in-memory, chỉ phù hợp một API instance; chưa có Redis adapter, durable event outbox hay load test. Chưa có job dọn ảnh upload bỏ dở. Demo seed, Swagger và MinIO hiện tại chỉ dành cho development.
