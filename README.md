# TikTok Lead Ads → Bitrix24 CRM

Service NestJS nhận lead từ TikTok Lead Generation qua webhook, chuẩn hóa và loại trùng, đồng bộ sang Bitrix24, tự động convert thành Deal theo rule cấu hình được, rồi báo cáo hiệu quả theo campaign và gửi conversion ngược về TikTok.

**Stack:** NestJS 12 · TypeScript · PostgreSQL 16 + TypeORM 1 · Redis + BullMQ · Swagger · Jest/Supertest · Docker

- Kiến trúc, luồng xử lý, ERD: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)
- Deploy, cấu hình production, troubleshooting: [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)
- OpenAPI export: [docs/swagger.json](docs/swagger.json) (Swagger UI khi app chạy: `http://localhost:3000/docs`)

---

## Chạy nhanh

### Cách 1: Docker Compose

```bash
cp .env.example .env
docker compose up -d --build
docker compose exec app node dist/database/seed.js   # cấu hình mặc định + 30 lead/deal mẫu cho analytics
curl http://localhost:3000/health
```

### Cách 2: Chạy local (Node ≥ 24.9)

```bash
cp .env.example .env
docker compose up -d postgres redis   # hoặc dùng Postgres/Redis có sẵn, sửa .env cho khớp
npm install
npm run migration:run
npm run seed
npm run start:dev
```

Mặc định Bitrix24 và TikTok chạy ở **chế độ mock** (`BITRIX24_MODE=mock`, `TIKTOK_MODE=mock`): mọi API call được log ra console để kiểm tra. Cách kết nối hệ thống thật xem trong [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md).

## Demo từng bước

```bash
KEY='x-api-key: change-me-api-key'

# 1. Nhận và xử lý webhook TikTok (script tự ký TikTok-Signature)
npm run mock:tiktok                      # gửi payload mẫu của đề bài
npm run mock:tiktok -- --count 20        # 20 lead ngẫu nhiên trên 3 campaign
npm run mock:tiktok -- --bad-signature   # -> 401

# 2. Lead đã tạo trong Bitrix24 (log [Bitrix24Mock] crm.lead.add ...) và lưu local
curl -H "$KEY" "localhost:3000/api/v1/leads?page=1&limit=10&source=tiktok"

# 3. Lead khớp rule "campaign_name CONTAINS 'sale'" -> tự động có Deal
curl -H "$KEY" "localhost:3000/api/v1/deals?status=open"
curl -H "$KEY" -X POST localhost:3000/api/v1/leads/<lead-id>/convert-to-deal \
     -H 'Content-Type: application/json' -d '{"stage_id":"PREPARATION","amount":5000000}'

# Giả lập Bitrix24 báo deal đã WON -> cập nhật stage, gửi conversion event về TikTok
curl -X POST localhost:3000/webhooks/bitrix24/deals \
  -d 'event=ONCRMDEALUPDATE&data[FIELDS][ID]=<deal-bitrix24-id>&data[FIELDS][STAGE_ID]=C1:WON&data[FIELDS][OPPORTUNITY]=8000000&auth[application_token]=change-me-bitrix-token'

# 4. Analytics
curl -H "$KEY" "localhost:3000/api/v1/analytics/conversion-rates?date_range=30d"
curl -H "$KEY" "localhost:3000/api/v1/analytics/campaign-performance?date_range=30d"
curl -H "$KEY" "localhost:3000/api/v1/analytics/dashboard"

# 5. Export
curl -H "$KEY" "localhost:3000/api/v1/reports/export?format=csv&date_range=30d" -o leads.csv
curl -H "$KEY" "localhost:3000/api/v1/reports/export?format=json&date_range=30d"

# 6. Health check
curl localhost:3000/health
```

## API

Header `x-api-key` bắt buộc cho `/api/v1/*`. Webhook dùng cơ chế xác thực riêng (chữ ký / token).

