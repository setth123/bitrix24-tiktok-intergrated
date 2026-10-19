import { UnauthorizedException } from '@nestjs/common';
import { testConfig } from '../test-utils';
import { signTiktokPayload } from './tiktok-signature';
import { Bitrix24TokenGuard, TiktokSignatureGuard } from './webhook.guards';
import { WebhooksController } from './webhooks.controller';

const ctx = (req: object) =>
  ({ switchToHttp: () => ({ getRequest: () => req }) }) as any;

describe('TiktokSignatureGuard', () => {
  const guard = new TiktokSignatureGuard(
    testConfig({
      tiktok: { webhookSecret: 'secret', signatureToleranceSec: 300 },
    }),
  );
  const rawBody = Buffer.from('{"a":1}');

  it('accepts valid signatures and rejects invalid ones', () => {
    const signature = signTiktokPayload(rawBody, 'secret');
    expect(guard.canActivate(ctx({ rawBody, header: () => signature }))).toBe(
      true,
    );
    expect(() =>
      guard.canActivate(ctx({ rawBody, header: () => 't=1,s=00' })),
    ).toThrow(UnauthorizedException);
    expect(() => guard.canActivate(ctx({ header: () => signature }))).toThrow(
      UnauthorizedException,
    );
  });
});

describe('Bitrix24TokenGuard', () => {
  it('checks auth[application_token]', () => {
    const guard = new Bitrix24TokenGuard(
      testConfig({ bitrix24: { appToken: 'tok' } }),
    );
    expect(
      guard.canActivate(ctx({ body: { auth: { application_token: 'tok' } } })),
    ).toBe(true);
    expect(() =>
      guard.canActivate(ctx({ body: { auth: { application_token: 'bad' } } })),
    ).toThrow(UnauthorizedException);
    expect(() => guard.canActivate(ctx({ body: undefined }))).toThrow(
      UnauthorizedException,
    );
    const unconfigured = new Bitrix24TokenGuard(
      testConfig({ bitrix24: { appToken: '' } }),
    );
    expect(() =>
      unconfigured.canActivate(
        ctx({ body: { auth: { application_token: '' } } }),
      ),
    ).toThrow(UnauthorizedException);
  });
});

describe('WebhooksController', () => {
  const leads = { ingest: jest.fn().mockResolvedValue('queued') };
  const deals = {
    applyBitrixUpdate: jest.fn().mockResolvedValue({ updated: true }),
  };
  const controller = new WebhooksController(leads as any, deals as any);

  it('ingests TikTok webhooks with the original raw payload', async () => {
    const dto = { event: 'lead.generate', event_id: 'e1', timestamp: 1 };
    const raw = { ...dto, extra_field: 'kept' };
    await expect(
      controller.tiktokLeads(dto, {
        rawBody: Buffer.from(JSON.stringify(raw)),
      } as any),
    ).resolves.toEqual({ status: 'queued', event_id: 'e1' });
    expect(leads.ingest).toHaveBeenCalledWith(dto, raw);
  });

  it('applies Bitrix24 deal updates', async () => {
    await controller.bitrixDeals({
      event: 'ONCRMDEALUPDATE',
      data: { FIELDS: { ID: '9', STAGE_ID: 'WON', OPPORTUNITY: '10' } },
    });
    expect(deals.applyBitrixUpdate).toHaveBeenCalledWith(9, 'WON', '10');
    expect(
      controller.bitrixDeals({ event: 'X', data: { FIELDS: { ID: 'abc' } } }),
    ).toEqual({ updated: false });
  });
});
