export type MoodApiModeQueryValue = 'true' | 'false';

export function readMoodApiModeQueryValue(url: URL): MoodApiModeQueryValue | null {
  const value = url.searchParams.get('api-v2');
  if (value === null) return null;

  const normalized = value.trim().toLowerCase();
  if (!normalized) return null;

  if (
    normalized === '0'
    || normalized === 'false'
    || normalized === 'no'
    || normalized === 'off'
  ) {
    return 'false';
  }

  return 'true';
}

export function appendMoodApiModeQueryValue(
  query: URLSearchParams,
  mode: MoodApiModeQueryValue | null
): void {
  if (mode) {
    query.set('api-v2', mode);
  }
}
