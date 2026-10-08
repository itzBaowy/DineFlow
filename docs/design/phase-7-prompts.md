# Phase 7 — Admin & Analytics

Project `7484965213377838536`, design system `assets/23ff43d04b194e6c8c13fab28e1e0fc8`, screen `b352c7f92d5e45ce92c795188410b3e2`.

## Prompt

Design DineFlow's Vietnamese restaurant owner analytics workspace. This page turns verified completed payments into understandable daily and monthly reports, with clear drill-down to historical orders and staff activity. Use only layout and content direction, reusing the project's existing design system.

**PLATFORM:** Web, desktop-first; responsive sidebar drawer and vertically stacked panels on mobile.

**PAGE STRUCTURE:**
1. **Navigation:** Existing DineFlow staff sidebar; active Báo cáo. Links Tổng quan, Phiên bàn, Đơn gọi món, Thu ngân, Thực đơn, Nhân viên, Lịch sử đơn, Nhật ký hoạt động, Thông tin nhà hàng. Keep main content clear of sidebar.
2. **Header:** Breadcrumb Quản trị / Báo cáo. Headline "Hiểu nhịp quán, rõ từng ngày." Explain numbers include completed payments only. Date range inputs, daily/monthly grouping selector, payment method filter (Tất cả / Tiền mặt / Chuyển khoản), Apply and Refresh. Show restaurant timezone and inclusive selected dates.
3. **Metrics:** Four restrained cards: Tiền đã thu (VND), Hóa đơn đã thanh toán, Giá trị trung bình, Tiền món trước giảm giá. Supporting breakdown row for discount, service charge and tax. No fictional growth percentages, targets, visitors, profit, forecasting, payroll, exports or compare actions.
4. **Analytics:** Wide bar chart with textual labels "Tiền đã thu theo ngày" or month; accessible table directly beneath with date/month, payment count, gross item subtotal, discount, fee, tax, collected total. Data-free dates explicitly show zero. Beside chart a compact split of cash and manually confirmed bank transfer; emphasize actual collected amount, not QR shown.
5. **Best sellers:** Ranked item rows with historical item names, units, line amount before bill-level discount/fees/tax, count of settled orders. Exclude cancelled and unpaid orders. Archive/name changes do not rewrite historical names. Include a clear no-data state instead of fake sample records.
6. **Related admin:** Two compact navigation panels: "Lịch sử đơn" filters all session states, details include immutable item snapshots and links to stored receipt; "Nhật ký hoạt động" read-only audit with actor, action and time, paginated; staff management allows scoped roles and disabling access without deleting history.
7. **Feedback:** Skeleton loading, empty selected period, server error/retry, readable form validation and responsive tables with local horizontal scrolling if needed. Keyboard focus and labeled native controls. No fake notifications or invented operational metrics.
Structure the report so useful facts and sources are readable before the visual chart. All visible product labels in Vietnamese.

## Adaptation

Use API-sourced completed payments, local date filters, an accessible numeric table alongside the chart, immutable order item names, read-only scoped audit and staff management. Replace invented VietQR reconciliation/FOH/BOH/shift claims with actual manually verified bank transfer and current API permissions. No generated amounts appear in the product. Stitch suggestions: historical order details, activity audit and mobile report; all belong to this phase.
