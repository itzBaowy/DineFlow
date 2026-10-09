# PROJECT: DINEFLOW — RESTAURANT QR ORDERING & MANAGEMENT SYSTEM

## 1. Vai trò của bạn

Bạn là **Senior Fullstack Engineer, Software Architect và Product Engineer**.

Nhiệm vụ của bạn là thiết kế và triển khai một hệ thống quản lý nhà hàng hiện đại có tên **DineFlow**.

Đây là một dự án portfolio thực tế, cần đạt chất lượng production-ready trong phạm vi MVP.

Ứng dụng phải hoạt động như một hệ thống nhà hàng thật, không phải demo CRUD đơn giản.

**Nguyên tắc:**
- Ưu tiên tính đúng đắn của nghiệp vụ.
- Code có cấu trúc, dễ bảo trì, mở rộng.
- Không over-engineering.
- Không thêm microservices khi chưa cần.
- Không chỉ dựng giao diện giả với mock data.
- Frontend phải kết nối backend và database thật.
- Mỗi giai đoạn đều phải có chức năng chạy được.
- Không tự ý triển khai tất cả chức năng trong một lần.

---

## 2. Ý tưởng sản phẩm

DineFlow là nền tảng cho phép khách hàng đến nhà hàng, quét mã QR trên bàn bằng điện thoại và trực tiếp đặt món mà không cần nhân viên ghi nhận thủ công.

Quy trình:

1. Nhân viên mở phiên phục vụ cho bàn.
2. Khách quét mã QR có sẵn tại bàn.
3. Hệ thống hiển thị thực đơn.
4. Khách chọn món, số lượng, size, topping và ghi chú.
5. Khách xác nhận đặt món.
6. Đơn xuất hiện realtime trên giao diện nhân viên.
7. Nhân viên xác nhận đơn.
8. Đơn chuyển sang màn hình bếp.
9. Bếp chế biến và cập nhật trạng thái.
10. Nhân viên mang món ra bàn.
11. Khách có thể gọi thêm món.
12. Khách yêu cầu thanh toán.
13. Thu ngân thanh toán và đóng phiên bàn.

Tất cả đơn phát sinh trong một phiên bàn phải được cộng vào hóa đơn cuối cùng.

---

## 3. Tech Stack

### Frontend

- Next.js — phiên bản stable phù hợp tại thời điểm triển khai
- React
- TypeScript strict
- Tailwind CSS
- shadcn/ui
- TanStack Query
- Zustand nếu cần
- React Hook Form
- Zod
- Socket.IO Client
- Lucide Icons

### Backend

- NestJS
- TypeScript
- REST API
- Socket.IO Gateway
- Swagger / OpenAPI
- Class Validator hoặc Zod

### Database

- PostgreSQL
- Prisma ORM

### Infrastructure

- Redis
- BullMQ khi có background jobs thực sự
- Docker
- Docker Compose

### Storage

- MinIO cho local development
- S3-compatible storage abstraction

### Authentication

- JWT cho nhân viên
- Refresh token rotation
- HttpOnly cookies
- RBAC

Khách hàng không cần đăng ký tài khoản để gọi món.

Dùng session/token riêng để quản lý quyền truy cập của khách.

---

## 4. Phạm vi sản phẩm

Phạm vi cập nhật theo yêu cầu ngày **09/10/2026**: DineFlow là **SaaS nhiều nhà hàng (tenant), miễn phí trong giai đoạn hiện tại**. Phạm vi này thay thế giới hạn một nhà hàng của MVP ban đầu.

