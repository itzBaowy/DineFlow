# Phase 6 — Cashier & receipts

Stitch MCP generated screen `1ea9154da32d4af09ba92db2aaca0b61` — DineFlow - Không gian Thu ngân & Thanh toán Bàn 05 on 2026-10-09, in project `7484965213377838536`, using design system `assets/23ff43d04b194e6c8c13fab28e1e0fc8`. HTML: `cashier.reference.html`.

## Prompt

DineFlow Vietnamese cashier workspace for reviewing a whole dining-session bill and recording one full payment. Continue the existing project design system.
**PLATFORM:** Responsive web, desktop/tablet-first, legible one-column mobile at 320px.
**PAGE STRUCTURE:**
1. **Navigation/Header:** Existing staff sidebar and compact restaurant header, "Thu ngân" active. Real connection badge with manual refresh fallback.
2. **Hero:** "Trọn bữa ngon, gọn thanh toán." Supporting text "Kiểm tra tất cả đơn trong lượt phục vụ trước khi xác nhận đã nhận tiền." No invented revenue or shift metrics.
3. **Session selector:** Cards for active tables, status "Đang phục vụ" or "Chờ thanh toán", opened time, number of valid orders. Select "Bàn 05", keep an obvious link back to table service.
4. **Bill review:** Order groups with snapshot names, quantity, modifiers and prices. Include cancelled order marked "Đã hủy · Không tính tiền". Distinguish unserved order blockers; payment disabled until all non-cancelled orders are served. Clear subtotal, discount in VND plus reason, configured service charge percentage, configured tax percentage and bold final amount. Show permission limit for cashier discounts. No customer names or private staff information.
5. **Payment panel:** Segmented radio "Tiền mặt" / "Chuyển khoản". Collected amount must equal final bill; bank transfer requires transaction reference and explicit manual received-money confirmation. Checkbox "Tôi đã kiểm tra và nhận đủ tiền". Review dialog summarizes table, amount and method before a deliberate "Xác nhận thanh toán & đóng phiên". No QR/payment gateway, partial payment, refunds or automatic bank verification.
6. **Additional actions:** Request payment to stop new orders; reopen before payment only for authorized staff, with required reason. Bill changed/conflict/error state asks to refresh and review, never retries payment automatically.
7. **Success / receipt:** "Đã ghi nhận thanh toán", immutable receipt breakdown and paid time, "In biên nhận", table "Cần dọn". Explain print is a restaurant receipt, not tax invoice. Print layout hides navigation/buttons.
Generate the main cashier bill review screen.

## Adaptation

Giữ split view của hóa đơn và bảng ghi nhận tiền, xếp thành một cột trên mobile. Bàn, đơn/modifiers, giảm giá, phí/thuế, totals và biên nhận lấy từ API; trạng thái kết nối dùng Socket.IO thật. Không đưa ca thu ngân, FOH/BOH, hội viên hay hạn mức/giá mẫu từ Stitch vào sản phẩm. Hạn mức lấy theo cấu hình nhà hàng và role backend.

Các đề xuất dialog đối soát, biên nhận in và cảnh báo món chưa phục vụ đã được chuyển thành React/Radix với validation và dữ liệu thật. Lịch sử ca/report thuộc Phase 7; Phase 6 chỉ có 20 biên nhận gần nhất để truy cập giao dịch vừa ghi nhận. HTML tham chiếu không được chạy trong ứng dụng.
