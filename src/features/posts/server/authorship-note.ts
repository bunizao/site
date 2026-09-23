function escapeHtml(value: string): string {
  return value.replace(
    /[&<>"']/gu,
    (character) => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;',
    })[character] as string,
  );
}

function safeLinkHref(value: string): { href: string; external: boolean } | null {
  const decoded = value.replace(/&amp;/gu, '&');

  if (/^https?:\/\//iu.test(decoded)) {
    try {
      const url = new URL(decoded);
      if (url.username || url.password) return null;
      return { href: value, external: true };
    } catch {
      return null;
    }
  }

  if (/^\/(?![\\/])/u.test(decoded) || /^#[^\s]/u.test(decoded)) {
    return { href: value, external: false };
  }

  return null;
}

/** Render the small inline Markdown surface supported by an authorship note. */
export function renderAuthorshipNoteMarkdown(value: string): string {
  let html = escapeHtml(value);
  const codeSpans: string[] = [];
  const links: string[] = [];

  html = html.replace(/`([^`]+)`/gu, (_match, code: string) => {
    const token = `\u0001C${codeSpans.length}\u0001`;
    codeSpans.push(`<code>${code}</code>`);
    return token;
  });

  html = html.replace(/\[([^\]]+)\]\(([^)\s]+)\)/gu, (match, text: string, href: string) => {
    const safe = safeLinkHref(href);
    if (!safe) return match;
    const token = `\u0001L${links.length}\u0001`;
    const externalAttributes = safe.external
      ? ' rel="noopener noreferrer" target="_blank"'
      : '';
    links.push(`<a href="${safe.href}"${externalAttributes}>${text}</a>`);
    return token;
  });

  return html
    .replace(/\*\*([^*]+)\*\*/gu, '<strong>$1</strong>')
    .replace(/~~([^~]+)~~/gu, '<del>$1</del>')
    .replace(/(^|[^*])\*([^*]+)\*/gu, '$1<em>$2</em>')
    .replace(/\u0001L(\d+)\u0001/gu, (_match, index: string) => links[Number(index)] ?? '')
    .replace(/\u0001C(\d+)\u0001/gu, (_match, index: string) => codeSpans[Number(index)] ?? '');
}
