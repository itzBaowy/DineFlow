# Multi-restaurant workspace

Project: 7484965213377838536. Design system: Artisanal Operations.

## Generation prompt

DineFlow authenticated multi-restaurant management for Vietnamese owners and staff. Create a refined operational page using the project's existing design system.
**PLATFORM:** Web, desktop-first, responsive single column on narrow screens.
**PAGE STRUCTURE:**
1. Sidebar with brand, current restaurant context, navigation and staff identity. Active navigation "Nhà hàng của tôi".
2. Header breadcrumb and account identity. Main editorial heading "Mỗi nhà hàng, một không gian riêng", supporting copy explaining that menus, tables, staff and orders belong to each restaurant. Primary CTA "Tạo thêm nhà hàng", only for current OWNER.
3. Responsive membership card grid with three example restaurants: current active with badge "Đang làm việc"; another active restaurant with role "Chủ nhà hàng" and CTA "Chuyển nhà hàng"; suspended restaurant showing "Tạm ngừng" and disabled CTA. Each card has name, slug, timezone and the user's role. No invented revenue or operational counts.
4. A restrained onboarding panel explaining that a new restaurant starts empty and the owner configures its menu, tables and staff.
5. Show an inset dialog example "Tạo nhà hàng" with labeled fields "Tên nhà hàng", "Mã nhà hàng", "Múi giờ", primary "Tạo nhà hàng" and secondary "Hủy". Explain creation is free and does not copy existing data.
Include loading, error and confirmation treatments; tenant switching warns unsent staff carts will be cleared. No pricing, billing cards, payment methods, impersonation or branch grouping. All visible product copy in Vietnamese.

## Implementation boundaries

Use real memberships, restaurant statuses and role labels. Slugs are identifiers, not public URLs. Suspension is controlled by the platform administrator. Do not implement illustrative staff PINs, invented performance figures, branch grouping or encryption claims.
