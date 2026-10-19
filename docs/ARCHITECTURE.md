# Kiến trúc

## Tổng quan

```mermaid
flowchart LR
    TT[TikTok Lead Ads] -- "webhook + TikTok-Signature" --> WH[WebhooksController]
    B24[(Bitrix24 CRM)] -- "ONCRMDEALUPDATE" --> WH

    subgraph App[NestJS app]
        WH -->|lưu raw event| PG[(PostgreSQL)]
        WH -->|enqueue| QL[[BullMQ: leads]]
        QL --> LP[LeadProcessor<br/>chuẩn hóa · dedupe · scoring]
        LP --> RE[Rule engine]
        RE --> DS[DealsService<br/>pipeline · probability · assign]
        DS --> QT[[BullMQ: tiktok-sync]]
        QL -. "hết retry" .-> DLQ[[BullMQ: dead-letter]]
        QT -. "hết retry" .-> DLQ
        API[REST API /api/v1<br/>leads · deals · config · analytics] --> PG
        API --> C[(Redis cache)]
        CRON[Scheduler<br/>báo cáo ngày · alert] --> NS[NotificationService]
    end

    LP -->|crm.lead.add/update<br/>crm.timeline.comment.add| B24
    DS -->|crm.deal.add<br/>im.notify.system.add| B24
    QT -->|Events API: CompletePayment| TT
    NS --> HOOK[Slack / Chat webhook]
```

## Luồng xử lý một lead

```mermaid
sequenceDiagram
    participant T as TikTok
    participant W as Webhook endpoint
    participant DB as PostgreSQL
    participant Q as BullMQ (leads)
    participant P as LeadProcessor
    participant B as Bitrix24

    T->>W: POST /webhooks/tiktok/leads
    W->>W: Kiểm tra HMAC + timestamp (chống replay)
    W->>DB: INSERT webhook_events ON CONFLICT (event_id) DO NOTHING
    W->>Q: add(jobId = event_id)
    W-->>T: 202 Accepted (vài ms)
    Q->>P: process(event_id)
    P->>P: sanitize, email lowercase, phone E.164, score
    P->>DB: tìm lead theo email rồi phone -> merge hoặc tạo mới
    P->>B: crm.lead.add / crm.lead.update + timeline comment
    P->>P: rule engine trên payload đã chuẩn hóa
    P->>B: crm.deal.add (nếu khớp rule)
    P->>DB: webhook_events.status = processed
    Note over Q,P: Lỗi -> retry 5 lần (exponential backoff),<br/>vẫn lỗi hoặc dữ liệu sai -> dead-letter queue + notify
```

## Module

| Module | Trách nhiệm |
| --- | --- |
| `webhooks` | Endpoint nhận webhook TikTok/Bitrix24, guard xác thực chữ ký/token |
| `leads` | Lưu raw event, queue processor, chuẩn hóa, dedupe/merge, đồng bộ Bitrix24, list/import API |
| `deals` | Rule engine, tạo deal, round-robin assign, sync stage từ Bitrix24, gửi conversion về TikTok |
| `settings` | Cấu hình runtime (field mapping, rules, pipeline stages, chi phí campaign) trong DB + cache Redis |
| `analytics` | Conversion rate, CPL/ROI, dashboard, export CSV/JSON, báo cáo định kỳ & alert |
| `jobs` | Đăng ký queue, dead-letter queue và API retry |
| `integrations` | Client Bitrix24 (live REST / mock in-memory) và TikTok Events API (live / mock) |
| `common` | Redis, cache, notification, API-key guard, exception filter, logging interceptor |
| `health` | `/health` (DB + Redis) và `/health/live` |

## Database ERD

```mermaid
erDiagram
    leads ||--o| deals : "convert (tối đa 1 deal)"
    leads ||--o{ webhook_events : "lead_id"

    leads {
        uuid id PK
        varchar external_id UK "event_id đầu tiên"
        varchar source
        varchar name
        varchar email UK "partial unique (NOT NULL)"
        varchar phone UK "E.164, partial unique"
        varchar city
        varchar campaign_id "index"
        varchar campaign_name
        varchar ad_id
        varchar ad_name
        varchar form_id
        varchar ttclid
        int score "0-100"
        int submissions
        jsonb raw_data
        int bitrix24_id
        varchar status "new | synced | converted (index)"
        timestamptz created_at "index"
        timestamptz updated_at
    }
    deals {
        uuid id PK
        uuid lead_id FK,UK
        int bitrix24_id "index"
        varchar title
        decimal amount
        varchar currency
        varchar pipeline_id
        varchar stage
        int probability
        varchar status "open | won | lost"
        varchar assigned_to "index (status, assigned_to)"
        timestamptz closed_at
        timestamptz tiktok_synced_at
        timestamptz created_at
        timestamptz updated_at
    }
    webhook_events {
        uuid id PK
        varchar event_id UK "idempotency key"
        varchar source
        varchar event_type
        jsonb payload "raw để audit"
        varchar status "received | processed | recorded | failed"
        text error
        uuid lead_id
        timestamptz created_at
        timestamptz processed_at
    }
    configurations {
        serial id PK
        varchar key UK
        jsonb value
        timestamptz updated_at
    }
```

### Index và lý do

- `uq_leads_email`, `uq_leads_phone` (partial unique): vừa tăng tốc tra cứu dedupe, vừa chặn tạo trùng khi 2 job xử lý cùng một người song song. Job "thua" sẽ lỗi unique, BullMQ retry và lần sau sẽ merge.
- `webhook_events.event_id` unique: idempotency, TikTok gửi lại cùng event thì không xử lý 2 lần.
- `deals.lead_id` unique: mỗi lead tối đa 1 deal, convert lặp lại an toàn.
- `leads(campaign_id)`, `leads(created_at)`: phục vụ báo cáo theo campaign và khoảng thời gian.
- `deals(status, assigned_to)`: khớp với filter của `GET /api/v1/deals?status=&assigned_to=`.
- `deals(bitrix24_id)`: tra cứu khi nhận webhook từ Bitrix24.

Schema giữ nguyên các cột của đề bài, chỉ thêm cột cần cho tính năng (`score`, `submissions`, `status` của deal, `tiktok_synced_at`...) và bảng `webhook_events` để audit.
