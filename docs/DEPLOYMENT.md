# Deployment & Troubleshooting

## Deploy bằng Docker Compose (một server)

```bash
cp .env.example .env        # sửa API_KEY, TIKTOK_WEBHOOK_SECRET, BITRIX24_* ...
docker compose up -d --build
docker compose exec app node dist/database/seed.js   # (tùy chọn) cấu hình mặc định + dữ liệu mẫu
curl http://localhost:3000/health
```

- Migration tự chạy khi app khởi động (`DB_MIGRATIONS_RUN=true`). Nếu muốn chạy migration như một bước riêng trong pipeline CD, đặt `DB_MIGRATIONS_RUN=false` rồi chạy `npm run migration:run:prod` trước khi khởi động phiên bản mới.
- Image dùng multi-stage build: chỉ chứa `dist/` và production dependencies, chạy bằng user `node`, có `HEALTHCHECK` gọi `/health`.

## Cấu hình theo môi trường

Mọi cấu hình đi qua biến môi trường (xem `.env.example`). Gợi ý:

| Biến | Dev | Production |
| --- | --- | --- |
| `BITRIX24_MODE` | `mock` | `live` + `BITRIX24_WEBHOOK_URL` |
| `TIKTOK_MODE` | `mock` | `live` + `TIKTOK_ACCESS_TOKEN`, `TIKTOK_EVENT_SOURCE_ID` |
| `API_KEY` | giá trị bất kỳ | secret mạnh, lưu trong secret manager |
| `NOTIFY_WEBHOOK_URL` | trống | Slack/Google Chat incoming webhook |
| `DB_LOGGING` | `true` khi debug | `false` |

## Kết nối Bitrix24 thật

1. Bitrix24 → *Developer resources* → *Other* → **Inbound webhook**, cấp quyền `crm` và `im`. Copy URL dạng `https://<portal>.bitrix24.com/rest/1/<token>/` vào `BITRIX24_WEBHOOK_URL`, đặt `BITRIX24_MODE=live`.
2. Tạo các custom field trong mapping (`UF_CRM_CITY`, `UF_CRM_AD_NAME`, `UF_CRM_TTCLID`, ...) hoặc sửa mapping qua `PUT /api/v1/config/mappings`.
3. **Outgoing webhook** cho sự kiện `ONCRMDEALUPDATE` trỏ tới `https://<app>/webhooks/bitrix24/deals`. Copy *application token* vào `BITRIX24_APP_TOKEN`.
4. Kiểm tra `pipeline_id`/`stage_id` trong rules khớp với pipeline thực tế (pipeline khác 0 có stage dạng `C1:NEW`, app tự thêm prefix).

## Kết nối TikTok thật

- Đăng ký webhook URL `https://<app>/webhooks/tiktok/leads` trong TikTok (cần HTTPS public; khi dev dùng `ngrok http 3000`).
- Đặt `TIKTOK_WEBHOOK_SECRET` trùng với secret dùng để ký. Nếu TikTok dùng định dạng chữ ký khác giả định của app (`t=<unix>,s=<hex>`), chỉ cần sửa `src/webhooks/tiktok-signature.ts`.

## Scale

- App là stateless: chạy nhiều instance sau load balancer được. BullMQ phân phối job qua Redis, round-robin assign dùng bộ đếm trên Redis, dedupe dựa vào unique index của Postgres.
- Có thể tách worker khỏi API (cùng image, khác entrypoint) khi lượng lead lớn.
- Cron (báo cáo/alert) sẽ chạy trên mọi instance. Khi scale ngang, nên chuyển sang BullMQ repeatable job hoặc chỉ bật scheduler trên một instance.

## Troubleshooting

| Triệu chứng | Nguyên nhân thường gặp / cách xử lý |
| --- | --- |
| Webhook trả `401 Invalid TikTok-Signature` | Sai `TIKTOK_WEBHOOK_SECRET`; chữ ký phải tính trên **raw body** đúng từng byte; lệch giờ hơn `TIKTOK_SIGNATURE_TOLERANCE_SEC` (kiểm tra NTP). |
| Webhook trả `400` | Payload sai schema, xem `message` trong response (ví dụ thiếu `event_id`). |
| Webhook `202` nhưng không thấy lead | Xem `SELECT status, error FROM webhook_events ORDER BY created_at DESC`; xem `GET /api/v1/jobs/dead-letters`; kiểm tra Redis đang chạy (`GET /health`). |
| Lead vào dead-letter với lỗi "không có email hoặc số điện thoại" | Dữ liệu từ form không hợp lệ, retry sẽ không giúp gì. Kiểm tra `DEFAULT_PHONE_COUNTRY` nếu số điện thoại không có mã quốc gia. |
| Lỗi Bitrix24 `QUERY_LIMIT_EXCEEDED` | Bitrix24 giới hạn ~2 request/giây. Job tự retry với backoff; giảm `concurrency` trong `leads.processor.ts` nếu gặp thường xuyên. |
| Lead có trên Bitrix24 nhưng không có deal | Không khớp rule nào (xem `GET /api/v1/config/rules`), hoặc convert thủ công bằng `POST /api/v1/leads/:id/convert-to-deal`. |
| Sửa cấu hình nhưng chưa có hiệu lực | Cache cấu hình 5 phút, bị xóa ngay khi `PUT` qua API. Nếu sửa trực tiếp trong DB thì xóa key `tb:cache:config:*` trong Redis. |
| `TypeORMError: Undefined value encountered ... where condition` | TypeORM 1.x không cho `undefined` trong `where`; dùng helper `compact()` khi build filter. |
| Test báo `Must use import to load ES Module` | Cần Node ≥ 24.9 (NestJS 12 là ESM-only, Jest chỉ hỗ trợ `require(esm)` từ Node 24.9). |
| Job bị kẹt sau khi sửa lỗi | `POST /api/v1/jobs/dead-letters/retry` đưa toàn bộ job DLQ về queue gốc. |
