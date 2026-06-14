import { appendMoodApiModeQueryValue, readMoodApiModeQueryValue } from '@/features/mood/shared/api-mode';

export function isMoodApiV2Enabled(): boolean {
  try {
    return readMoodApiModeQueryValue(new URL(window.location.href)) === 'true';
  } catch {
    return false;
  }
}

export function appendMoodApiMode(query: URLSearchParams): void {
  try {
    appendMoodApiModeQueryValue(query, readMoodApiModeQueryValue(new URL(window.location.href)));
  } catch {
    // Leave the query untouched when the current URL cannot be parsed.
  }
}