- Bất kỳ chủ nhà hàng nào cũng có thể đăng ký và tạo không gian nhà hàng; đăng ký tạo User + Restaurant + membership OWNER nguyên tử, không seed đơn/doanh thu giả.
- Mỗi nhà hàng là một tenant. Menu, bàn/QR, phiên phục vụ, đơn, thanh toán, báo cáo, ảnh và nhân viên được scope theo tenant; không tin restaurantId từ client.
- Chủ nhà hàng tự tạo tài khoản nhân viên và quản lý. MANAGER không tạo/sửa/khóa/reset OWNER; quyền nghiệp vụ hiện có được giữ nguyên.
- Có admin nền tảng cấp riêng bởi operator, tách khỏi OWNER/MANAGER và không thể đăng ký công khai. Admin xem tình trạng API/database, tổng quan tenant/tài khoản, quản lý tạm ngừng/mở lại tenant, bật/tắt đăng ký mới và nhật ký quản trị.
- Tạm ngừng tenant thu hồi phiên staff/guest và chặn quyền truy cập/QR/realtime, giữ nguyên dữ liệu/phiên bàn. Mở lại không phục hồi credentials đã thu hồi.
- Chưa thu phí, chưa có subscription/trial/checkout nhà hàng. Thanh toán hóa đơn khách tại quán vẫn là nghiệp vụ billing hiện có.

SaaS nhiều nhà hàng: mỗi đăng ký tạo nhà hàng đầu tiên cho Owner mới; Owner có thể tạo thêm nhà hàng trống bằng cùng tài khoản. Nếu có nhiều membership ACTIVE, đăng nhập yêu cầu chọn nhà hàng sau khi xác thực mật khẩu. Workspace cho phép chuyển sang membership của chính user, áp dụng vai trò đích, thu hồi phiên cũ và làm mới dữ liệu/giỏ nhân viên/realtime; không sao chép dữ liệu. Admin tắt đăng ký cũng chặn tạo thêm nhà hàng. Custom domain, invitation/email verification, reset mật khẩu qua email và subscription được bổ sung ở các giai đoạn sau khi cần.

Ngôn ngữ giao diện mặc định: tiếng Việt.

Đơn vị tiền tệ: VND.

---

## 5. Các giao diện chính

### A. Customer Ordering Interface

Responsive, ưu tiên Mobile First.

Khách truy cập bằng URL dạng:

`/t/{tableCode}`

Trong đó `tableCode` là mã công khai ngẫu nhiên, không phải ID tăng tuần tự của database.

Hiển thị:

- Tên nhà hàng
- Logo
- Số bàn
- Danh mục món
- Ảnh món
- Giá tiền
- Trạng thái còn / hết món
- Giỏ hàng

Khách có thể:

- Tìm kiếm món ăn
- Lọc theo danh mục
- Xem chi tiết món
- Chọn size
- Chọn topping
- Thêm ghi chú
- Thay đổi số lượng
- Thêm vào giỏ hàng
- Xác nhận đặt món
- Xem đơn đã đặt
- Theo dõi trạng thái món
- Đặt thêm món
- Gọi nhân viên
- Yêu cầu thanh toán

Không yêu cầu đăng nhập.

Thiết kế trải nghiệm đặt món nhanh, thao tác bằng một tay trên điện thoại.

### B. Staff / Waiter Interface

Nhân viên có thể:

- Xem sơ đồ bàn
- Xem bàn trống / đang phục vụ / cần dọn
- Mở phiên bàn
- Xem đơn mới
- Chấp nhận hoặc từ chối đơn
- Theo dõi món đang chế biến
- Xác nhận đã phục vụ
- Tạo đơn thủ công cho khách
- Xem yêu cầu gọi nhân viên
- Xem hóa đơn tạm tính

### C. Kitchen Display System

Thiết kế giao diện tối ưu cho màn hình máy tính bảng hoặc desktop.

Hiển thị các đơn cần chế biến dưới dạng thẻ.

Ví dụ:

**BÀN 05 — ĐƠN #1024**

- 2 Cơm chiên hải sản
- 1 Trà đào — ít đá
- 1 Mì cay — cấp độ 2

Trạng thái:

- WAITING
- PREPARING
- READY

Yêu cầu:

- Đơn mới xuất hiện realtime.
- Có thông báo đơn mới.
- Hiển thị thời gian đã chờ.
- Bếp có thể bắt đầu hoặc hoàn thành món.
- Nhân viên được cập nhật khi món sẵn sàng.
- Có thể mở rộng để chia trạm bếp / quầy nước sau này.

### D. Cashier Interface

Thu ngân có thể:

