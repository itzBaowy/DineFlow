# Stitch → Next.js

Project: [DineFlow — Restaurant Workspace & QR Ordering](https://stitch.withgoogle.com/projects/7484965213377838536). IDs gốc nằm trong `../stitch-project.json`. Không tạo lại project này khi tiếp tục chỉnh giao diện.

Stitch đã sinh 3 màn hình và design system **Artisanal Operations**: login, dashboard, thông tin nhà hàng. HTML nguyên bản được giữ ở `*.reference.html` để tham chiếu, **không chạy hay embed trong ứng dụng**. `DESIGN.md` là các tokens/style do Stitch trả về. Prompt được xây từ Requirement.md và giới hạn Phase 1, yêu cầu tiếng Việt và dữ liệu cấu hình thật.

Triển khai bằng Next.js/React components, Tailwind, shadcn-style primitives; giữ pine/ivory/chartreuse, Be Vietnam Pro cho UI và Newsreader cho headline editorial. Font được Next self-host; ảnh gốc Stitch được tải về `apps/web/public/images/dining-editorial.png`, không phụ thuộc URL ảnh tạm thời khi runtime. HTML của Stitch không thay thế React Hook Form, validation, TanStack Query hay Nest API.

Các điều chỉnh khi đưa vào sản phẩm:

- Sidebar của dashboard tham chiếu bị đè nội dung; web dành riêng 256px và dùng Radix Dialog drawer trên mobile (focus trap, Escape).
- Không sử dụng hotline/version/branch/FOH-BOH status/2FA hoặc thông tin ca trực Stitch tự thêm. Không dùng JavaScript giả lập đăng nhập thành công của Stitch.
- Số lượng bàn/danh mục/món/nhân viên và restaurant settings lấy từ API với restaurant scope; trạng thái kết nối lấy từ readiness API. Skeleton, error/retry và cookie session là thật.
- Navigation các phase sau là nhãn “Sắp ra mắt”, không có thao tác giả. Trang settings là read-only trong Phase 1.
- Ngày hiển thị theo timezone nhà hàng, đồng bộ client sau hydration để tránh giữ ngày tại thời điểm build.

Stitch đề xuất thêm mobile view, menu categories, modal cấu hình bàn và giấy phép. Không tự triển khai các chức năng này trong Phase 1. Mobile của các màn hình hiện tại được kiểm chứng trực tiếp bằng Playwright.

Phase 2 bổ sung hai thiết kế menu management và tables/QR trong cùng project/design system. Prompt được lưu tại `phase-2-prompts.md`; screenshot/HTML tải từ MCP được đối chiếu với ứng dụng. Các đề xuất tiếp theo của Stitch gồm menu QR cho khách, danh mục/modifier riêng và bố cục in A4. Menu khách thuộc Phase 3; danh mục/modifier tái sử dụng components của menu; bố cục in A4 đã được triển khai từ dữ liệu QR thật.

Không đưa số liệu 18 món đang bán, khu vực/tầng bàn, trạng thái FOH/BOH hoặc chức năng bếp Stitch tự thêm vào sản phẩm. Summary, ảnh, category/modifier assignments, sức chứa và trạng thái bàn lấy từ API. Món chưa upload ảnh dùng placeholder. Settings đã có form chỉnh sửa và upload logo. Dialog có validation, mutation errors và invalidate/refetch sau khi lưu. QR tải sớm và chỉ cho in khi mã đã sẵn sàng; regenerate thay URL preview để không giữ hình cũ.

Phase 3 thêm màn hình menu QR di động `3b429f22b61846438982c78f382ccb66`, prompt ở `phase-3-prompts.md`, HTML ở `customer-menu.reference.html`. Giữ header gọn, lời chào editorial, tìm kiếm/category pills, dish rows và thanh giỏ có safe-area. Bảng size/topping dùng Radix Dialog với focus trap, nhãn input và validation; ảnh chưa upload dùng icon thay vì artwork tham chiếu của Stitch. Chỉ số món, giá, tên bàn, trạng thái và đơn lấy từ API thật.

Menu/cart/history chia sẻ nested layout và provider. Giỏ khôi phục từ sessionStorage đã validate; guest credential chỉ ở HttpOnly cookie. Không đưa tên “Đơn bàn” trong reference vào lịch sử khách vì mỗi khách chỉ được xem đơn mình gửi. Không sử dụng thông báo realtime giả, rating, món hết tự bịa hoặc thao tác thanh toán chưa triển khai. Staff `/staff/tables` tái sử dụng tokens/cards từ tables design cho mở phiên, đọc đơn và dọn bàn.
