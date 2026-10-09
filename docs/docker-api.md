# API trong Docker, web chạy bằng terminal

API NestJS có image riêng, cùng network Compose với PostgreSQL, Redis, MinIO và Mailpit local. Web chạy trên máy qua Next rewrite đến `API_INTERNAL_URL=http://localhost:4000`. Compose không có service web.

## Chạy lần đầu

```powershell
pnpm install --frozen-lockfile
pnpm setup:env
pnpm api:up
pnpm db:generate
pnpm db:seed
# Bạn chạy web trong terminal của mình:
pnpm dev:web
```

`api:up` build hai target từ `docker/api.Dockerfile`, khởi động các dependencies và chờ API healthy. `api-migrate` chạy `prisma migrate deploy` trước khi API được khởi động; không tự seed. Với dữ liệu dev hiện có, không cần chạy seed lại. PostgreSQL/Redis/MinIO giữ nguyên named volumes; Mailpit chứa email thử nghiệm và không có volume dữ liệu.

`pnpm dev` và `pnpm dev:web` chỉ chạy shared watcher + web. Nếu chủ động phát triển API trên host, dừng container bằng `pnpm api:stop` rồi chạy `pnpm dev:api` ở terminal riêng để tránh trùng cổng.

## Cập nhật API và vận hành local

```powershell
pnpm api:up       # rebuild từ source, migrate, chờ healthy
pnpm api:logs     # theo dõi log, Ctrl+C chỉ dừng theo dõi
pnpm api:migrate  # chạy lại migration khi cần, không seed
pnpm api:stop     # chỉ dừng API
pnpm infra:down   # dừng toàn bộ Compose, giữ volumes
```

Web dev nhận thay đổi frontend trực tiếp. Thay đổi API cần chạy lại `pnpm api:up`; image không mount source hay chạy watcher. Sau khi đổi `.env`, tạo lại API bằng `api:up` và tự khởi động lại web nếu origin/rewrite đổi.

- Web: <http://localhost:3000/staff/login>
- Swagger local: <http://localhost:4000/api/docs>
- Readiness (có kiểm tra DB): <http://localhost:4000/api/v1/health/ready>
- MinIO console: <http://localhost:9001>
- Email thử nghiệm Mailpit: <http://localhost:8025> (SMTP localhost:1025)

## Image và cấu hình

Build dùng Node 22 Debian slim, OpenSSL, pnpm 9.15.9 và frozen lockfile. Prisma Client được generate trong Linux image, không copy generated client/node_modules của Windows. `pnpm deploy --prod` tạo runtime độc lập với dependencies production và shared đã compile; TypeScript/Prisma CLI và integration tests không nằm trong runtime. Image migration dùng target build riêng có Prisma CLI.

API và migration chạy user `node` (UID 1000). API filesystem read-only, có `/tmp` tạm, bỏ capabilities và có init process. Health check gọi readiness qua Node fetch. `.dockerignore` loại `.env`, `.git`, `.local`, `.stitch`, dependencies và output trên host; secrets chỉ được truyền qua environment lúc chạy. Build generate dùng URL giả, không kết nối DB.

`.env` trên host vẫn dùng `DATABASE_URL` trỏ localhost cho Prisma CLI/integration. Entrypoint Docker chỉ đổi hostname/port thành `postgres:5432`, giữ nguyên credentials được URL-encode, database và query options. `DOCKER_S3_ENDPOINT` mặc định `http://minio:9000`; `S3_ENDPOINT=http://localhost:9000` tiếp tục phục vụ các lệnh trên host. Docker SMTP_HOST dùng DOCKER_SMTP_HOST mặc định mailpit; host CLI/tests vẫn dùng SMTP_HOST=localhost. API chờ Mailpit healthy trong cấu hình local. Resend dùng EMAIL_PROVIDER=resend, RESEND_API_KEY và EMAIL_FROM đã xác minh; xem [bảo mật tài khoản](security.md). Redis chưa được ứng dụng dùng làm cache/queue; email worker dùng PostgreSQL outbox.

Local mặc định `NODE_ENV=development`, HTTP origin và cookie không Secure theo `.env` hiện có. Việc đóng gói này chưa thay thế cấu hình deployment HTTPS, private registry, backup, monitoring hay CI/CD của Phase 8. Production vẫn bị env validation bắt buộc HTTPS/Secure cookie và bucket đã provision, `S3_AUTO_CREATE_BUCKET=false`.

Tham chiếu: [Compose startup dependencies](https://docs.docker.com/compose/how-tos/startup-order/), [Prisma migrate deploy](https://docs.prisma.io/docs/cli/v7/migrate/deploy). `service_completed_successfully` chặn API nếu migration thất bại; `service_healthy` chờ dependencies thực sự sẵn sàng.

## Kiểm chứng ngày 09/10/2026

- Build hai image thành công; API healthy, migration exit 0; PostgreSQL/Redis/MinIO healthy.
- Runtime Node 22.23.3, UID 1000, image runtime khoảng 185 MB (giá trị quan sát lần build này).
- HTTP smoke trực tiếp container: readiness, owner login/auth me, revenue, order history, activity, staff đều thành công.
- Socket.IO WebSocket với vé staff một lần kết nối thành công.
- Upload PNG → sharp trong Linux container → WebP → lưu/đọc MinIO thành công; cleanup đúng media/object fixture, logout phiên kiểm thử.
- `pnpm test:docker`: 3/3 kiểm tra routing URL, giữ nguyên encoded credentials/query và lỗi không lộ secret.
- Không khởi động web trong lần kiểm chứng Docker; browser E2E cần web do người dùng chạy.
