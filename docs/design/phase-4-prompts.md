# Phase 4 — Staff & Kitchen

Project `7484965213377838536`; design system `assets/23ff43d04b194e6c8c13fab28e1e0fc8`; kitchen screen `96f3d4aaf5e74015a308dedc69373712`. Generated once on 2026-10-09 using Stitch MCP and the generate-design skill.

## Prompt

DineFlow restaurant kitchen display for Vietnamese staff. Continue the existing project design system. Use actual operational content, no invented realtime/online claims.
**PLATFORM:** Responsive web, desktop/tablet-first, usable mobile.
**PAGE STRUCTURE:**
1. **Navigation:** Existing workspace sidebar DineFlow; Tổng quan, Phiên bàn, Đơn gọi món, Màn hình bếp (active). Header Bếp Nhà and staff role Nhà bếp.
2. **Header:** "Giữ nhịp bếp, trọn vị ngon." short subtitle "Các đơn đã được xác nhận, sẵn sàng chế biến." primary "Cập nhật" refresh action with last refreshed time. Compact queue counts for Chờ chế biến, Đang chế biến, Sẵn sàng.
3. **Primary Content:** Three-column Kanban kitchen board. Columns Chờ chế biến (ACCEPTED), Đang chế biến (PREPARING), Sẵn sàng (READY). Legible large order ticket cards with Bàn 05 · Đơn #1024, received/accepted time and elapsed waiting minutes, quantity × dish, required size/topping, clearly emphasized customer note "Ít đá, không hành". Example tickets include 2 Cơm chiên hải sản, 1 Trà sữa (Size L, Trân châu), Gỏi cuốn. Cards sorted oldest first. A long waiting ticket visually flagged with text "Chờ lâu" plus icon, not color alone. First column CTA "Bắt đầu chế biến", second "Món đã sẵn sàng", third static "Chờ nhân viên phục vụ" with no serve button for kitchen role. Every action at least 44px high, large readable text for busy kitchen tablet. No menu photos needed.
4. **States:** Thoughtful empty column, skeleton fetching, error and retry banner. Separate staff order confirmation page can reuse card language with Confirm/Reject and reason dialog; no payment controls or fabricated statistics. Re-fetch through REST and explicit refresh; live Socket.IO will be implemented later.
Generate the kitchen display screen.

## Implementation decisions

Use the three-column kitchen tickets, large actions, waiting-time labels and prominent modifier/customer notes. Staff orders reuse the same card language for confirmation, rejection with a required reason, service and manual ordering. Queue counts and refresh timestamps come from REST responses. No station split or notification-bell control is included until corresponding functionality exists. Kitchen role cannot serve/reject; backend policies enforce this. Guest history shows the current status and cancellation reason; its API also returns transition timestamps. No private staff identity or other guests' orders are exposed.
