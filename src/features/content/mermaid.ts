export const MERMAID_LANGUAGE = 'mermaid';

export function isMermaidLanguage(language: string | null | undefined): boolean {
  return language?.trim().toLowerCase() === MERMAID_LANGUAGE;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function renderMermaidDiagram(source: string): string {
  const escapedSource = escapeHtml(source.trim());

  return (
    '<figure class="mermaid-diagram" data-mermaid-diagram data-mermaid-state="source" aria-label="Diagram">' +
    '<div class="mermaid-diagram__canvas" data-mermaid-canvas aria-hidden="true"></div>' +
    `<pre class="mermaid-diagram__source" data-mermaid-source><code>${escapedSource}</code></pre>` +
    '</figure>'
  );
}