| Method | Path | Mô tả |
| --- | --- | --- |
| POST | `/webhooks/tiktok/leads` | Webhook TikTok (`TikTok-Signature: t=<unix>,s=<hmac>`), trả `202` |
| POST | `/webhooks/bitrix24/deals` | Outgoing webhook Bitrix24 `ONCRMDEALUPDATE` |
| GET | `/api/v1/leads?page&limit&source&status&campaign_id` | Danh sách lead |
| POST | `/api/v1/leads/:id/convert-to-deal` | Convert thủ công (tham số trống lấy theo rule) |
| POST | `/api/v1/leads/import` | Batch import dữ liệu lịch sử (tối đa 1000/lần) |
| GET | `/api/v1/deals?status&assigned_to&page&limit` | Danh sách deal |
| GET / PUT | `/api/v1/config/mappings` | Mapping field TikTok → Bitrix24 |
| GET / PUT | `/api/v1/config/rules` | Deal rules + pipeline stages |
| GET / PUT | `/api/v1/config/campaign-spend` | Chi phí campaign (tính CPL/ROI) |
| GET | `/api/v1/analytics/conversion-rates?date_range=30d` | Funnel lead → deal → won |
| GET | `/api/v1/analytics/campaign-performance?date_range=30d` | Lead, score TB, doanh thu, CPL, ROI theo campaign |
| GET | `/api/v1/analytics/dashboard` | Số liệu real-time (lead hôm nay, deal theo trạng thái, queue) |
| GET | `/api/v1/reports/export?format=csv\|json&date_range=30d` | Export lead + deal |
| GET / POST | `/api/v1/jobs/dead-letters`, `/api/v1/jobs/dead-letters/retry` | Xem / chạy lại job lỗi |
| GET | `/health`, `/health/live` | Readiness (DB + Redis) / liveness |

`date_range` nhận `Nd`, `Nh` hoặc `all`.

## Cấu hình mapping và rule

Mapping là đường dẫn trong payload → field Bitrix24. Ngoài field trong payload còn dùng được `answers.<câu hỏi>` (custom questions) và `lead.score`, `lead.submissions`:

```json
{
  "field_mapping": {
    "lead_data.full_name": "NAME",
    "lead_data.email": "EMAIL[0][VALUE]",
    "lead_data.phone": "PHONE[0][VALUE]",
    "answers.Budget range": "UF_CRM_BUDGET"
  }
}
```

Rule được xét theo thứ tự, rule **đầu tiên** khớp sẽ được áp dụng. Cú pháp điều kiện: `<path> <OP> <value> [AND ...]`, với OP là `CONTAINS`, `NOT CONTAINS`, `=`, `!=`, `>`, `>=`, `<`, `<=` (so sánh chuỗi không phân biệt hoa thường).

```json
{
  "deal_rules": [
    {
      "condition": "campaign.campaign_name CONTAINS 'sale' AND lead.score >= 50",
      "action": "create_deal",
      "pipeline_id": "1",
      "stage_id": "NEW",
      "probability": 30,
      "assigned_to": ["5", "7"]
    }
  ],
  "pipeline_stages": [{ "id": "NEW", "probability": 10 }, { "id": "WON", "probability": 100, "semantic": "won" }]
}
```

- **Probability:** lấy `probability` của rule, nếu không có thì lấy theo stage trong `pipeline_stages`. Khi Bitrix24 báo đổi stage, probability cập nhật theo stage mới (WON = 100, LOSE = 0).
- **Assign:** `assigned_to` là một user ID cố định, hoặc một mảng để chia đều kiểu round-robin (bộ đếm trên Redis nên vẫn đúng khi chạy nhiều instance). Không khai báo thì dùng `BITRIX24_DEFAULT_ASSIGNEE`.
- Rule sai cú pháp bị từ chối ngay khi `PUT` (`400`).

## Các quyết định kỹ thuật

**Webhook trả 202, xử lý qua queue.** Endpoint chỉ kiểm tra chữ ký, validate, lưu raw payload vào `webhook_events` rồi đẩy job vào BullMQ, nên TikTok nhận phản hồi trong vài ms và không mất lead khi Bitrix24 chậm hoặc lỗi.

