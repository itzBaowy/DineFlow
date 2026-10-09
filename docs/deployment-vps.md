# Backend VPS và web Vercel

Web dự kiến: `https://dineflow.khuugiabao.com` (Vercel). API: `https://dineflow-api.khuugiabao.com` (VPS Docker). VPS đã có Caddy proxy API về `127.0.0.1:4001`; không thay cấu hình website khác. `compose.production.yaml` độc lập với Compose local, project `dineflow-prod` và volumes riêng.

## Kết quả triển khai 2026-10-10

API/PostgreSQL/MinIO đã chạy healthy trên VPS. Tám migrations đã áp dụng; không demo seed. Readiness công khai qua HTTPS trả `status: ok, database: up`; preflight cho đúng origin web và tenant headers. Kho ảnh private đã qua đọc/ghi/xóa bằng user ứng dụng, từ chối admin access và truy cập ẩn danh. Backup DB đã tạo và khôi phục thử thành công vào database riêng, sau đó xóa database thử.

Resend dùng `no-reply@dineflow.khuugiabao.com`, key chỉ có quyền gửi email, lưu trong `.env.production` mode 600 trên VPS. Yêu cầu gửi đến địa chỉ mô phỏng `delivered@resend.dev` được Resend chấp nhận HTTP 200; chưa kiểm tra hộp thư thật của chủ quán. File key tạm trên VPS đã xóa sau khi cập nhật cấu hình.

Admin `admin@khuugiabao.com` đã bootstrap, password ngẫu nhiên lưu riêng. Bản credentials cho chủ hệ thống nằm tại `.local/deploy/production-admin.txt` trên máy triển khai (gitignore); bản cấu hình gốc là `/opt/dineflow/app/.env.production` trên VPS. Đăng nhập production đã kiểm tra yêu cầu MFA enrollment và cookie HttpOnly/Secure/SameSite Strict; chủ hệ thống tự thiết lập Authenticator khi đăng nhập lần đầu.

19 unit/110 integration checks, lint/typecheck/build đã qua trước rollout; deployment suite 5 checks còn kiểm tra resource policy cho QR cùng site. Web build qua từ checkout sạch trên Linux với URL API production, đã sửa thiếu shared dist và loại dependency Prisma của browser tests khỏi Next build. Vercel build/deploy thực tế, DNS web và browser QA production còn chờ chủ hệ thống cấu hình/redeploy. HTTPS/API hoạt động chưa đồng nghĩa toàn bộ luồng web/email đã được kiểm chứng.

## Vercel