- Xem các bàn đang phục vụ
- Xem toàn bộ đơn của một bàn
- Tổng hợp hóa đơn
- Áp dụng giảm giá được phân quyền
- Xem tạm tính, phí và tổng tiền
- Chọn phương thức thanh toán
- Xác nhận thanh toán
- Đóng phiên bàn
- In hóa đơn qua trình duyệt

Phương thức MVP:

- Tiền mặt
- Chuyển khoản ngân hàng xác nhận thủ công

Không được tự động đánh dấu PAID chỉ vì hiển thị mã QR thanh toán.

Tích hợp payment gateway và xác thực qua webhook/IPN thực hiện ở giai đoạn sau.

### E. Admin Dashboard

Chủ nhà hàng có thể:

- Quản lý danh mục
- Quản lý món ăn
- Quản lý giá
- Quản lý size và topping
- Bật/tắt trạng thái bán món
- Quản lý bàn
- Tạo và tải mã QR cho bàn
- Quản lý nhân viên
- Phân quyền
- Xem lịch sử đơn hàng
- Xem doanh thu
- Thống kê món bán chạy
- Xem báo cáo theo ngày/tháng

---

## 6. Dining Table & Session — nghiệp vụ quan trọng nhất

Thiết kế tách biệt giữa:

- Physical Table — bàn vật lý
- Dining Session — một lượt khách sử dụng bàn
- Order — một lần gửi món
- Order Item — từng món trong đơn
- Payment — giao dịch thanh toán

Ví dụ:

Bàn 05 được mở lúc 18:00.

18:05: Khách gọi 2 món, tạo Order #001.

18:25: Khách gọi thêm 3 món, tạo Order #002.

18:40: Khách yêu cầu thanh toán.

Hệ thống tính tổng tiền từ tất cả đơn hợp lệ trong Dining Session hiện tại.

Sau khi thanh toán:

- Session được đóng.
- Bàn chuyển sang trạng thái phù hợp.
- Không nhận thêm đơn cho session cũ.
- Lịch sử vẫn được lưu.
- Mã QR trên bàn có thể được dùng cho lượt khách tiếp theo.

Mã QR bàn có thể in cố định nhưng session phục vụ phải có vòng đời riêng.

**Lưu ý bảo mật:**

QR in trên bàn có thể bị chụp lại. Do đó QR không được xem là bằng chứng xác thực khách đang có mặt tại nhà hàng.

MVP phải có các biện pháp:

- Nhân viên mở phiên bàn.
- Đơn mới cần được xác nhận trước khi chế biến.
- Rate limit với public ordering API.
- Token ngẫu nhiên khó đoán.
- Guest session có phạm vi quyền rõ ràng.
- Không hiển thị dữ liệu nhạy cảm của khách trước.
- Từ chối gửi đơn vào session đã đóng.
- Có thể bổ sung xác minh PIN tại bàn hoặc QR động ở phiên bản nâng cao.

---

## 7. Menu Management

MenuCategory:

- id
- name
- description
- position
- isActive

MenuItem:

- id
- categoryId
- name
- description
- imageUrl
- basePrice
- isAvailable
- createdAt
- updatedAt

Hỗ trợ ModifierGroup và ModifierOption.

Ví dụ:

**Trà sữa**

Size:
- M +0đ
- L +5.000đ

Topping:
- Trân châu +5.000đ
- Pudding +7.000đ

Hệ thống phải hỗ trợ số lựa chọn tối thiểu/tối đa cho từng nhóm modifier.

Giá cuối cùng phải được backend tính toán.

Không tin dữ liệu giá do client gửi lên.

Lưu snapshot tên, giá và lựa chọn của món vào OrderItem để lịch sử hóa đơn không thay đổi khi admin chỉnh sửa menu.

Giá VND được lưu dưới dạng số nguyên, không dùng float cho tiền.

---

## 8. Order Management

Thiết kế trạng thái đơn hàng:

- PENDING_CONFIRMATION
- ACCEPTED
- PREPARING
- READY
- SERVED
- CANCELLED

Không cho phép chuyển trạng thái tùy tiện.

