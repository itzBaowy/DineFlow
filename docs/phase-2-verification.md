# Phase 2 — Restaurant Setup verification

Kiểm chứng local ngày 2026-10-08, Windows, Node 22.19, pnpm 9.15.9; PostgreSQL 17, Redis 7, MinIO source-built security release 2025-10-15. Google Stitch project được tái sử dụng cho menu và bàn/QR; giao diện Next.js kết nối NestJS/PostgreSQL/MinIO thật.

| Kiểm tra | Kết quả |
|---|---|
| Migrate dev và database test | 3 migrations áp dụng thành công; thêm MediaAsset |
| Compose / pnpm infra:up | PostgreSQL, Redis, MinIO healthy |
| Lint, typecheck, production build | Thành công cho shared/API/web |
| Unit/domain tests | 9 passed: 6 shared, 3 API |
| Integration HTTP + PostgreSQL + MinIO | 20 passed: 18 scenarios và 2 parent tests |
| Chromium browser | 4 desktop/mobile flows passed, gồm 2 foundation flows |
| QR | PNG được decode thành đúng URL công khai; SVG trả về hợp lệ; mã cũ trả 404 sau regenerate |
| Images | Multipart RBAC/CSRF, giả MIME, file hỏng, SVG và quá 5MB bị từ chối; WebP upload/download qua MinIO thật |
| Visual QA | Xem trực tiếp screenshots desktop/mobile và trang PDF nhãn A4 |

Đã triển khai restaurant settings (logo, thông tin, timezone, phí/thuế), category/menu/modifier CRUD với archive, bật/tắt bán, sắp xếp; quản lý bàn, tạo/download PNG/SVG và in các nhãn QR đã chọn. Không sửa/đổi mã/lưu trữ bàn có phiên đang mở hoặc chưa ở trạng thái sẵn sàng/tạm ngưng. Archive category còn món hoặc modifier group còn gắn với món đang hoạt động trả 409. Mutations khóa restaurant để reference validation và archive không chạy đua; thay đổi và ActivityLog commit trong cùng transaction.

Upload chỉ nhận JPEG/PNG/WebP, kiểm tra decoder và MIME thực tế, giới hạn 16MP, bỏ metadata, chuẩn hóa WebP tối đa 1600px. S3 credentials chỉ nằm ở backend. Ảnh gắn vào món/logo phải là MediaAsset thuộc nhà hàng hiện tại. Bucket private, ảnh được phục vụ qua public endpoint dùng UUID; không cho client truyền arbitrary object key hoặc URL ngoại. Ảnh món và logo là nội dung công khai, không dùng endpoint này cho tài liệu riêng tư. Upload bị lỗi ghi DB sẽ dọn object; chưa có job dọn ảnh đã upload nhưng bỏ dở hoặc ảnh lịch sử.

Browser test tạo fixtures bằng UI, xác minh dữ liệu sau reload, upload ảnh, thay đổi giá/trạng thái, tạo bàn, download QR, chọn in A4, regenerate QR, chỉnh thông tin rồi khôi phục. Fixtures được archive qua API; dữ liệu seed giữ số lượng ban đầu. Screenshots, PDF QA và traces nằm trong `.local/qa` / test-results, không commit. Các lỗi selector nhãn danh mục và MIME của ảnh tham chiếu trong test đã được sửa; không bỏ qua validation backend.

`/t/[tableCode]` hiện hiển thị nhà hàng và bàn hợp lệ, cùng thông báo gọi nhân viên. Chưa mở phiên/guest session, menu khách, giỏ hàng hay nhận đơn: thuộc Phase 3. Không công bố MVP ordering đã hoàn tất.

Chưa kiểm chứng Safari/Firefox, máy in vật lý, truy cập bằng điện thoại trên LAN, HTTPS/deployment, production S3, nhiều backend instance hoặc toàn bộ ordering E2E. Readiness hiện kiểm tra DB; storage lỗi trả 503 khi upload/tải ảnh. Để QR dùng trên điện thoại, cấu hình APP_ORIGIN là origin truy cập được từ điện thoại, đồng bộ API_INTERNAL_URL và restart web/API trước khi tải/in QR.

MinIO local được build từ source theo [hướng dẫn security release chính thức](https://github.com/minio/minio/releases/tag/RELEASE.2025-10-15T17-29-55Z); giữ license AGPL trong image. Community repository đã archive; production storage và chính sách cập nhật cần được chọn/kiểm chứng ở Phase 8. S3 abstraction dùng [AWS SDK v3](https://docs.aws.amazon.com/sdk-for-javascript/v3/developer-guide/javascript_s3_code_examples.html).
