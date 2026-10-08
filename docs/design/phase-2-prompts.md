# Phase 2 — Stitch prompts

Project: 7484965213377838536. Design system: assets/23ff43d04b194e6c8c13fab28e1e0fc8.

## Menu management

Create a beautiful Vietnamese DineFlow ADMIN MENU MANAGEMENT screen for Phase 2, in existing project with Artisanal Operations design system. Reuse pine #173e32, warm ivory #f8f7f3, chartreuse #d9edb0, Be Vietnam Pro, editorial Newsreader accents, fixed sidebar 256px and main margin-left256px, mobile drawer. Existing brand and restaurant Bếp Nhà DineFlow.
Design realistic fully functional manager workspace, not sales dashboard. Sidebar actual routes: Tổng quan, Thực đơn, Danh mục, Size & topping, Bàn phục vụ, Mã QR, Thông tin nhà hàng. Kitchen and cashier future labels only.

Main "Thực đơn của nhà hàng", calm description, primary "Thêm món". Four tiny useful summary labels calculated from actual menu data: tổng món, đang bán, tạm hết, danh mục. Search field "Tìm món ăn…" plus category and availability filters. Restaurant has 20 sample Vietnamese dishes. Use a polished white rounded bordered list/table with food thumbnail or honest image placeholder, name, category, VND integer price, labeled availability, edit action. Real sample rows Cơm chiên hải sản85000, Bò lúc lắc125000, Trà sữa35000, Trà đào35000, Gỏi cuốn tôm thịt45000. Some items may have no uploaded image, do not invent photos for every dish. Group view aesthetic excellent readable operational table, 48px actions.

Show a right-side edit/create dialog for one dish "Thêm món mới": name, category select, description, price VND, optional image upload dropzone PNG/JPG/WebP (5MB), modifier group checkboxes Size/Topping, availability checkbox, save/cancel. No invented revenue, extra features, branch data, plans, hardcoded fake badges. Include empty/loading/error visual reference. Deliver screenshot and HTML with reusable component design for categories/modifiers/tables/QR.

## Tables and QR

Design DineFlow Phase 2 admin Dining Tables and QR Codes workspace in Vietnamese, matching existing Artisanal Operations pine ivory chartreuse design. 256px sidebar main margin-left256, responsive mobile drawer. Header 'Bàn phục vụ', subtitle setup physical tables. 'Thêm bàn' button, actual count summaries, search. 10 seeded tables Bàn01..10 capacity4, operational table cards name capacity AVAILABLE 'Sẵn sàng' or OUT_OF_SERVICE 'Tạm ngưng'; do not invent occupied sessions as this phase only table setup. Each card edit, archive confirmation, preview QR generated URL /t/randompubliccode. Right drawer edit name capacity position and enabled. Secondary QR page reference 'Mã QR tại bàn': select labels, preview genuine scannable QR from backend, downloadPNG/SVG, print all labels in A4 printCSS, 'Đổi mã QR' confirmation warning old code stops immediately. Never exposeJWT credentials or DBid insideQR. Clear unavailable/empty/error states. Beautiful airy editorial top pine strip and precise operational controls. Preserve existing routes /admin/menu,/admin/categories,/admin/modifiers,/admin/tables,/admin/qr-codes,/admin/settings and /staff/dashboard. Future kitchen/cashier labels no phase numbers.