Ví dụ:

PENDING_CONFIRMATION → ACCEPTED → PREPARING → READY → SERVED.

Hủy đơn cần được kiểm tra quyền và trạng thái.

Trong giai đoạn sau có thể quản lý trạng thái riêng cho từng OrderItem để xử lý đơn có nhiều món thuộc nhiều trạm bếp.

Lưu timestamp của các chuyển trạng thái quan trọng.

### Business Rules

- Không đặt món thuộc menu đã ngừng bán.
- Không đặt số lượng âm hoặc bằng 0.
- Không cho khách tự chỉnh giá.
- Không cho người không có quyền xác nhận đơn.
- Không cho thanh toán hóa đơn đã thanh toán.
- Không cho đóng bàn sai trạng thái.
- Không tạo duplicate order nếu client retry request.

Sử dụng idempotency key cho thao tác tạo đơn.

Khi tạo đơn cần kiểm tra phiên bàn và ghi dữ liệu một cách nhất quán trong database transaction.

---

## 9. QR Code Management

Admin có thể tạo QR cho từng bàn.

Ví dụ:

- Table 01
- Table 02
- Table 03

QR chứa URL dẫn đến menu của bàn tương ứng.

Chức năng:

- Generate QR
- Preview QR
- Download PNG/SVG
- Download layout để in
- Regenerate public table code
- Disable QR cũ khi regenerate

Không để QR chứa database credentials hoặc JWT quyền nhân viên.

---

## 10. Realtime Architecture

Sử dụng Socket.IO.

Các sự kiện đề xuất:

- order.created
- order.accepted
- order.status_changed
- table.status_changed
- dining_session.closed
- service_request.created
- payment.completed

Luồng:

1. Guest gửi REST API tạo đơn.
2. Backend validate và commit transaction.
3. Backend phát sự kiện realtime.
4. Staff dashboard nhận sự kiện.
5. Nhân viên xác nhận.
6. Kitchen nhận cập nhật realtime.
7. Bếp cập nhật trạng thái.
8. Guest và Waiter nhận cập nhật.

Phải:

- Xác thực socket của nhân viên.
- Kiểm tra quyền join room.
- Phân tách room theo phạm vi nhà hàng, bàn, session phù hợp.
- Re-fetch dữ liệu khi reconnect.
- Không coi WebSocket event là nguồn dữ liệu duy nhất.

Redis adapter chỉ cần triển khai khi thực sự chạy nhiều backend instance.

---

## 11. Payment & Billing

DiningSession là nguồn tổng hợp hóa đơn.

Thông tin hóa đơn:

- Subtotal
- Discount
- Service charge nếu cấu hình
- Tax nếu áp dụng
- Total
- Paid amount
- Payment status

MVP có thể chỉ hỗ trợ thanh toán toàn bộ một lần.

Sau này hỗ trợ:

- Split bill
- Partial payment
- Refund
- Payment gateway
- VietQR động
- Đối soát giao dịch tự động

Không hard-code tỷ lệ thuế hay phí dịch vụ cho mọi nhà hàng.

Khi thanh toán phải có transaction và kiểm tra tính hợp lệ của số tiền, tránh thanh toán lặp hoặc đóng session hai lần.

---

## 12. RBAC

Vai trò:

- OWNER
- MANAGER
- CASHIER
- WAITER
- KITCHEN

OWNER:

Toàn quyền quản lý.

MANAGER:

Quản lý menu, bàn, nhân viên và hoạt động hằng ngày theo phân quyền.

CASHIER:

Xem hóa đơn, thanh toán, đóng phiên bàn.

WAITER:

Mở bàn, nhận đơn, phục vụ món, tiếp nhận yêu cầu.

KITCHEN:

Xem đơn cần chế biến và cập nhật tiến độ.

Backend bắt buộc kiểm tra quyền bằng Guards hoặc policy.

Không dùng việc ẩn button ở frontend làm cơ chế bảo mật.

---

## 13. Database Design

Phân tích và tạo Prisma Schema với những entity phù hợp:

