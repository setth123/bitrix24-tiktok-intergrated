import { signTiktokPayload, verifyTiktokSignature } from './tiktok-signature';

describe('tiktok-signature', () => {
  const body = Buffer.from('{"event":"lead.generate"}');
  const now = 1_700_000_000;

  it('accepts a valid signature', () => {
    const header = signTiktokPayload(body, 'secret', now);
    expect(header).toMatch(/^t=1700000000,s=[0-9a-f]{64}$/);
    expect(verifyTiktokSignature(body, header, 'secret', 300, now + 10)).toBe(
      true,
    );
  });

  it('rejects wrong secret, tampered body, old timestamp and malformed headers', () => {
    const header = signTiktokPayload(body, 'secret', now);
    expect(verifyTiktokSignature(body, header, 'other', 300, now)).toBe(false);
    expect(
      verifyTiktokSignature(Buffer.from('{}'), header, 'secret', 300, now),
    ).toBe(false);
    expect(verifyTiktokSignature(body, header, 'secret', 300, now + 301)).toBe(
      false,
    );
    expect(verifyTiktokSignature(body, undefined, 'secret', 300, now)).toBe(
      false,
    );
    expect(verifyTiktokSignature(body, header, '', 300, now)).toBe(false);
    expect(verifyTiktokSignature(body, 'garbage', 'secret', 300, now)).toBe(
      false,
    );
    expect(
      verifyTiktokSignature(body, `t=${now},s=abcd`, 'secret', 300, now),
    ).toBe(false);
  });
});
