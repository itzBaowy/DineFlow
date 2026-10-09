# SaaS 3 — bảo mật tài khoản

## Sử dụng

Owner mới đăng ký ở `/register`, mở email và bấm **Xác nhận email** trước khi đăng nhập. Link xác minh có hạn 24 giờ; có thể yêu cầu gửi lại ở `/verify-email`. User đã tồn tại trước migration và nhân viên do Owner/Manager tạo tiếp tục đăng nhập được, vẫn có thể xác minh email từ **Bảo mật tài khoản**.

Quên mật khẩu: mở `/forgot-password`, nhập email và kiểm tra hộp thư. Phản hồi giống nhau với email tồn tại hoặc không tồn tại. Link đặt lại có hạn 30 phút, chỉ dùng một lần; link mới vô hiệu link cũ cùng loại. `/staff/security` và `/platform/security` cho tự đổi mật khẩu bằng mật khẩu hiện tại; mật khẩu mới tối thiểu 12, tối đa 128 ký tự.

Đổi hoặc đặt lại mật khẩu thu hồi mọi AuthSession/PlatformSession của user ở mọi nhà hàng, vô hiệu link và MFA challenge còn lại, tăng credentialVersion. MFA đã thiết lập vẫn được giữ khi reset mật khẩu qua email. Quản lý đặt lại mật khẩu nhân viên cũng vô hiệu link cũ; không được sửa password chung của user tham gia nhiều nhà hàng.

Admin nhập email/mật khẩu ở `/platform/login`, sau đó thiết lập ứng dụng Authenticator lần đầu bằng QR/khóa hoặc nhập mã TOTP sáu chữ số nếu đã thiết lập. Không được vào console khi chỉ hoàn tất mật khẩu. Challenge có hạn năm phút, tối đa năm lần nhập sai; mã đã dùng không được dùng lại, kể cả ở challenge khác. Platform session sau MFA có hạn tuyệt đối tám giờ. Admin local hiện có sẽ tự thiết lập Authenticator khi đăng nhập; tests sử dụng admin riêng và không đăng ký MFA thay cho admin thật.

## Email local và Resend production

```powershell
pnpm setup:env
pnpm api:up
# Bạn chạy frontend trong terminal riêng:
pnpm dev:web
```

`setup:env` bổ sung ACCOUNT_SECURITY_KEY ngẫu nhiên 32 bytes (64 ký tự hex), SMTP và EMAIL_FROM/EMAIL_PROVIDER còn thiếu, không thay credentials hiện có. API Docker mặc định gửi SMTP đến Mailpit; xem email tại <http://localhost:8025>. Host integration dùng SMTP localhost:1025. Cả hai cổng chỉ bind localhost. Mailpit là hộp thư thử nghiệm, không chuyển email ra ngoài và không lưu thư bền vững qua recreate container.

Production dùng Resend theo lựa chọn của chủ dự án. Cấu hình secrets trong môi trường deployment, không commit `.env`:

```dotenv
NODE_ENV=production
APP_ORIGIN=https://app.your-domain.example
COOKIE_SECURE=true
EMAIL_PROVIDER=resend
RESEND_API_KEY=<your-secret-api-key>
EMAIL_FROM=no-reply@your-verified-domain.example
ACCOUNT_SECURITY_KEY=<persisted-random-64-character-hex-key>
S3_AUTO_CREATE_BUCKET=false
```

