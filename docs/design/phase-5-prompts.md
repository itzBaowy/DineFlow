# Phase 5 — Guest tracking & table service

Generated through Stitch MCP on 2026-10-09 in the existing project `7484965213377838536`, with design system `assets/23ff43d04b194e6c8c13fab28e1e0fc8`.

Screen: `b0793d21de1449b08830a8ea7f84966c` — DineFlow - Theo dõi đơn hàng & Dịch vụ Bàn 05. HTML: `guest-tracking.reference.html`.

## Generation prompt

DineFlow mobile guest order tracking and table service, Vietnamese content, continue the existing project design system.
**PLATFORM:** Responsive web, mobile-first, one-handed operation.
**PAGE STRUCTURE:**
1. **Header:** Compact restaurant Bếp Nhà, Bàn 05, back-to-menu link, clear live connection badge "Đang đồng bộ". Show degraded connection variant "Mất kết nối · Cập nhật thủ công" with Refresh button; never show connected if not connected.
2. **Hero:** "Bữa ngon đang đến." subtitle "Theo dõi các đơn bạn đã gọi trong lượt phục vụ này." No invented estimated cook time.
3. **Primary content:** Own order #1024 card, current "Đang chế biến", chronological progress steps Chờ xác nhận / Đã nhận / Đang chế biến / Sẵn sàng / Đã phục vụ. Include only committed timestamps on completed steps. Quantity, immutable dish modifiers and note, total meal amount. Another cancelled order example displays a required rejection reason. No other diners' orders, private staff identity or payments.
4. **Table service:** Two large touch actions "Gọi nhân viên", "Yêu cầu thanh toán". Active request card type, created time, statuses Chờ phản hồi / Nhân viên đã tiếp nhận / Đã xử lý. Explain payment request "Nhân viên sẽ đến hỗ trợ. Bàn tạm ngừng nhận món mới; yêu cầu này chưa ghi nhận thanh toán." Repeat tap is disabled while a same-type request remains pending/acknowledged. Confirmation dialog before requesting payment, visible failure and retry state.
5. **Footer:** "Gọi thêm món" enabled only when the table accepts new orders. Respect safe-area. Separate service cards remain readable at 320px. Do not add a notification bell, ratings, fake totals, online payment gateways, split bills or refunds.
Generate guest tracking screen.

## Adaptation

Giữ bảng tiến độ, các nút phục vụ lớn và palette pine/ivory/chartreuse. Dữ liệu đơn, bàn, timestamps, request status và connection state lấy từ API/Socket.IO thật. Tiến độ chỉ hiển thị các mốc đã commit; không dùng ETA, tổng bill, tên nhân viên hay số đơn mẫu của Stitch. Khách chỉ thấy đơn của token hiện tại. Dialog xác nhận thanh toán, trạng thái mất kết nối và request đã xử lý được triển khai bằng React/Radix/TanStack Query; không chạy scripts trong HTML tham chiếu.