- User
- StaffMembership
- Restaurant
- DiningTable
- DiningSession
- GuestSession
- MenuCategory
- MenuItem
- ModifierGroup
- ModifierOption
- Order
- OrderItem
- OrderItemModifier
- Payment
- ServiceRequest
- ActivityLog

Có thể bổ sung entity nếu thực sự cần.

Yêu cầu:

- Foreign keys
- Unique constraints
- Indexes
- Timestamps
- Enum phù hợp
- Soft delete hoặc archive khi cần
- Quan hệ rõ ràng
- Không dùng cascade delete làm mất lịch sử kinh doanh

---

## 14. Frontend Pages

Customer:

- `/t/[tableCode]`
- `/t/[tableCode]/cart`
- `/t/[tableCode]/orders`
- `/t/[tableCode]/bill`

Staff:

- `/staff/login`
- `/staff/dashboard`
- `/staff/tables`
- `/staff/orders`
- `/staff/kitchen`
- `/staff/cashier`

Admin:

- `/admin`
- `/admin/menu`
- `/admin/categories`
- `/admin/tables`
- `/admin/qr-codes`
- `/admin/staff`
- `/admin/reports`
- `/admin/settings`

Đề xuất route groups của Next.js để phân tách layout.

---

## 15. UI/UX Design

Thiết kế hiện đại, không sao chép nguyên bản sản phẩm có sẵn.

Customer UI:

- Mobile First
- Ảnh món ăn rõ ràng
- Danh mục dễ tìm
- Giá nổi bật
- Nút thêm giỏ hàng rõ ràng
- Giỏ hàng sticky ở cuối màn hình khi phù hợp
- Quy trình checkout ngắn gọn

Staff UI:

- Dashboard rõ ràng
- Trạng thái bàn bằng màu sắc kết hợp nhãn
- Dễ thao tác trên tablet
- Ít bước xác nhận không cần thiết

Kitchen UI:

- Thẻ đơn lớn
- Chữ dễ đọc từ xa
- Thời gian chờ nổi bật
- Nút thao tác lớn
- Cảnh báo đơn chờ lâu

Admin UI:

- Sidebar
- Dashboard cards
- Data tables
- Search/filter
- Modal/Dialog
- Skeleton loading
- Empty/Error states
- Dark/light mode nếu hợp lý

Giao diện phải có tính nhất quán về spacing, typography, màu sắc và component.

---

## 16. Project Architecture

Ưu tiên monorepo:

- `apps/web` — Next.js customer, staff, kitchen và admin
- `apps/api` — NestJS
- `apps/worker` — background worker khi cần
- `packages/shared` — types, constants và schemas dùng chung khi hợp lý

Backend modular:

- auth
- staff
- restaurant
- tables
- dining-sessions
- menu
- orders
- kitchen
- payments
- realtime
- reports
- storage
- audit

Sử dụng REST API làm nguồn thao tác nghiệp vụ chính.

WebSocket dùng để đồng bộ cập nhật realtime.

Không tách microservices trong MVP.

---

## 17. Docker & Development

Tạo môi trường local với:

- PostgreSQL
- Redis
- MinIO nếu sử dụng upload ảnh

Có Docker Compose, healthchecks và `.env.example`.

Tạo database migrations, seed data và demo accounts.

Seed dữ liệu:

- 1 nhà hàng
- 10 bàn
- 5 danh mục
- 20 món ăn mẫu
- Một số modifier
- Tài khoản quản lý, phục vụ, bếp và thu ngân

Không commit secrets.

---

## 18. Testing

Ưu tiên kiểm thử:

- Authentication
- RBAC
- Tạo phiên bàn
- Tạo đơn
- Đặt nhiều đơn trong cùng phiên
- Không cho đặt món hết hàng
- Tính tổng tiền và modifier
- Idempotency
- Order state transition
- Concurrent requests
- Đóng phiên bàn
- Ngăn thanh toán hai lần
- WebSocket reconnect

Tạo ít nhất một E2E flow:

Khách quét QR → đặt món → nhân viên xác nhận → bếp hoàn thành → phục vụ → thanh toán → đóng phiên bàn.