Thay origin/sender bằng domain thật; cấu hình DNS/xác minh sender trong Resend. API gọi endpoint gửi email bằng Bearer API key, dùng UUID outbox làm Idempotency-Key cho mọi lần retry của cùng email. Cấu hình thiếu key/sender hoặc production HTTP/cookie không Secure bị từ chối khi startup. SMTP đã xác thực có thể dùng làm lựa chọn thay thế; production buộc TLS. Xem [Resend Send Email](https://resend.com/docs/api-reference/emails/send-email).

Lưu và backup ACCOUNT_SECURITY_KEY cùng quy trình quản lý secrets: thay khóa trực tiếp sẽ khiến TOTP/email pending cũ không giải mã được. API cần rebuild/recreate bằng `pnpm api:up` sau khi đổi `.env`. Chưa cung cấp Resend key/domain thật trong phiên triển khai này, nên chưa kiểm chứng gửi thư production qua Resend; local SMTP đã gửi thật và Resend HTTP/retry được kiểm tra bằng mock.

## Khôi phục MFA bởi operator

Không có HTTP endpoint bỏ qua MFA. Operator có quyền chạy CLI trên hạ tầng, biết **mật khẩu admin hiện tại**, nhập email và lý do tối thiểu 10 ký tự. CLI thu hồi mọi phiên/link/challenge, xóa MFA cũ, ghi PlatformAudit kèm lý do và SecurityEvent; đăng nhập kế tiếp bắt buộc thiết lập Authenticator mới.

Ví dụ PowerShell đọc password kín, không đưa vào command history:

```powershell
$env:PLATFORM_RECOVERY_EMAIL = 'admin@your-domain.example'
$env:PLATFORM_RECOVERY_REASON = 'Mất thiết bị Authenticator; đã xác minh quản trị viên'
$recoveryPassword = Read-Host 'Mật khẩu admin hiện tại' -AsSecureString
$recoveryCredential = [System.Net.NetworkCredential]::new('', $recoveryPassword)
try {
  $env:PLATFORM_RECOVERY_PASSWORD = $recoveryCredential.Password
  pnpm platform:mfa-recovery
} finally {
  Remove-Item Env:PLATFORM_RECOVERY_PASSWORD -ErrorAction SilentlyContinue
  Remove-Item Env:PLATFORM_RECOVERY_EMAIL -ErrorAction SilentlyContinue
  Remove-Item Env:PLATFORM_RECOVERY_REASON -ErrorAction SilentlyContinue
  $recoveryCredential = $null
  $recoveryPassword.Dispose()
}
```

Chạy trên host có DB URL/operator secrets đúng deployment và cùng code/schema. Không dùng PLATFORM_ADMIN_PASSWORD bootstrap nếu đã đổi password. CLI không in credentials/secret; không chạy lên admin thật trong kiểm thử.

## API và giới hạn

Prefix `/api/v1`, POST public vẫn qua CSRF/custom header và strict DTO:

| Endpoint | Quyền / giới hạn |
|---|---|
| `POST /auth/request-verification` | Public, 5/IP/giờ, cooldown user 60 giây |
| `POST /auth/verify-email` | Token xác minh, 20/IP/phút |
| `POST /auth/forgot-password` | Public, 5/IP/giờ, cooldown user 60 giây |
| `POST /auth/reset-password` | Token reset, 10/IP/phút |
| `GET /auth/security` | Staff hiện tại, chỉ email/trạng thái |
| `POST /auth/change-password` | Staff hiện tại + mật khẩu cũ, 5/IP/phút |
| `POST /platform/auth/login` | Password admin, 5/email+IP/phút; trả challenge giới hạn |
| `GET /platform/auth/mfa/setup` | Challenge setup hợp lệ, trả secret/URI/QR no-store |
| `POST /platform/auth/mfa/verify` | Challenge + code, 10/IP/phút; tối đa 5 lỗi/challenge |
| `GET /platform/security` | Platform session qua MFA |
| `POST /platform/change-password` | Platform session qua MFA + mật khẩu cũ, 5/IP/phút |

Email token ngẫu nhiên 32 bytes, hash SHA-256 trong DB. Payload outbox và TOTP secret mã hóa AES-256-GCM với context theo user. Worker claim/lease và retry tối đa năm lần trước khi link hết hạn; email gửi xong xóa ciphertext payload. Không ghi recipient/token/password/secret/provider body vào log. SecurityEvent chỉ lưu user/action/thời gian; PlatformAudit giữ các thao tác console và lý do phục hồi MFA.

API đang dùng throttler trong bộ nhớ từng instance và worker poll PostgreSQL. Triển khai nhiều instance cần rate limit tập trung, retention/cleanup và monitoring delivery failures. Chưa có recovery codes tự dùng, passkey, đổi email hoặc MFA cho mọi nhân viên; mất thiết bị admin xử lý bằng CLI trên. HTTPS, backup, monitoring và CI/CD thuộc Phase 8.

## Kiểm chứng ngày 09/10/2026

- Lint/typecheck toàn monorepo, shared/API/Next production build đều qua; unit 19/19 và Docker routing 3/3.
- Integration 105/105 trên PostgreSQL test riêng; SaaS 3 thêm 11 checks gồm registration/email thật, generic responses/cooldown/CSRF/DTO, token expiry/kind/single-use/concurrency, revocation across tenants, MFA setup/limited permissions/replay/attempts/expiry/role changes, admin password, CLI recovery và Resend retry/idempotency bằng mock.
- Browser 18/18 trên Chromium với FE do người dùng tự chạy và API Docker; bốn batches, giữ rate limiter thật. SaaS signup nhận email Mailpit → xác minh → login; admin test riêng setup MFA → console → suspend/resume. Hai flows mới kiểm tra self-service password, reset bằng email thật, link đã dùng và mở lại link trên cùng trang; admin password revokes session và login lại tiếp tục yêu cầu MFA. Responsive 390/320px không tràn ngang, không có pageerror.
- Đã xem Stitch reference và screenshots thật `.local/qa/security-desktop.png`, `security-mobile.png`, `platform-mfa-mobile.png`. Screenshot/trace fixtures giữ local, không commit credentials.
- Docker build/runtime/migration thành công; API/PostgreSQL/Redis/MinIO/Mailpit healthy. Dev/test schema đã áp dụng migration 008. Read-only kiểm tra sau QA: một admin thật, chưa có secret MFA; không còn admin security fixture. Không chạy web hoặc đăng ký Authenticator thay user.
- Chưa gửi thư qua Resend production do chưa có API key/sender xác minh. Chưa kiểm tra HTTPS deployment, Safari/Firefox, khôi phục backup hoặc vận hành nhiều instance.