Trong Project Settings, chọn Root Directory `apps/web`, Framework Preset **Next.js**, Node.js **22.x** và bật **Include source files outside of the Root Directory in the Build Step** để truy cập `packages/shared`. Giữ Install Command tự động để Vercel nhận `pnpm-lock.yaml` và `packageManager` ở root. `apps/web/vercel.json` build shared trước web; không dùng lệnh `pnpm build` của toàn repo vì backend được deploy riêng trên VPS. Xem [Vercel monorepos](https://vercel.com/docs/monorepos/monorepo-faq).

Đặt environment variables trong môi trường Production và redeploy:

```dotenv
API_INTERNAL_URL=https://dineflow-api.khuugiabao.com
NEXT_PUBLIC_API_URL=https://dineflow-api.khuugiabao.com
ENABLE_EXPERIMENTAL_COREPACK=1
```

NEXT_PUBLIC_API_URL là URL công khai, không phải secret; được đóng vào bundle lúc build. Browser gọi REST/upload/download/QR và Socket.IO trực tiếp đến API. API_INTERNAL_URL giữ Next rewrite cho ảnh public và đường `/api/v1` tương thích. Không đưa DB/JWT/Resend/storage secrets vào Vercel.

Corepack chọn đúng pnpm 9.15.9 theo `packageManager`, tránh Vercel chọn pnpm 10 cho lockfile 9.0. Xem [Vercel package managers](https://vercel.com/docs/package-managers). Next build chỉ kiểm tra TypeScript của ứng dụng; browser tests có cấu hình riêng và vẫn được kiểm tra bằng `pnpm typecheck` sau khi generate Prisma ở workspace backend.

Cookie HttpOnly/Secure được API đặt theo host API; frontend cùng HTTPS site `khuugiabao.com`, fetch dùng credentials include. CSRF kiểm tra đúng APP_ORIGIN/custom header và từ chối cross-site. CORS chỉ cho web đã cấu hình, cho expected tenant header và expose scope mismatch. Cross-Origin-Resource-Policy dùng same-site để ảnh QR từ API tải được trên subdomain web; endpoint QR vẫn kiểm tra auth/quyền. Realtime nhận ticket một lần từ REST rồi kết nối trực tiếp, không dùng cookie ở socket. Preview domain khác không được cấp quyền production.

## Lần đầu trên VPS

```sh
cd /opt/dineflow
git clone https://github.com/itzBaowy/DineFlow.git app
cd app
docker run --rm -v "$PWD:/workspace" -w /workspace node:22-bookworm-slim node scripts/setup-production.mjs
chmod 600 .env.production
# Chuẩn bị database, kho ảnh và schema khi chưa có Resend:
docker compose --env-file .env.production -f compose.production.yaml build
docker compose --env-file .env.production -f compose.production.yaml up -d --wait postgres minio
docker compose --env-file .env.production -f compose.production.yaml run --rm storage-init
docker compose --env-file .env.production -f compose.production.yaml run --rm api-migrate
# Khi có Resend: chỉnh EMAIL_FROM/RESEND_API_KEY thật, email admin trong file riêng:
nano .env.production
docker compose --env-file .env.production -f compose.production.yaml up -d --build --wait api
docker compose --env-file .env.production -f compose.production.yaml --profile ops run --rm admin-bootstrap
```

Không chạy setup-env/demo seed local lên production. Generator sinh secrets mới và không ghi đè file đã có. `.env.production` được gitignore và loại khỏi Docker build; mặc định Resend key là marker bị env validation từ chối. Sender phải thuộc domain đã xác minh trên Resend. Password admin được sinh riêng, đọc từ file kín trên VPS; bootstrap chạy lại giữ tài khoản/mật khẩu đã có. Admin phải tự thiết lập Authenticator khi đăng nhập, không có demo users hoặc tenant seed.

Ở bước chuẩn bị chưa có Resend, API và admin-bootstrap chưa chạy. HTTPS proxy có thể trả 502 cho đến khi API được kích hoạt; migration/storage thành công chưa đồng nghĩa luồng đăng ký và email production đã hoạt động.

Chỉ API bind loopback cổng 4001; PostgreSQL và MinIO không publish cổng. Caddy host kết thúc TLS và proxy HTTP/WebSocket vào API. Có thể thêm block ở `docker/Caddyfile.production` nếu chưa cấu hình site, giữ các site đang có rồi chạy `caddy validate --config /etc/caddy/Caddyfile && systemctl reload caddy`. DNS A của API phải trỏ VPS; inbound TCP 80/443 phục vụ HTTPS. Tham chiếu [Caddy reverse proxy](https://caddyserver.com/docs/caddyfile/directives/reverse_proxy), [Vercel rewrites](https://vercel.com/docs/routing/rewrites).

TRUST_PROXY_HOPS=1 vì API chỉ nhận kết nối từ Caddy qua loopback; Caddy tạo X-Forwarded-For từ IP kết nối thực tế. Không mở cổng 4001 ra public hoặc tăng trust hops tùy ý. Gọi API trực tiếp từ browser giúp rate limit theo IP khách, thay vì gom mọi khách vào IP proxy Vercel.

MinIO init tạo bucket private trước khi API chạy, tạo user chỉ có quyền đọc/ghi/xóa trong bucket đó và kiểm tra credentials. API không dùng root storage credentials, S3_AUTO_CREATE_BUCKET=false. Migrations chạy trước API; dữ liệu trong volumes được giữ. Image API chạy user node/read-only, logs giới hạn 3 × 10 MB. Redis chưa được ứng dụng dùng nên không có trong stack production một instance này.

## Cập nhật và kiểm tra

```sh
cd /opt/dineflow/app
bash docker/backup-production.sh
git pull --ff-only
docker compose --env-file .env.production -f compose.production.yaml up -d --build --wait api
docker compose --env-file .env.production -f compose.production.yaml ps
docker compose --env-file .env.production -f compose.production.yaml logs --tail=100 api
curl -fsS https://dineflow-api.khuugiabao.com/api/v1/health/ready
```

Readiness kiểm tra PostgreSQL; không thay kiểm tra email delivery/storage. Swagger bị tắt trong production. Kiểm tra thêm signup/email, login/refresh/MFA, ảnh/QR và Socket.IO từ domain web sau khi Vercel redeploy.

Nếu dùng image build sẵn, load/tag đúng phiên bản code, chạy `up -d --wait api` không `--build`. DEPLOY_TAG cho phép giữ tag release để rollback API image. Chỉ rollback code khi tương thích schema; không tự đảo migration hoặc restore DB có dữ liệu mới. Tránh `down -v` hoặc xóa volumes.

## Dữ liệu và backup

`bash docker/backup-production.sh` tạo pg_dump custom format trong `.local/backups`, permission kín và không in credentials. Phải sao chép backup ra nơi khác, sao lưu kho ảnh MinIO và ACCOUNT_SECURITY_KEY/.env.production qua kênh kín. DB dump một mình không chứa object ảnh hoặc encryption key. Chưa có lịch backup tự động/offsite trong bộ triển khai này; kiểm tra khôi phục vào DB riêng trước khi dùng với dữ liệu thật.

API/MinIO hiện một instance; chưa có Redis adapter, distributed rate limiter, monitoring delivery và failover. Những việc đó thuộc phần vận hành tiếp theo của Phase 8. Dữ liệu local không được tự chuyển lên VPS; production bắt đầu trống.
