import {
  normalizeEmail,
  normalizeLead,
  normalizePhone,
  sanitizeText,
  scoreLead,
} from './lead-normalizer';

describe('lead-normalizer', () => {
  it('sanitizes text', () => {
    expect(sanitizeText('  <script>x</script>Nguyễn\u0000  Văn   A ')).toBe(
      'x Nguyễn Văn A',
    );
    expect(sanitizeText(123)).toBe('123');
    expect(sanitizeText('   ')).toBeNull();
    expect(sanitizeText({})).toBeNull();
    expect(sanitizeText('abcdef', 3)).toBe('abc');
  });

  it('normalizes email', () => {
    expect(normalizeEmail(' Foo.Bar@Example.COM ')).toBe('foo.bar@example.com');
    expect(normalizeEmail('not-an-email')).toBeNull();
    expect(normalizeEmail(undefined)).toBeNull();
  });

  it('normalizes phone to E.164', () => {
    expect(normalizePhone('0901 234 567')).toBe('+84901234567');
    expect(normalizePhone('+84901234567')).toBe('+84901234567');
    expect(normalizePhone('(415) 555-2671', 'US')).toBe('+14155552671');
    expect(normalizePhone('123')).toBeNull();
    expect(normalizePhone(null)).toBeNull();
  });

  it('normalizes a full payload', () => {
    const lead = normalizeLead({
      event: 'lead.generate',
      event_id: 'e1',
      timestamp: 1,
      campaign: {
        campaign_id: 'c1',
        campaign_name: 'Spring Sale',
        ad_id: 'a1',
        ad_name: 'Ad',
      },
      form: { form_id: 'f1', form_name: 'Form' },
      lead_data: {
        full_name: ' Nguyễn Văn A ',
        email: 'A@B.COM',
        phone: '0901234567',
        interests: ['tech', ' '],
        ttclid: 'TT-1',
      },
      custom_questions: [
        { question: 'Budget', answer: '5-10' },
        { question: 'Empty', answer: '  ' },
      ],
    });
    expect(lead).toMatchObject({
      name: 'Nguyễn Văn A',
      email: 'a@b.com',
      phone: '+84901234567',
      campaignId: 'c1',
      formName: 'Form',
      interests: ['tech'],
      answers: { Budget: '5-10' },
    });
  });

  it('falls back to email/phone for the name', () => {
    const base = { event: 'x', event_id: 'e', timestamp: 1 };
    expect(
      normalizeLead({ ...base, lead_data: { email: 'john@x.com' } }).name,
    ).toBe('john');
    expect(
      normalizeLead({ ...base, lead_data: { phone: '0901234567' } }).name,
    ).toBe('+84901234567');
    expect(normalizeLead(base).name).toBe('TikTok Lead');
  });

  it('scores leads by engagement and caps at 100', () => {
    const lead = normalizeLead({
      event: 'x',
      event_id: 'e',
      timestamp: 1,
      lead_data: {
        email: 'a@b.com',
        phone: '0901234567',
        city: 'HN',
        ttclid: 't',
        interests: ['a', 'b'],
      },
      custom_questions: [{ question: 'q1', answer: 'a' }],
    });
    // 15 + 20 + 5 + 10 + 10 + 10
    expect(scoreLead(lead)).toBe(70);
    expect(scoreLead(lead, 2)).toBe(80);
    expect(scoreLead(lead, 10)).toBe(90);
    expect(
      scoreLead({ ...lead, answers: { a: '1', b: '2', c: '3', d: '4' } }, 3),
    ).toBe(100);
  });
});
