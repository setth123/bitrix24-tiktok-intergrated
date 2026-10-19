import {
  evaluateCondition,
  findMatchingRule,
  parseCondition,
} from './rule-engine';

const ctx = {
  campaign: { campaign_name: 'Spring Sale 2024' },
  lead_data: { city: 'Hà Nội', interests: ['technology', 'mobile apps'] },
  answers: { 'Budget range': '5-10 triệu VND' },
  lead: { score: 65 },
};

describe('rule-engine', () => {
  it('parses clauses with AND, quoted strings and numbers', () => {
    expect(
      parseCondition(
        "campaign.campaign_name CONTAINS 'sale' AND lead.score >= 50",
      ),
    ).toEqual([
      { path: 'campaign.campaign_name', op: 'CONTAINS', value: 'sale' },
      { path: 'lead.score', op: '>=', value: 50 },
    ]);
  });

  it('rejects invalid syntax', () => {
    expect(() => parseCondition('campaign.campaign_name LIKE sale')).toThrow(
      'Invalid condition',
    );
    expect(() => parseCondition('lead.score > abc')).toThrow('Invalid value');
  });

  it.each([
    ["campaign.campaign_name CONTAINS 'sale'", true], // không phân biệt hoa thường
    ["campaign.campaign_name NOT CONTAINS 'sale'", false],
    ["lead_data.interests CONTAINS 'mobile'", true], // mảng
    ["answers.Budget range CONTAINS 'triệu'", true], // path có khoảng trắng
    ["lead_data.city = 'hà nội'", true],
    ["lead_data.city != 'HCM'", true],
    ['lead.score > 60', true],
    ['lead.score < 60', false],
    ['lead.score <= 65', true],
    ['lead.score = 65', true],
    ["lead_data.missing = 'x'", false],
    ["lead_data.missing != 'x'", true],
    ['lead_data.city > 5', false], // so sánh số với chuỗi
  ])('%s -> %s', (condition, expected) => {
    expect(evaluateCondition(condition, ctx)).toBe(expected);
  });

  it('returns the first matching rule and skips invalid ones', () => {
    const rules = [
      {
        condition: 'broken',
        action: 'create_deal' as const,
        pipeline_id: '1',
        stage_id: 'NEW',
      },
      {
        condition: 'lead.score > 90',
        action: 'create_deal' as const,
        pipeline_id: '1',
        stage_id: 'NEW',
      },
      {
        condition: "campaign.campaign_name CONTAINS 'sale'",
        action: 'create_deal' as const,
        pipeline_id: '2',
        stage_id: 'NEW',
      },
    ];
    expect(findMatchingRule(rules, ctx)?.pipeline_id).toBe('2');
    expect(findMatchingRule(rules.slice(0, 2), ctx)).toBeUndefined();
  });
});
