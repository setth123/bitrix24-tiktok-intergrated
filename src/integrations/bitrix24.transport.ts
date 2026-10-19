import { Logger } from '@nestjs/common';

export class Bitrix24Error extends Error {
  constructor(
    readonly method: string,
    readonly code: string,
    description: string,
    /** Lỗi tạm thời (rate limit, 5xx) -> nên retry. */
    readonly retryable: boolean,
  ) {
    super(`Bitrix24 ${method} failed: ${code} ${description}`.trim());
  }
}

export interface Bitrix24Transport {
  call<T = unknown>(
    method: string,
    params: Record<string, unknown>,
  ): Promise<T>;
}

/** Gọi Bitrix24 REST API qua inbound webhook URL (https://<portal>/rest/<user>/<token>). */
export class Bitrix24HttpTransport implements Bitrix24Transport {
  private readonly logger = new Logger('Bitrix24');

  constructor(
    private readonly baseUrl: string,
    private readonly timeoutMs = 10_000,
  ) {}

  async call<T>(method: string, params: Record<string, unknown>): Promise<T> {
    this.logger.debug(`-> ${method}`);
    let res: Response;
    try {
      res = await fetch(`${this.baseUrl.replace(/\/$/, '')}/${method}.json`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(params),
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch (err) {
      throw new Bitrix24Error(method, 'NETWORK', String(err), true);
    }
    const body = (await res.json().catch(() => ({}))) as {
      result?: T;
      error?: string;
      error_description?: string;
    };
    if (!res.ok || body.error) {
      const code = body.error ?? `HTTP_${res.status}`;
      throw new Bitrix24Error(
        method,
        code,
        body.error_description ?? '',
        res.status >= 500 ||
          res.status === 429 ||
          code === 'QUERY_LIMIT_EXCEEDED',
      );
    }
    return body.result as T;
  }
}

/**
 * Mock Bitrix24 chạy in-memory: hỗ trợ các method app dùng, log mọi call để kiểm tra tích hợp.
 * Bật bằng BITRIX24_MODE=mock (mặc định).
 */
export class Bitrix24MockTransport implements Bitrix24Transport {
  private readonly logger = new Logger('Bitrix24Mock');
  // ID tăng dần, bắt đầu theo thời gian để không trùng sau khi restart.
  private seq = Math.floor(Date.now() / 1000) % 1_000_000_000;
  readonly leads = new Map<number, Record<string, unknown>>();
  readonly deals = new Map<number, Record<string, unknown>>();
  readonly calls: { method: string; params: Record<string, unknown> }[] = [];

  // eslint-disable-next-line @typescript-eslint/require-await
  async call<T>(method: string, params: Record<string, unknown>): Promise<T> {
    this.calls.push({ method, params });
    this.logger.log(`${method} ${JSON.stringify(params)}`);
    return this.handle(method, params) as T;
  }

  private handle(method: string, params: Record<string, unknown>): unknown {
    const id = Number(params.id);
    const fields = params.fields as Record<string, unknown>;
    switch (method) {
      case 'crm.lead.add':
        this.leads.set(++this.seq, fields);
        return this.seq;
      case 'crm.deal.add':
        this.deals.set(++this.seq, fields);
        return this.seq;
      case 'crm.lead.update':
      case 'crm.deal.update': {
        const store = method === 'crm.lead.update' ? this.leads : this.deals;
        store.set(id, { ...store.get(id), ...fields });
        return true;
      }
      case 'crm.deal.get': {
        const deal = this.deals.get(id);
        if (!deal)
          throw new Bitrix24Error(method, 'NOT_FOUND', 'Not found', false);
        return { ID: String(id), ...deal };
      }
      case 'crm.timeline.comment.add':
        return ++this.seq;
      case 'im.notify.system.add':
        return true;
      default:
        throw new Bitrix24Error(method, 'METHOD_NOT_FOUND', '', false);
    }
  }
}
