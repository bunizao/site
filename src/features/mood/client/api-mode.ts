export function isMoodApiV2Enabled(): boolean {
  try {
    return new URL(window.location.href).searchParams.get('api-v2') === 'true';
  } catch {
    return false;
  }
}

export function appendMoodApiMode(query: URLSearchParams): void {
  if (isMoodApiV2Enabled()) {
    query.set('api-v2', 'true');
  }
}