---

## 19. Roadmap

### Phase 1 — Foundation

- Monorepo
- Next.js
- NestJS
- PostgreSQL
- Prisma
- Docker
- Environment validation
- UI foundation
- Auth nhân viên

### Phase 2 — Restaurant Setup

- Restaurant settings
- Dining tables
- QR code generation
- Menu categories
- Menu items
- Modifiers
- Image upload

### Phase 3 — Customer Ordering

- Customer menu
- Cart
- Checkout
- Guest session
- Dining session
- Create orders
- Order history

### Phase 4 — Staff & Kitchen

- Staff dashboard
- Order confirmation
- Kitchen Display
- State transitions
- Role permissions

### Phase 5 — Realtime

- Socket.IO
- Realtime orders
- Realtime table states
- Guest order tracking
- Service requests

### Phase 6 — Billing

- Bill aggregation
- Discounts
- Cash payment
- Manual bank transfer confirmation
- Close dining session
- Printable receipt

### Phase 7 — Admin & Analytics

- Revenue dashboard
- Daily reports
- Best-selling items
- Order history
- Staff activity

### Phase 8 — Production Readiness

- Tests
- Error handling
- Logging
- Security review
- Docker production
- CI/CD
- Documentation
- Deployment

---

## 20. Quy tắc làm việc của Agent

Trước khi sửa code, hãy kiểm tra repository hiện tại.

Nếu repository trống, tạo cấu trúc mới.

Nếu đã tồn tại code, phân tích và tái sử dụng những phần hợp lý.

Trước tiên:

1. Phân tích requirements.
2. Thiết kế architecture.
3. Thiết kế database ERD.
4. Thiết kế state machine cho Order và DiningSession.
5. Xác định MVP scope.
6. Đề xuất folder structure.
7. Tạo roadmap triển khai.

Sau đó bắt đầu implement Phase 1.

Không dừng ở việc viết tài liệu nếu có thể bắt đầu code.

Sau mỗi phase:

- Chạy lint.
- Chạy typecheck.
- Chạy các tests liên quan.
- Kiểm tra build.
- Báo cáo những phần đã hoàn thành.
- Nêu rõ những phần chưa được kiểm chứng.
- Không tự nhận tính năng hoàn thành nếu chưa chạy được.

Không sử dụng dữ liệu giả để thay thế các API cốt lõi trong sản phẩm cuối cùng.

Không tạo những abstraction phức tạp khi chưa có nhu cầu thực tế.

---

## 21. Definition of Done — MVP

Dự án MVP hoàn thành khi có thể demo được toàn bộ quy trình:

**Nhân viên**
- Đăng nhập.
- Mở bàn.
- Xem đơn khách gửi.
- Xác nhận đơn.

**Khách hàng**
- Quét QR.
- Xem menu.
- Chọn món và topping.
- Gửi đơn.
- Xem trạng thái.
- Gọi thêm món.

**Nhà bếp**
- Nhận đơn realtime.
- Bắt đầu chế biến.
- Đánh dấu hoàn thành.

**Thu ngân**
- Xem tất cả món của bàn.
- Tính tổng hóa đơn.
- Ghi nhận thanh toán.
- Đóng phiên bàn.

**Admin**
- Quản lý món.
- Quản lý giá.
- Quản lý bàn và QR.
- Xem doanh thu cơ bản.

Dữ liệu phải được lưu trong PostgreSQL và các giao diện có thể sử dụng đồng thời trên những thiết bị khác nhau.

---

## 22. Bắt đầu ngay

Hãy bắt đầu bằng việc thiết kế architecture, database ERD, mô hình DiningSession/Order và folder structure.

Sau đó khởi tạo codebase cho Phase 1.

Ưu tiên tạo một hệ thống có thể chạy và mở rộng được, thay vì một project chỉ đẹp về UI.

**Mục tiêu cuối cùng: xây dựng một hệ thống QR Ordering và quản lý nhà hàng đủ thực tế để demo cho chủ quán và đủ chiều sâu kỹ thuật để trình bày trong phỏng vấn Fullstack Engineer.**
