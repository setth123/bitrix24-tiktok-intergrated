import { getPath, toText } from '../common/object-path';

export interface DealRule {
  /** Ví dụ: "campaign.campaign_name CONTAINS 'sale' AND lead.score >= 50" */
  condition: string;
  action: 'create_deal';
  pipeline_id: string;
  stage_id: string;
  /** Không khai báo -> lấy theo probability của stage. */
  probability?: number;
  /** User ID Bitrix24; truyền mảng để chia đều kiểu round-robin. */
  assigned_to?: string | string[];
  amount?: number;
  currency?: string;
}

const OPERATORS = [
  'NOT CONTAINS',
  'CONTAINS',
  '>=',
  '<=',
  '!=',
  '=',
  '>',
  '<',
] as const;
type Operator = (typeof OPERATORS)[number];

export interface Clause {
  path: string;
  op: Operator;
  value: string | number;
}

const CLAUSE_RE = new RegExp(
  `^(.+?)\\s+(${OPERATORS.join('|')})\\s+(.+)$`,
  'i',
);

/** Parse điều kiện dạng `<path> <OP> <value> [AND ...]`. Throw nếu sai cú pháp. */
export function parseCondition(condition: string): Clause[] {
  return condition.split(/\s+AND\s+/i).map((part) => {
    const match = CLAUSE_RE.exec(part.trim());
    if (!match) throw new Error(`Invalid condition: "${part.trim()}"`);
    const [, path, op, raw] = match;
    const quoted = /^(['"])(.*)\1$/.exec(raw.trim());
    let value: string | number;
    if (quoted) value = quoted[2];
    else if (!Number.isNaN(Number(raw))) value = Number(raw);
    else throw new Error(`Invalid value in condition: "${raw}"`);
    return { path: path.trim(), op: op.toUpperCase() as Operator, value };
  });
}

const text = (v: unknown) => toText(v).toLowerCase();

function matches(
  actual: unknown,
  op: Operator,
  expected: string | number,
): boolean {
  if (op === 'CONTAINS' || op === 'NOT CONTAINS') {
    const needle = String(expected).toLowerCase();
    const items = Array.isArray(actual) ? actual : [actual];
    const found = items.some(
      (item) => item != null && text(item).includes(needle),
    );
    return op === 'CONTAINS' ? found : !found;
  }
  if (actual === undefined || actual === null) return op === '!=';
  if (op === '=' || op === '!=') {
    const equal =
      typeof expected === 'number'
        ? Number(actual) === expected
        : text(actual) === expected.toLowerCase();
    return op === '=' ? equal : !equal;
  }
  const num = Number(actual);
  const target = Number(expected);
  if (Number.isNaN(num) || Number.isNaN(target)) return false;
  switch (op) {
    case '>':
      return num > target;
    case '>=':
      return num >= target;
    case '<':
      return num < target;
    default:
      return num <= target;
  }
}

export function evaluateCondition(
  condition: string,
  context: unknown,
): boolean {
  return parseCondition(condition).every((c) =>
    matches(getPath(context, c.path), c.op, c.value),
  );
}

/** Trả về rule đầu tiên khớp (thứ tự trong config = độ ưu tiên). Rule sai cú pháp bị bỏ qua. */
export function findMatchingRule(
  rules: DealRule[],
  context: unknown,
): DealRule | undefined {
  return rules.find((rule) => {
    try {
      return evaluateCondition(rule.condition, context);
    } catch {
      return false;
    }
  });
}
