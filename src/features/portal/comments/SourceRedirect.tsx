import * as React from 'react';
import type { AdminSourceKeyType } from '@bunizao/contracts';
import { navigate, useLocation } from '../app/router';
import { SOURCE_TYPES, pivotHref } from './model';

/* The old source page, `/comments/source/:type/:value`, is now the comment
   log filtered to that key. Old links (Telegram, bookmarks, the reactions
   page) land here and are replaced, so Back skips the hop. */
export default function SourceRedirect() {
  const { path } = useLocation();
  React.useLayoutEffect(() => {
    const [, , , type = '', value = ''] = path.split('/');
    const key = decodeURIComponent(type);
    navigate(SOURCE_TYPES.has(key) && value ? pivotHref(key as AdminSourceKeyType, decodeURIComponent(value)) : '/comments', { replace: true });
  }, [path]);
  return null;
}
