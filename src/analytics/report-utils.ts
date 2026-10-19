import { BadRequestException } from '@nestjs/common';
import { toText } from '../common/object-path';

/** '30d' | '12h' | 'all' -> mốc thời gian bắt đầu. */
export function parseDateRange(range = '30d', now = new Date()): Date {
  if (range === 'all') return new Date(0);
  const match = /^(\d{1,4})([dh])$/.exec(range);
  if (!match)
    throw new BadRequestException('date_range phải có dạng 30d, 24h hoặc all');
  const hours = Number(match[1]) * (match[2] === 'd' ? 24 : 1);
  return new Date(now.getTime() - hours * 3_600_000);
}

export const ratio = (num: number, den: number) =>
  den > 0 ? Math.round((num / den) * 10_000) / 10_000 : 0;

function csvCell(value: unknown): string {
  if (value === null || value === undefined) return '';
  const text = value instanceof Date ? value.toISOString() : toText(value);
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/** CSV có BOM UTF-8 để Excel hiển thị đúng tiếng Việt. */
export function toCsv(rows: Record<string, unknown>[]): string {
  if (rows.length === 0) return '\uFEFF';
  const headers = Object.keys(rows[0]);
  const lines = rows.map((row) =>
    headers.map((h) => csvCell(row[h])).join(','),
  );
  return '\uFEFF' + [headers.join(','), ...lines].join('\r\n');
}