**Idempotency nhiều lớp.** `event_id` là unique key của `webhook_events` và là `jobId` của BullMQ, nên event gửi lại không bị xử lý 2 lần. Mỗi bước trong processor đều an toàn khi retry: không tăng `submissions` hai lần, lead đã có `bitrix24_id` thì update thay vì add, deal đã tồn tại thì chỉ đẩy phần còn thiếu. Trạng thái `processed` được ghi ở bước cuối cùng.

**Dedupe dựa trên database.** Email (lowercase) và phone (chuẩn E.164 bằng `libphonenumber-js`) có partial unique index. Khi 2 job cùng một người chạy song song, job thua bị lỗi unique, BullMQ retry và lần sau sẽ merge. Không cần distributed lock.

**Merge strategy.** Thông tin hồ sơ và nguồn (tên, thành phố, campaign/ad/form, ttclid) lấy giá trị mới nhất khác rỗng (last-touch). Email/phone chỉ được bổ sung khi đang trống vì đó là khóa dedupe. Khi update lên Bitrix24, app không gửi lại `EMAIL`/`PHONE` vì Bitrix24 sẽ *thêm* giá trị mới thay vì thay thế. Mỗi lần submit đều ghi một comment vào timeline của lead.

**Retry và dead-letter queue.** Mỗi job retry 5 lần với exponential backoff (2s, 4s, 8s...). Lỗi dữ liệu (không có email/phone hợp lệ) ném `UnrecoverableError` để đi thẳng vào DLQ, không retry vô ích. Job vào DLQ sẽ kèm notification và có API để chạy lại.

**Lead score (0-100)** tính theo mức độ engagement: có email (+15), có phone (+20), có city (+5), có ttclid (+10), mỗi câu hỏi tùy chỉnh đã trả lời (+10, tối đa 30), mỗi sở thích (+5, tối đa 15), mỗi lần submit lặp lại (+10, tối đa 20).

**Mock bằng cách thay transport.** `Bitrix24Service` gọi qua interface `Bitrix24Transport`: bản `live` gọi REST API thật qua inbound webhook, bản `mock` lưu in-memory và log mọi call. Business logic không cần biết đang chạy mock hay thật.

**Cấu hình runtime trong DB, cache Redis 5 phút**, cache bị xóa ngay khi `PUT`. Analytics cache 60 giây, riêng dashboard không cache. Redis lỗi thì cache tự bỏ qua và đọc thẳng DB, không làm hỏng request.

**Bảo mật.** API key so sánh constant-time. Chữ ký TikTok là HMAC-SHA256 trên raw body kèm timestamp để chống replay. Bitrix24 webhook xác thực bằng `application_token`. Rate limit 100 req/phút/IP, webhook được nới lên 1000. PII gửi về TikTok được hash SHA-256 theo yêu cầu của Events API.

**Phiên bản.** Dùng NestJS 12 (bản mới nhất, ESM-only). Project vẫn là CommonJS nhờ `require(esm)` của Node, nên cần **Node ≥ 24.9** (Jest chỉ hỗ trợ `require(esm)` từ phiên bản này). TypeORM 1.x không cho `undefined` trong `where`; app giữ hành vi chặt này để tránh vô tình match mọi bản ghi.

### Giả định

- Đề bài không nêu định dạng `TikTok-Signature`, app dùng `t=<unix>,s=<hex HMAC-SHA256(secret, "<t>.<raw body>")>`. Logic nằm gọn trong [src/webhooks/tiktok-signature.ts](src/webhooks/tiktok-signature.ts) nên dễ đổi.
- Event xử lý thành lead: `lead.generate`, `lead.submit`, `form.complete`. Các event khác (ví dụ `user.interaction`) chỉ lưu lại để audit.
- Chi phí quảng cáo nhập qua `PUT /api/v1/config/campaign-spend`, chưa kéo tự động từ TikTok Marketing API.
- "Excel" được đáp ứng bằng CSV có BOM UTF-8, mở trực tiếp bằng Excel vẫn đúng tiếng Việt.
- API quản trị dùng API key (stateless) nên không có session. Redis dùng cho cache, queue và bộ đếm round-robin.

