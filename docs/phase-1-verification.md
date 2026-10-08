# Phase 1 — kết quả kiểm chứng

Kiểm chứng local ngày 08/10/2026, Windows/Node22.19/pnpm9.15.9; PostgreSQL17 và Redis7 chạy qua Docker Compose.

| Kiểm tra | Kết quả |
|---|---|
| pnpm install | Thành công, lockfile đã có |
| Prisma generate + migrate deploy | Thành công, 2 migrations đã áp dụng |
| Seed | Thành công: 1 restaurant, 10 tables, 5 categories, 20 items, 4 modifier options, 5 roles |
| pnpm lint | Thành công |
| pnpm typecheck | Thành công |
| pnpm test | 6 unit/domain tests passed |
| pnpm test:integration | 11 scenarios + parent, 12 tests passed với PostgreSQL thật |
| pnpm build | Shared/API/Web build thành công |
| pnpm test:browser | 2 flows Chromium desktop1440/mobile390 passed |
| Stitch MCP | Create/get project, generate/list/get screens, project design system, download HTML + screenshot hoạt động |

Browser flow kiểm tra redirect chưa login, validation, password visibility, login thật, dữ liệu DB, settings owner, refresh cookie khi access bị xóa, logout, waiter không được xem settings, drawer mobile và không overflow ngang. Dashboard/settings/login screenshots được xem trực tiếp sau khi render. Lỗi test selector nhầm Next route announcer đã được sửa; không phải lỗi authentication sản phẩm.

Ảnh QA local ở `.local/qa/`: login-desktop, login-mobile, dashboard-desktop, dashboard-mobile, settings-desktop. HTML Stitch lưu trong docs/design chỉ là reference; scripts mô phỏng trong đó không được dùng trong web runtime.

Chưa kiểm chứng production HTTPS/deployment, Docker images cho web/api, MinIO profile, Safari/Firefox hay full ordering E2E. Chưa triển khai Phase 2–8. DB constraints cho active session/payment được kiểm thử trực tiếp ở DB; **không có nghĩa API mở bàn/thanh toán đã hoàn thành**.
