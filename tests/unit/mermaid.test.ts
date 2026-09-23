import { describe, expect, test } from 'bun:test';

import { contentCodePlugin } from '@/features/docs/server/markdown-plugin';
import {
  isMermaidLanguage,
  renderMermaidDiagram,
} from '@/features/content/mermaid';

describe('Mermaid content rendering', () => {
  test('recognizes Mermaid fences case-insensitively', () => {
    expect(isMermaidLanguage('mermaid')).toBe(true);
    expect(isMermaidLanguage(' Mermaid ')).toBe(true);
    expect(isMermaidLanguage('typescript')).toBe(false);
  });

  test('renders escaped source with a no-JavaScript fallback', () => {
    const html = renderMermaidDiagram('flowchart LR\n  A["<script>"] --> B');

    expect(html).toContain('data-mermaid-diagram');
    expect(html).toContain('data-mermaid-source');
    expect(html).toContain('&lt;script&gt;');
    expect(html).not.toContain('<script>');
  });

  test('replaces Mermaid fences before docs code decoration', () => {
    const inserts: string[] = [];
    const result = contentCodePlugin.code(
      { lang: 'mermaid', value: 'flowchart LR\n  A --> B' },
      {
        fileURL: new URL('file:///src/content/docs/example.md'),
        insertBefore: (_node, content) => inserts.push(content.rawHtml),
        insertAfter: (_node, content) => inserts.push(content.rawHtml),
      },
    );

    expect(result?.rawHtml).toContain('data-mermaid-diagram');
    expect(result?.rawHtml).toContain('flowchart LR');
    expect(inserts).toEqual([]);
  });
});