## Testing

```bash
npm test             # unit test, không cần DB
npm run test:e2e     # e2e/integration bằng Supertest: cần Postgres + Redis (docker compose up -d postgres redis)
npm run test:cov     # unit + e2e kèm coverage report (coverage/lcov-report/index.html)
npm run lint
```

E2E test khởi động toàn bộ `AppModule` trên Postgres + Redis thật (DB `tiktok_bitrix_test`, Redis DB 15) và đi qua toàn bộ luồng demo: chữ ký sai, payload sai, webhook → lead → Bitrix24 → deal, event trùng, dedupe theo phone, deal WON → sync TikTok, analytics, export, cấu hình, dead-letter, batch import.

Kết quả gần nhất: **121 test pass** (109 unit + 12 e2e), coverage trên toàn bộ `src` (trừ bootstrap, module wiring, entity/DTO, migration):

| Statements | Branches | Functions | Lines |
| --- | --- | --- | --- |
| 99.6% | 88.0% | 98.2% | 99.7% |

Riêng unit test (không DB): 99.4% statements / 87.5% branches. Ngưỡng tối thiểu cấu hình trong `jest.config.ts`: 80% (statements/lines/functions), 70% branches.

Chất lượng code: ESLint (typescript-eslint, type-checked) + Prettier. Husky chạy `lint-staged` khi `pre-commit` và `npm test` khi `pre-push`. GitHub Actions chạy lint, build và test có coverage với Postgres/Redis service.

## Cấu trúc thư mục

```
src/
  webhooks/      endpoint webhook + guard chữ ký/token
  leads/         raw event, queue processor, chuẩn hóa/dedupe/scoring, mapping Bitrix24
  deals/         rule engine, tạo deal, assign, sync stage, sync TikTok
  settings/      cấu hình runtime (mapping, rules, stages, chi phí)
  analytics/     báo cáo, dashboard, export, scheduler
  jobs/          queue, dead-letter queue
  integrations/  Bitrix24 (live/mock), TikTok Events API (live/mock)
  common/        redis, cache, notification, guard, filter, interceptor
  health/        health check
  database/      data source, migrations, seed
scripts/         mock TikTok webhook sender, payload mẫu
test/            e2e test
docs/            kiến trúc, ERD, deployment, swagger.json
```

## Đề xuất cho production

- **Secrets & hạ tầng:** đưa secret vào Vault/Secret Manager; dùng Postgres/Redis managed có backup; Redis bật AOF; chạy migration như một bước riêng của CD.
- **Rate limit phân tán:** throttler hiện lưu in-memory, khi chạy nhiều instance nên chuyển sang Redis storage.
- **Tách worker:** chạy API và worker thành 2 deployment để scale độc lập; chỉ một instance chạy scheduler, hoặc dùng BullMQ repeatable job.
- **Bitrix24:** dùng OAuth app thay cho inbound webhook; thêm rate limiter ở client (2 req/s) và `crm.duplicate.findbycomm` để dedupe cả với lead tạo tay trên Bitrix24; batch call (`batch`) khi import lớn.
- **Observability:** structured JSON log (pino) có correlation id theo `event_id`, metrics Prometheus (độ dài queue, tỷ lệ lỗi, latency Bitrix24), tracing OpenTelemetry (BullMQ có sẵn hỗ trợ), alert qua Grafana thay cho cron alert đơn giản.
- **Dữ liệu:** chính sách lưu giữ/ẩn danh PII trong `raw_data` (GDPR/Nghị định 13), partition `webhook_events` theo tháng, thêm materialized view cho báo cáo khi dữ liệu lớn.
- **Analytics:** kéo chi phí tự động từ TikTok Marketing API; export Excel `.xlsx` thật nếu cần định dạng; dashboard real-time qua SSE/WebSocket.
- **Bảo mật API:** thay API key bằng JWT/OAuth2 có phân quyền; IP allowlist cho webhook.
