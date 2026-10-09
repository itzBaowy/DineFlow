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

SaaS foundation và SaaS 2 đã có: free owner signup, platform console/lifecycle, Owner tạo nhiều nhà hàng bằng cùng tài khoản, đăng nhập chọn membership và chuyển tenant an toàn. 17 unit/94 integration checks, API Docker và production build qua; browser hồi quy 16/16 trên FE do người dùng mở. Xem [SaaS](saas.md) và [Multi-restaurant verification](tenancy-verification.md).

Sau mỗi phase chạy lint, typecheck, tests và build; ghi rõ kết quả đã chạy và giới hạn. Không dùng UI mẫu để đánh dấu chức năng đã hoàn thành. Chưa triển khai E2E ordering trong Phase 1 vì các endpoint đó chưa tồn tại.

Trạng thái: Phase 1–7, SaaS foundation và SaaS 2 đã triển khai local. Runner browser dùng API Docker và FE do người dùng mở, chia 3 specs/batch để giữ throttler thật. Xem [Phase 7 verification](phase-7-verification.md) cho lịch sử và [Multi-restaurant verification](tenancy-verification.md) cho kết quả hiện tại. Phase 8 vẫn cần logging/monitoring, backup, hardening, HTTPS, CI/CD và deployment; chưa triển khai production.

SaaS giai đoạn tiếp theo đề xuất: xác minh email, self-service quên mật khẩu và bảo vệ admin; tiếp theo production HTTPS/backup/monitoring/CI/CD. Chưa có thu phí, subscription hoặc nhóm chi nhánh.
