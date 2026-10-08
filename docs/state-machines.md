# State machines và quyền

```mermaid
stateDiagram-v2
  [*] --> AVAILABLE: tạo bàn
  AVAILABLE --> OCCUPIED: nhân viên mở phiên
  OCCUPIED --> NEEDS_CLEANING: đóng phiên hợp lệ
  NEEDS_CLEANING --> AVAILABLE: nhân viên xác nhận đã dọn
  AVAILABLE --> OUT_OF_SERVICE: quản lý ngừng sử dụng
  OUT_OF_SERVICE --> AVAILABLE: quản lý kích hoạt
```

```mermaid
stateDiagram-v2
  [*] --> OPEN: mở bàn
  OPEN --> PAYMENT_REQUESTED: khách hoặc nhân viên yêu cầu
  PAYMENT_REQUESTED --> OPEN: nhân viên mở lại trước thanh toán
  PAYMENT_REQUESTED --> CLOSED: thu ngân xác nhận thanh toán
  OPEN --> CLOSED: thanh toán trực tiếp hoặc đóng phiên rỗng có lý do
  CLOSED --> [*]
```

```mermaid
stateDiagram-v2
  [*] --> PENDING_CONFIRMATION: guest / waiter gửi đơn
  PENDING_CONFIRMATION --> ACCEPTED: waiter xác nhận
  PENDING_CONFIRMATION --> CANCELLED: waiter từ chối + lý do
  ACCEPTED --> PREPARING: kitchen bắt đầu
  ACCEPTED --> CANCELLED: manager hủy + lý do
  PREPARING --> READY: kitchen hoàn thành
  READY --> SERVED: waiter phục vụ
  SERVED --> [*]
  CANCELLED --> [*]
```

Không cho CANCELLED sau PREPARING trong MVP; vấn đề món đã chế biến xử lý bằng quy trình điều chỉnh/refund sau này. Không cho chuyển ngược hoặc bỏ bước. Lưu acceptedAt/preparingAt/readyAt/servedAt/cancelledAt; hủy bắt buộc reason. Mỗi request kiểm tra cả role và scope restaurant/session. Quy tắc transition dùng chung trong packages/shared là policy dự kiến; endpoint nghiệp vụ triển khai ở Phase 3–6.

| Hành động | OWNER | MANAGER | CASHIER | WAITER | KITCHEN |
|---|---|---|---|---|---|
| Dashboard cơ bản | ✓ | ✓ | ✓ | ✓ | ✓ |
| Thiết lập menu/bàn | ✓ | ✓ | | | |
| Nhân viên | ✓ | Có giới hạn, không cấp OWNER | | | |
| Mở bàn / nhận đơn / phục vụ | ✓ | ✓ | | ✓ | |
| Bắt đầu / hoàn thành bếp | ✓ | ✓ | | | ✓ |
| Thanh toán / đóng phiên | ✓ | ✓ | ✓ | | |
| Giảm giá | ✓ | ✓ | Chỉ trong hạn mức được cấu hình | | |
| Báo cáo | ✓ | ✓ | | | |

Khách chỉ được đọc menu công khai, gửi/đọc đơn và service request trong **phiên đang hoạt động** được cấp token; không truy cập session lịch sử bằng QR cố định. QR không xác minh khách có mặt. Rate limit public API, nhân viên xác nhận đơn trước bếp; PIN/QR động có thể thêm sau.
