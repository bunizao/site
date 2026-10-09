import type { SiteAnalyticsClick } from '@bunizao/contracts/analytics';
export function analyticsMetric(
  metric: 1 | 2,
  value: number,
  add = false,
): void {
  document.dispatchEvent(
    new CustomEvent('analytics:metric', { detail: { metric, value, add } }),
  );
}
export function analyticsClick(
  name: string,
  options: Partial<SiteAnalyticsClick> = {},
): void {
  document.dispatchEvent(
    new CustomEvent('analytics:click', {
      detail: {
        name,
        kind: 'button',
        href: '',
        region: '',
        label: '',
        position: -1,
        tMs: 0,
        ...options,
      },
    }),
  );
}
