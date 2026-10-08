# Quy ước đóng góp

Commit theo Conventional Commits, tiêu đề tiếng Anh, ngắn gọn và mô tả kết quả:

```text
type(scope): description
```

Types: `feat`, `fix`, `docs`, `test`, `refactor`, `chore`, `build`, `ci`. Scope ví dụ `api`, `auth`, `web`, `db`, `workspace`; có thể bỏ scope với thay đổi toàn dự án. Breaking change dùng `!` và giải thích trong body. Không dùng commit chung chung như `update`, `fix bug`, `changes`.

Stage từng nhóm file liên quan đến một thay đổi, review staged diff rồi commit. Trong phiên làm việc hiện tại, chủ repository yêu cầu push các commit hoàn thành lên `main`; không force-push hoặc rewrite lịch sử remote. Fetch và kiểm tra ahead/behind trước khi push; nếu remote có thay đổi mới, tích hợp và kiểm tra lại.

Không commit `.env`, secrets, generated Prisma client, node_modules, build artifacts hay browser traces. `.env.example` chỉ chứa placeholders; demo password được sinh local.

Code thay đổi cần lint/typecheck/build và tests phù hợp. Foundation auth cần integration với PostgreSQL thật; giao diện cần browser flow desktop/mobile. Chỉ ghi tính năng đã kiểm chứng trong tài liệu, giữ đúng roadmap từng phase của Requirement.md.
