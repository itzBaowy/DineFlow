# Stitch → Next.js

Project: [DineFlow — Restaurant Workspace & QR Ordering](https://stitch.withgoogle.com/projects/7484965213377838536). IDs gốc nằm trong `../stitch-project.json`. Không tạo lại project này khi tiếp tục chỉnh giao diện.

Phase 1, Stitch sinh 3 màn hình và design system **Artisanal Operations**: login, dashboard, thông tin nhà hàng. HTML nguyên bản được giữ ở `*.reference.html` để tham chiếu, **không chạy hay embed trong ứng dụng**. `DESIGN.md` là các tokens/style do Stitch trả về. Prompt được xây từ Requirement.md và giới hạn từng phase, yêu cầu tiếng Việt và dữ liệu thật.

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

Phase 4 thêm kitchen screen `96f3d4aaf5e74015a308dedc69373712`, prompt ở `phase-4-prompts.md`, HTML ở `kitchen.reference.html`. MCP dùng lại project/design system hiện có. `/staff/kitchen` giữ bố cục ba hàng đợi, tickets, nút chế biến lớn, số lượng và ghi chú nổi bật. `/staff/orders` dùng cùng ticket component với bộ lọc bàn/trạng thái và reason dialog. Sidebar hiển thị trang theo role; nhánh ghi đơn thủ công vẫn đánh dấu Phiên bàn đang mở. Desktop dành riêng sidebar 256px; mobile xếp cột dọc và drawer; thanh checkout thủ công tránh sidebar.

Đơn, queue counts và timestamps lấy từ API; nhãn chờ lâu từ 15 phút tính theo thời điểm bước hiện tại. Đồng hồ client cập nhật mỗi 30 giây, không phải API polling hay Socket. Nút Cập nhật refetch REST và mutation invalidate các queries liên quan. Không đưa station split, notification bell, chỉ số ca trực hoặc trạng thái realtime tự thêm bởi Stitch vào sản phẩm. Ghi đơn dùng lại menu/cart/modifier components với staff authentication và source STAFF, không giả lập guest session. Đã đối chiếu ảnh desktop/mobile của kitchen, staff orders và manual checkout trong `.local/qa/`.

Phase 5 thêm guest tracking screen `b0793d21de1449b08830a8ea7f84966c`, prompt ở `phase-5-prompts.md`, HTML ở `guest-tracking.reference.html`. Dùng cùng project/design system, tiến độ dạng cards trên mobile và timestamps đã commit, request panel với hai nút lớn. Header hiển thị trạng thái Socket.IO thực tế; staff có thông báo đơn/yêu cầu mới, sidebar thêm Yêu cầu phục vụ theo role. Các đề xuất confirmation/offline/completed request được triển khai bằng React/Radix với dữ liệu thật, không chạy scripts reference.

Không dùng ETA, tổng bill, tên nhân viên hoặc lịch sử đơn cả bàn từ reference. Khách chỉ thấy đơn mình gửi; service request là trạng thái phục vụ chung của phiên. Dialog giải thích REQUEST_PAYMENT tạm ngừng món mới và chưa ghi nhận tiền. Tiến độ cancelled chỉ dùng mốc đã tồn tại, giữ lý do hủy. Đã đối chiếu `.local/qa/guest-tracking-mobile.png`, `guest-disconnected-mobile.png`, `service-requests-desktop.png`, `service-requests-mobile.png`; browser kiểm tra requests ở 390/320px, polling fallback và reconnect thực tế.

Phase 6 thêm cashier screen `1ea9154da32d4af09ba92db2aaca0b61` trong cùng project/design system. Prompt ở `phase-6-prompts.md`, HTML ở `cashier.reference.html`. Thu ngân chọn phiên từ cards, xem order snapshots bên trái và tổng tiền/giảm giá/xác nhận tiền bên phải; mobile xếp dọc, desktop giữ panel tổng tiền ở vị trí sticky. Giữ palette pine/ivory, headline Newsreader và Be Vietnam Pro cho số liệu/form. Không đưa ca trực, membership, giảm giá mẫu hoặc FOH/BOH status từ reference vào sản phẩm.

Các đề xuất dialog xác nhận, cảnh báo món chưa SERVED và receipt/in được thực hiện bằng React/Radix với dữ liệu API thật. Checkbox đã nhận tiền và mã chuyển khoản thủ công bắt buộc trước dialog cuối; bill đổi revision thì phải kiểm tra lại. Mất phản hồi hiển thị pending payload cố định, khôi phục sau reload và tra biên nhận trước khi gửi lại. Guest có trang tổng bill riêng, không lộ chi tiết đơn khách khác. In receipt dùng named CSS page A5 và ẩn navigation/actions; QR vẫn in A4. Lịch sử ca và báo cáo thuộc Phase 7.

Đã đối chiếu `.local/qa/cashier-bill-desktop.png`, `cashier-bill-mobile.png`, `receipt-print.png`, `payment-retry-after-reload.png`. E2E kiểm tra chiều rộng 390/320px, print media và sinh `payment-receipt.pdf`; chưa kiểm tra máy in vật lý.

Phase 7 thêm reports screen `b352c7f92d5e45ce92c795188410b3e2` trong cùng project/design system. Prompt ở `phase-7-prompts.md`, HTML ở `reports.reference.html`. Giữ headline editorial, bốn cards chỉ số, chart + bảng, methods và top sellers; lịch sử đơn, audit và staff dùng lại pine/ivory, forms/cards/pagination/Radix dialogs. Sidebar thay mục báo cáo sắp ra mắt bằng routes quản trị thật cho OWNER/MANAGER.

Không đưa dữ liệu mẫu, growth chưa có baseline, FOH/BOH, ca trực, auto reconciliation/VietQR hay nút export giả từ reference vào sản phẩm. Chuyển khoản do nhân viên kiểm tra tiền về thủ công. Báo cáo chỉ lấy COMPLETED Payment, ngày theo timezone, zero buckets và snapshots; activity chỉ render fields an toàn. Đã đối chiếu reports/staff desktop/mobile; chỉnh tiếp chart spacing/bảng mặc định kỳ mới nhất sau screenshot, build qua, chờ web do người dùng chạy để chụp lại.

SaaS thêm signup screen `ce9149eaeb584af09dcee22d15b0d4de`, prompt `saas-prompts.md`, HTML `signup.reference.html`. `/register` giữ split narrative/form, ba bước bắt đầu, thông điệp miễn phí và các trạng thái validation/conflict/paused/success thật. `/platform/login` và `/platform` dùng tokens/components hiện có, tách khỏi Workspace nhà hàng. Không đưa URL slug preview chưa hỗ trợ, available badge giả, ca trực, subscription hoặc checkbox chính sách chưa có từ Stitch vào sản phẩm. Reference screenshot và UI thực tế đã được xem trên Chromium desktop/390/320px khi người dùng mở FE; signup/platform flow đã qua.

Multi-restaurant: Stitch screen `0c6eaddfbb594d2fa7dfe08af9034963`, prompt `tenancy-prompts.md`, HTML `restaurants.reference.html`. `/staff/restaurants` dùng lưới membership, status thật, role đích, form tạo trống và xác nhận chuyển. Không dùng URL slug giả, PIN, ca trực, nhóm chi nhánh hoặc số liệu độ trễ giả trong reference. Bước chọn nhà hàng bổ sung vào login; navbar giữ ngữ cảnh tenant. Đã xem ảnh reference và ảnh ứng dụng desktop/320px; browser flow kiểm tra responsive 390/320px và hai tab.
