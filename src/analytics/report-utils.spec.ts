import { BadRequestException } from '@nestjs/common';
import { parseDateRange, ratio, toCsv } from './report-utils';

describe('report-utils', () => {
  const now = new Date('2026-01-31T00:00:00Z');

  it('parses date ranges', () => {
    expect(parseDateRange('30d', now).toISOString()).toBe(
      '2026-01-01T00:00:00.000Z',
    );
    expect(parseDateRange('12h', now).toISOString()).toBe(
      '2026-01-30T12:00:00.000Z',
    );
    expect(parseDateRange('all', now).getTime()).toBe(0);
    expect(parseDateRange(undefined, now).toISOString()).toBe(
      '2026-01-01T00:00:00.000Z',
    );
    expect(() => parseDateRange('1y', now)).toThrow(BadRequestException);
  });

  it('computes ratios safely', () => {
    expect(ratio(1, 3)).toBe(0.3333);
    expect(ratio(5, 0)).toBe(0);
  });

  it('builds CSV with BOM and escaping', () => {
    const csv = toCsv([
      {
        name: 'Nguyễn, A',
        note: 'say "hi"',
        at: new Date('2026-01-01T00:00:00Z'),
        empty: null,
      },
    ]);
    expect(csv).toBe(
      '\uFEFFname,note,at,empty\r\n"Nguyễn, A","say ""hi""",2026-01-01T00:00:00.000Z,',
    );
    expect(toCsv([])).toBe('\uFEFF');
  });
});
