export function normalizeMoodTag(value: string | null | undefined): string {
  return (value ?? '').trim().replace(/^#+/, '').toLowerCase();
}

export function getMoodTagHref(value: string | null | undefined): string {
  const tag = normalizeMoodTag(value);
  return tag ? `/mood?tag=${encodeURIComponent(tag)}` : '/mood';
}
