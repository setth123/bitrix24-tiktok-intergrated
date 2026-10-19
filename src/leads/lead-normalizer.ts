import { isEmail } from 'class-validator';
import { CountryCode, parsePhoneNumberFromString } from 'libphonenumber-js';
import type { TiktokWebhookDto } from './dto/tiktok-webhook.dto';

export interface NormalizedLead {
  name: string;
  email: string | null;
  phone: string | null;
  city: string | null;
  campaignId: string | null;
  campaignName: string | null;
  adId: string | null;
  adName: string | null;
  formId: string | null;
  formName: string | null;
  ttclid: string | null;
  interests: string[];
  /** custom_questions dạng { "Budget range": "5-10 triệu VND" } */
  answers: Record<string, string>;
}

/** Bỏ thẻ HTML, ký tự điều khiển, khoảng trắng thừa; cắt độ dài. */
export function sanitizeText(value: unknown, maxLength = 255): string | null {
  if (typeof value !== 'string' && typeof value !== 'number') return null;
  const text = String(value)
    .normalize('NFC')
    .replace(/<[^>]*>/g, ' ')
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001F\u007F]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return text ? text.slice(0, maxLength) : null;
}

export function normalizeEmail(value: unknown): string | null {
  const email = sanitizeText(value)?.toLowerCase().replace(/\s/g, '');
  return email && isEmail(email) ? email : null;
}

/** Chuẩn hóa số điện thoại về E.164 (+84901234567). Số không hợp lệ -> null. */
export function normalizePhone(
  value: unknown,
  defaultCountry = 'VN',
): string | null {
  const raw = sanitizeText(value);
  if (!raw) return null;
  const phone = parsePhoneNumberFromString(raw, defaultCountry as CountryCode);
  return phone?.isValid() ? phone.number : null;
}

export function normalizeLead(
  payload: TiktokWebhookDto,
  defaultCountry = 'VN',
): NormalizedLead {
  const data = payload.lead_data ?? {};
  const email = normalizeEmail(data.email);
  const phone = normalizePhone(data.phone, defaultCountry);
  const answers: Record<string, string> = {};
  for (const q of payload.custom_questions ?? []) {
    const question = sanitizeText(q.question, 100);
    const answer = sanitizeText(q.answer, 1000);
    if (question && answer) answers[question] = answer;
  }

  return {
    name:
      sanitizeText(data.full_name) ??
      email?.split('@')[0] ??
      phone ??
      'TikTok Lead',
    email,
    phone,
    city: sanitizeText(data.city),
    campaignId: sanitizeText(payload.campaign?.campaign_id),
    campaignName: sanitizeText(payload.campaign?.campaign_name),
    adId: sanitizeText(payload.campaign?.ad_id),
    adName: sanitizeText(payload.campaign?.ad_name),
    formId: sanitizeText(payload.form?.form_id),
    formName: sanitizeText(payload.form?.form_name),
    ttclid: sanitizeText(data.ttclid),
    interests: (data.interests ?? [])
      .map((i) => sanitizeText(i, 100))
      .filter((i): i is string => !!i),
    answers,
  };
}

/**
 * Điểm chất lượng lead (0-100) dựa trên mức độ engagement:
 * thông tin liên hệ đầy đủ, số câu hỏi tùy chỉnh đã trả lời, sở thích,
 * có click id quảng cáo và số lần submit lặp lại.
 */
export function scoreLead(lead: NormalizedLead, submissions = 1): number {
  let score = 0;
  if (lead.email) score += 15;
  if (lead.phone) score += 20;
  if (lead.city) score += 5;
  if (lead.ttclid) score += 10;
  score += Math.min(Object.keys(lead.answers).length * 10, 30);
  score += Math.min(lead.interests.length * 5, 15);
  score += Math.min((submissions - 1) * 10, 20);
  return Math.min(score, 100);
}
