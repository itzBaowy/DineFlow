# DineFlow — kiến trúc và phạm vi

## Phạm vi thực hiện

Repository ban đầu chỉ có README và Requirement.md. Triển khai theo từng phase; đợt này là **Phase 1**, không phải toàn bộ MVP.

Phase 1 chạy được: workspace pnpm; Next.js App Router tiếng Việt; NestJS REST + Swagger; PostgreSQL + Prisma + migration; Redis qua Compose; kiểm tra môi trường; seed; đăng nhập/đăng xuất nhân viên, JWT, refresh rotation, RBAC; dashboard đọc nhà hàng, vai trò và số lượng cấu hình từ database. Không đưa đơn hàng giả vào dashboard.

Chưa triển khai API/UI chỉnh menu, mở bàn, QR, guest ordering, bếp, Socket.IO, thanh toán, báo cáo hay upload. Schema dự kiến cho MVP được migration ngay trong foundation để các quan hệ và constraints có thể kiểm chứng; đây không có nghĩa các chức năng đó đã hoàn thành.

## Kiến trúc

```mermaid
flowchart LR
  Browser[Khách / nhân viên] --> Web[Next.js :3000]
  Web -->|/api rewrite cùng origin| API[NestJS :4000 /api/v1]
  API --> Prisma[Prisma + pg adapter]
  Prisma --> PG[(PostgreSQL)]
  API -. Phase 5: Socket.IO .-> Browser
  Redis[(Redis)] -. Chỉ dùng khi có nhu cầu cache / jobs .-> API
  Storage[S3 / MinIO] -. Phase 2: ảnh menu .-> API
```

Monolith modular, một restaurant tại MVP. Dữ liệu nghiệp vụ có restaurantId và membership riêng; scope lấy từ principal backend, không tin restaurantId từ client. Không xây SaaS, worker, Redis adapter hoặc queue khi chưa có nhu cầu. REST là nguồn dữ liệu; sự kiện chỉ được phát sau commit, reconnect luôn refetch (Phase 5).

Web sử dụng cùng origin `/api/v1` qua Next rewrite. Cookie access/refresh HttpOnly, SameSite=Lax; Secure khi production. Access JWT 15 phút, refresh opaque 7 ngày và rotation với hạn tuyệt đối của phiên; chỉ lưu SHA-256 refresh token. Guard kiểm tra phiên, user và membership còn active trong DB ở mỗi request. Role không được lấy từ JWT cũ. Trình duyệt gửi `X-DineFlow-Client: web` cùng JSON cho mutation; backend bắt buộc header này và kiểm tra Origin nằm trong allowlist. Không bật trust proxy mặc định.

Refresh dùng row lock theo AuthSession. Token đã dùng bị gửi lại sẽ revoke cả phiên, gồm access JWT đang còn hạn. Logout revoke phiên và clear cookies. Web gộp refresh trong mỗi tab, không retry mutation tự động; nếu nhiều tab refresh đồng thời, policy nghiêm ngặt có thể yêu cầu đăng nhập lại. Không trả token trong JSON hoặc lưu localStorage. Login bị rate limit theo email chuẩn hóa + IP trong một API instance; trước khi scale cần shared throttler storage.

## Cấu trúc

```text
apps/
  api/
    prisma/                 # schema, SQL migrations, seed
    src/
      auth/                 # cookies, rotation, guards, policies
      common/               # validation, errors, request metadata
      config/               # Zod environment validation
      database/             # Prisma lifecycle
      health/               # liveness, DB readiness
      restaurant/           # dashboard thật + scope
      generated/            # Prisma, không commit
    test/                   # integration HTTP với PostgreSQL thật
  web/
    src/app/(auth)/staff/login/
    src/app/(workspace)/staff/dashboard/
    src/components/ui/      # shadcn-style primitives
    src/features/auth/
    src/lib/                # typed API client
packages/shared/            # DTO Zod, role labels, domain state machines
docs/                       # ERD, state models, roadmap, hướng dẫn
scripts/                    # tạo env local, smoke checks
compose.yaml                # PostgreSQL, Redis, MinIO tùy profile
```

Nest bổ sung modules tables, dining-sessions, menu, orders, kitchen, payments, realtime, reports, storage, audit khi phase tương ứng bắt đầu. Không tạo module rỗng để giả hoàn thành.

## Ranh giới transaction cho các phase sau

- Mở bàn: khóa row DiningTable; kiểm tra AVAILABLE; tạo OPEN session; OCCUPIED. Partial unique index chặn hai phiên active trên một bàn.
- Tạo đơn: khóa DiningSession; xác minh GuestSession chưa hết hạn và đúng scope; kiểm tra OPEN; lookup idempotency key + request hash; kiểm tra menu/modifiers; tính giá server; snapshot; tạo đơn/items/audit trong một transaction. Cùng key và payload trả đơn cũ; key khác payload trả 409.
- Menu: update không sửa snapshot của đơn cũ. Archive thay vì xóa dữ liệu đã phát sinh nghiệp vụ.
- Trạng thái: kiểm tra permission + trạng thái hiện tại, compare-and-update trong transaction để tránh stale request. Lưu timestamps và audit.
- Thanh toán: khóa session; từ chối pending/unserved orders theo policy MVP; tổng hợp non-CANCELLED orders; discount/fee/tax cấu hình bằng basis points và làm tròn integer; kiểm tra paidAmount đúng total; tạo COMPLETED payment; CLOSED session; NEEDS_CLEANING table; invalidate guest sessions. Unique payment/session ngăn ghi nhận lần hai. Chỉ cash hoặc bank transfer được thu ngân xác nhận thủ công.
- Không nhận thêm đơn khi PAYMENT_REQUESTED hoặc CLOSED; nhân viên có thể mở lại OPEN trước thanh toán nếu khách muốn gọi thêm. Đóng không thanh toán chỉ với phiên không có đơn tính tiền và lý do audit.

## Lựa chọn phiên bản

Node >=22.12, pnpm 9; Next.js 16.4 / React 19.3; NestJS 12.1; TypeScript 6 strict; Prisma **7.10 stable** (không lấy dist-tag latest đang trỏ Prisma 8 RC), pg adapter; Tailwind 4; TanStack Query; RHF + Zod. Lockfile cố định phiên bản thực tế. Built-in Node test runner chạy JavaScript đã compile để kiểm thử đúng decorator metadata của Nest.

Tài liệu tham chiếu chính thức: [Next installation](https://nextjs.org/docs/app/getting-started/installation), [Nest migration/runtime requirements](https://docs.nestjs.com/migration-guide), [Prisma generator](https://www.prisma.io/docs/orm/v7/prisma-schema/overview/generators), [Prisma pg adapter](https://www.prisma.io/docs/orm/v7/prisma-client/setup-and-configuration/introduction).
