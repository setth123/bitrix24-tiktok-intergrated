import { compact, getPath, setPath } from '../common/object-path';
import { DEFAULT_FIELD_MAPPING } from '../settings/defaults';
import { buildBitrixLeadFields, buildLeadContext } from './bitrix-lead-fields';
import { normalizeLead } from './lead-normalizer';

describe('object-path', () => {
  it('gets and sets nested paths', () => {
    expect(getPath({ a: { b: 1 } }, 'a.b')).toBe(1);
    expect(getPath({ a: null }, 'a.b')).toBeUndefined();
    const obj: Record<string, unknown> = {};
    setPath(obj, 'EMAIL[0][VALUE]', 'x@y.z');
    setPath(obj, 'UF_CRM_CITY', 'HN');
    expect(obj).toEqual({ EMAIL: [{ VALUE: 'x@y.z' }], UF_CRM_CITY: 'HN' });
  });

  it('compacts undefined keys', () => {
    expect(compact({ a: 1, b: undefined, c: null })).toEqual({ a: 1, c: null });
  });
});

describe('buildBitrixLeadFields', () => {
  const payload = {
    event: 'lead.generate',
    event_id: 'e1',
    timestamp: 1,
    campaign: {
      campaign_id: 'c1',
      campaign_name: 'Spring Sale',
      ad_id: 'a1',
      ad_name: 'Demo',
    },
    form: { form_id: 'f1', form_name: 'Contact Form' },
    lead_data: {
      full_name: 'Nguyễn Văn A',
      email: 'A@B.com',
      phone: '0901234567',
      city: 'Hà Nội',
      utm_campaign: 'spring',
      ttclid: 'TT-1',
      interests: ['tech', 'apps'],
    },
    custom_questions: [{ question: 'Budget range', answer: '5-10 triệu' }],
  };
  const lead = normalizeLead(payload);
  const context = buildLeadContext(payload, lead, {
    score: 70,
    submissions: 1,
  });

  it('builds context with normalized values', () => {
    expect(context.lead_data.email).toBe('a@b.com');
    expect(context.lead_data.phone).toBe('+84901234567');
    expect(context.answers).toEqual({ 'Budget range': '5-10 triệu' });
    expect(context.lead.score).toBe(70);
  });

  it('maps fields using the configured mapping', () => {
    const fields = buildBitrixLeadFields(context, lead, {
      ...DEFAULT_FIELD_MAPPING,
      'lead_data.interests': 'UF_CRM_INTERESTS',
      'answers.Budget range': 'UF_CRM_BUDGET',
      'lead_data.missing': 'UF_CRM_MISSING',
    });
    expect(fields).toMatchObject({
      TITLE: 'TikTok: Contact Form - Nguyễn Văn A',
      NAME: 'Nguyễn Văn A',
      EMAIL: [{ VALUE: 'a@b.com', VALUE_TYPE: 'WORK' }],
      PHONE: [{ VALUE: '+84901234567', VALUE_TYPE: 'WORK' }],
      UF_CRM_CITY: 'Hà Nội',
      UF_CRM_UTM_CAMPAIGN: 'Spring Sale',
      UF_CRM_TTCLID: 'TT-1',
      UF_CRM_INTERESTS: 'tech, apps',
      UF_CRM_BUDGET: '5-10 triệu',
      UTM_SOURCE: 'tiktok',
      UTM_CAMPAIGN: 'spring',
      COMMENTS: 'Budget range: 5-10 triệu',
    });
    expect(fields.SOURCE_DESCRIPTION).toContain('campaign: Spring Sale (c1)');
    expect(fields).not.toHaveProperty('UF_CRM_MISSING');
  });

  it('handles minimal payloads', () => {
    const minimal = {
      event: 'x',
      event_id: 'e',
      timestamp: 1,
      lead_data: { email: 'a@b.com' },
    };
    const n = normalizeLead(minimal);
    const fields = buildBitrixLeadFields(
      buildLeadContext(minimal, n, { score: 0, submissions: 1 }),
      n,
      {},
    );
    expect(fields.TITLE).toBe('TikTok: Lead form - a');
    expect(fields.SOURCE_DESCRIPTION).toBe('TikTok Lead Ads');
  });
});
