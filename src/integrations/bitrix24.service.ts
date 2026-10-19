import { Inject, Injectable, Logger } from '@nestjs/common';
import { BITRIX24_TRANSPORT } from './integrations.constants';
import type { Bitrix24Transport } from './bitrix24.transport';

export type BitrixFields = Record<string, unknown>;

/** Các thao tác CRM cần dùng, xây trên Bitrix24 REST API. */
@Injectable()
export class Bitrix24Service {
  private readonly logger = new Logger(Bitrix24Service.name);

  constructor(
    @Inject(BITRIX24_TRANSPORT) private readonly transport: Bitrix24Transport,
  ) {}

  async addLead(fields: BitrixFields): Promise<number> {
    const id = await this.transport.call<number | string>('crm.lead.add', {
      fields,
      params: { REGISTER_SONET_EVENT: 'Y' },
    });
    return Number(id);
  }

  async updateLead(id: number, fields: BitrixFields): Promise<void> {
    await this.transport.call('crm.lead.update', { id, fields });
  }

  async addDeal(fields: BitrixFields): Promise<number> {
    const id = await this.transport.call<number | string>('crm.deal.add', {
      fields,
      params: { REGISTER_SONET_EVENT: 'Y' },
    });
    return Number(id);
  }

  getDeal(id: number): Promise<BitrixFields> {
    return this.transport.call<BitrixFields>('crm.deal.get', { id });
  }

  /** Ghi comment vào timeline của Lead/Deal (source tracking). */
  async addTimelineComment(
    entityType: 'lead' | 'deal',
    entityId: number,
    comment: string,
  ): Promise<void> {
    await this.transport.call('crm.timeline.comment.add', {
      fields: {
        ENTITY_ID: entityId,
        ENTITY_TYPE: entityType,
        COMMENT: comment,
      },
    });
  }

  /** Thông báo trong Bitrix24 cho user (best-effort, không throw). */
  async notifyUser(userId: string, message: string): Promise<void> {
    try {
      await this.transport.call('im.notify.system.add', {
        USER_ID: userId,
        MESSAGE: message,
      });
    } catch (err) {
      this.logger.warn(`Cannot notify Bitrix24 user ${userId}: ${String(err)}`);
    }
  }
}
