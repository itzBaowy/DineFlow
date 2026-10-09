# SaaS — Owner signup

Generated in the existing Stitch project, using Artisanal Operations.

DineFlow free multi-tenant SaaS restaurant owner registration page in Vietnamese. Use the existing project's design system.
PLATFORM: Responsive web, desktop split-view with mobile single column.
PAGE STRUCTURE:
1. Header: DineFlow branding, link "Đã có tài khoản? Đăng nhập".
2. Narrative panel: headline "Quán của bạn. Nhịp phục vụ của bạn.", concise explanation of private restaurant workspace. Three numbered steps: tạo nhà hàng, thêm thực đơn và bàn, mời đội ngũ phục vụ. Clearly say "Miễn phí trong giai đoạn hiện tại", no credit card and no invented user counts or testimonials.
3. Registration card: headline "Bắt đầu với nhà hàng của bạn". Labeled inputs tên chủ nhà hàng, email, mật khẩu (tối thiểu 12 ký tự), tên nhà hàng, mã nhà hàng (slug), timezone. Primary submit "Tạo nhà hàng miễn phí"; required field error states, progress indication, conflict and temporarily paused registration messages. No subscription selector or payment flow.
4. Footer: staff accounts created by owner/manager inside restaurant workspace; separate quiet "Quản trị nền tảng" login link.
Prioritize accessible inputs, generous reading rhythm, clearly separated explanatory content and form, straightforward signup that creates an empty real tenant rather than seeding fake orders. Never mix platform admin with tenant Owner.

Stitch suggestions: conflict/paused registration views, three-step onboarding wizard, and single-column mobile. The implementation includes real error/paused/success states and responsive mobile; no invented tenant URLs, availability badges, shift/FOH/BOH data or terms checkbox without an actual policy.

