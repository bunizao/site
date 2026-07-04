import type { BlogLocale } from '@/data/site';
import type { Tag } from './types';

export function getTagLabel(tag: Tag, locale: BlogLocale): string {
  if (locale === 'zh') {
    return tag.name;
  }

  return tag.metaTitle?.trim() || tag.ogTitle?.trim() || titleCaseSlug(tag.slug);
}

function titleCaseSlug(slug: string): string {
  return slug
    .replace(/^hash-/, '')
    .split('-')
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}
