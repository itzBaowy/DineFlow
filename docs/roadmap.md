# Roadmap

| Phase | Chức năng chạy được | Kiểm chứng chính |
|---|---|---|
| 1 — Foundation | Workspace, DB/migration/seed, Docker, env, auth, RBAC, dashboard cấu hình thật | lint/typecheck/build; HTTP integration auth, refresh replay/concurrency, RBAC, DB constraints; browser login |
| 2 — Setup | Restaurant, menu/category/modifier, tables/QR, S3 upload | scope, validation, archive, mã QR cũ bị vô hiệu |
| 3 — Ordering | Guest admission, mở bàn, menu/cart/checkout, nhiều đơn/phiên | pricing/modifiers, snapshot, idempotency, đồng thời đóng/đặt |
| 4 — Staff/Kitchen | Confirm/reject, kitchen board, served, manual order | policy trạng thái/role, concurrent transitions |
| 5 — Realtime | Socket auth/rooms, tracking, requests, reconnect | room isolation, post-commit events, REST refetch |
| 6 — Billing | Aggregate, discount, cash/manual transfer, close, receipt | số tiền, pending items, double pay/close, transaction |
| 7 — Admin/Analytics | Revenue, daily/monthly, best-sellers, audit | chỉ revenue COMPLETED, timezone, filters/scope |
| 8 — Production | E2E toàn quy trình, logs, hardening, image builds, CI/CD/deploy | QR → order → confirm → cook → serve → pay → close |

Sau mỗi phase chạy lint, typecheck, tests và build; ghi rõ kết quả đã chạy và giới hạn. Không dùng UI mẫu để đánh dấu chức năng đã hoàn thành. Chưa triển khai E2E ordering trong Phase 1 vì các endpoint đó chưa tồn tại.

Trạng thái: Phase 1 và Phase 2 đã kiểm chứng local. Xem [Phase 2 verification](phase-2-verification.md). Giai đoạn kế tiếp là Phase 3 — Customer Ordering; không triển khai bếp/realtime/thanh toán trước khi có luồng phiên bàn và đơn hàng hợp lệ.
