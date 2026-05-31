import { getEntry } from 'astro:content';
import {
  getDocsVisibility,
  type LoadDocsEntry,
} from './visibility';

const loadDocsEntry: LoadDocsEntry = async (slug) => {
  return getEntry('docs', slug);
};

export function getDocsVisibilityFromContent(pathname: string) {
  return getDocsVisibility(pathname, loadDocsEntry);
}
