# Roadmap

| Phase | Chức năng chạy được | Kiểm chứng chính |
|---|---|---|
| 1 — Foundation | Workspace, DB/migration/seed, Docker, env, auth, RBAC, dashboard cấu hình thật | lint/typecheck/build; HTTP integration auth, refresh replay/concurrency, RBAC, DB constraints; browser login |
| 2 — Setup | Restaurant, menu/category/modifier, tables/QR, S3 upload | scope, validation, archive, mã QR cũ bị vô hiệu |
| 3 — Ordering | Guest admission, mở bàn, menu/cart/checkout, nhiều đơn/phiên | pricing/modifiers, snapshot, idempotency, đồng thời đóng/đặt |
| 4 — Staff/Kitchen | Confirm/reject, kitchen board, served, manual order | policy trạng thái/role, concurrent transitions |
| 5 — Realtime | Socket auth/rooms, tracking, requests, reconnect | room isolation, post-commit events, REST refetch |
| 6 — Billing | Aggregate, discount, cash/manual transfer, close, receipt | số tiền, pending items, double pay/close, transaction |
| 7 — Admin/Analytics | Revenue, daily/monthly, best-sellers, order history, audit, staff | chỉ revenue COMPLETED, timezone, filters/scope |
| 8 — Production | E2E toàn quy trình, logs, hardening, image builds, CI/CD/deploy | QR → order → confirm → cook → serve → pay → close |

SaaS foundation, SaaS 2 và SaaS 3 đã có: free owner signup, platform console/lifecycle, Owner tạo nhiều nhà hàng bằng cùng tài khoản, chọn/chuyển membership an toàn, xác minh email, reset/đổi mật khẩu và MFA admin. 19 unit/105 integration checks, API Docker và production build qua; browser hồi quy 18/18 trên FE do người dùng mở. Xem [SaaS](saas.md), [Multi-restaurant verification](tenancy-verification.md) và [bảo mật tài khoản/Resend](security.md).

Sau mỗi phase chạy lint, typecheck, tests và build; ghi rõ kết quả đã chạy và giới hạn. Không dùng UI mẫu để đánh dấu chức năng đã hoàn thành. Chưa triển khai E2E ordering trong Phase 1 vì các endpoint đó chưa tồn tại.

Trạng thái: Phase 1–7, SaaS foundation/SaaS 2/SaaS 3 đã triển khai local. Runner browser dùng API Docker và FE do người dùng mở, chia 3 specs/batch để giữ throttler thật. Xem [Phase 7 verification](phase-7-verification.md) cho lịch sử và [bảo mật tài khoản](security.md) cho kết quả hiện tại. Phase 8 đã có bộ triển khai Docker production, secrets riêng, storage permissions, giới hạn logs, migration và script backup DB; API hỗ trợ trusted proxy và web Vercel gọi API trực tiếp. Tổng hiện tại 19 unit/110 integration checks qua, gồm CORS, CSRF sibling origin, proxy rate limiting và realtime polling. Frontend production build qua từ checkout sạch trên Linux, không phụ thuộc Prisma backend. API/PostgreSQL/MinIO production đã healthy trên VPS, HTTPS readiness qua, admin đã bootstrap và Resend thật chấp nhận yêu cầu gửi mô phỏng; backup DB đã thử restore. Vercel/domain web và browser QA production còn chờ. Xem [triển khai VPS/Vercel](deployment-vps.md).

Giai đoạn tiếp theo: hoàn tất domain web/Resend và kiểm tra các luồng production; bổ sung backup ảnh/offsite và lịch backup, logging/monitoring/CI/CD, rate limit tập trung và cảnh báo email failures. Chưa có thu phí, subscription hoặc nhóm chi nhánh.
