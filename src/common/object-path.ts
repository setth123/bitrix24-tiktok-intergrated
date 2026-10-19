/** Lấy giá trị theo đường dẫn chấm: getPath({a:{b:1}}, 'a.b') === 1 */
export function getPath(obj: unknown, path: string): unknown {
  return path.split('.').reduce<unknown>((cur, key) => {
    if (cur === null || typeof cur !== 'object') return undefined;
    return (cur as Record<string, unknown>)[key];
  }, obj);
}

/**
 * Gán giá trị theo đường dẫn kiểu Bitrix24: setPath(o, 'EMAIL[0][VALUE]', 'a@b.c')
 * -> o.EMAIL = [{ VALUE: 'a@b.c' }]
 */
export function setPath(
  obj: Record<string, unknown>,
  path: string,
  value: unknown,
): void {
  const keys = path
    .split(/\[|\]/)
    .filter((k) => k !== '')
    .map((k) => (/^\d+$/.test(k) ? Number(k) : k));
  let cur: any = obj;
  keys.forEach((key, i) => {
    if (i === keys.length - 1) {
      cur[key] = value;
      return;
    }
    cur[key] ??= typeof keys[i + 1] === 'number' ? [] : {};
    cur = cur[key];
  });
}

/** Bỏ các key undefined (TypeORM 1.x không cho phép undefined trong `where`). */
export function compact<T extends Record<string, unknown>>(obj: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(obj).filter(([, v]) => v !== undefined),
  ) as Partial<T>;
}

/** Chuyển giá trị bất kỳ thành chuỗi (object -> JSON). */
export function toText(value: unknown): string {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') {
    return value.toString();
  }
  return JSON.stringify(value) ?? '';
}
