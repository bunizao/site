const CURSOR_PATTERN = /^\d{1,20}$/;
const INTEGER_PATTERN = /^-?\d+$/;

export function readCursorQuery(url: URL, name: string): string {
  return (url.searchParams.get(name) ?? '').trim();
}

export function isValidCursor(value: string): boolean {
  return value === '' || CURSOR_PATTERN.test(value);
}

export function readIntQuery(url: URL, name: string): number | null {
  const value = (url.searchParams.get(name) ?? '').trim();
  if (!value || !INTEGER_PATTERN.test(value)) {
    return null;
  }

  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : null;
}

export function readEnumQuery<T extends string>(
  url: URL,
  name: string,
  allowedValues: readonly T[],
  defaultValue: T
): T {
  const value = (url.searchParams.get(name) ?? '').trim() as T;
  return allowedValues.includes(value) ? value : defaultValue;
}

export function readBooleanFlag(url: URL, name: string, defaultValue = false): boolean {
  const value = url.searchParams.get(name);
  if (value === null) {
    return defaultValue;
  }

  const normalized = value.trim().toLowerCase();
  if (!normalized) {
    return defaultValue;
  }

  return normalized !== '0'
    && normalized !== 'false'
    && normalized !== 'no'
    && normalized !== 'off';
}
