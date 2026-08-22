/* Docs code fences get two things markdown does not give them: a header strip
   carrying the language and a copy button, and — for a fence tagged `demo` —
   a slot underneath that the docs route fills with the snippet run through the
   real directive pipeline.

   The slot is a placeholder rather than the finished markup because this module
   is imported by astro.config, and whatever it reaches is pulled into the config
   loader's module graph. The directive pipeline reaches .tsx components and
   Vite-only `?raw` imports, neither of which the loader can parse. The route
   owns the render; this only marks where it goes.

   Header and slot are siblings of the fence, not a wrapper: docs.css joins them
   into one frame with adjacent-sibling rules, which keeps this plugin to two
   insertions and no tree surgery. Only files under src/content/docs are
   touched — every other markdown source keeps the plain fence. */

const DOCS_SOURCE = '/src/content/docs/';
const DEMO_META = /(?:^|\s)demo(?:\s|$)/u;

// Shiki labels an unlabelled fence "plaintext"; that is not worth a chip.
const LANGUAGE_LABELS: Record<string, string> = {
  bash: 'Shell',
  css: 'CSS',
  html: 'HTML',
  js: 'JavaScript',
  json: 'JSON',
  jsonc: 'JSON',
  md: 'Markdown',
  sh: 'Shell',
  ts: 'TypeScript',
  tsx: 'TSX',
  yaml: 'YAML',
};

interface CodeNode {
  lang?: string | null;
  meta?: string | null;
  value?: string;
}

interface MdastContext {
  fileURL?: URL;
  insertBefore(node: CodeNode, content: { rawHtml: string }): void;
  insertAfter(node: CodeNode, content: { rawHtml: string }): void;
}

function headHtml(lang: string | null | undefined): string {
  const label = lang ? LANGUAGE_LABELS[lang] ?? lang : '';
  return (
    '<div class="docs-code-head">' +
    `<span class="docs-code-lang">${label}</span>` +
    '<button class="docs-code-copy" type="button" data-docs-copy>' +
    '<span data-docs-copy-label>Copy</span>' +
    '</button>' +
    '</div>'
  );
}

export const docsCodePlugin = {
  name: 'docs-code',
  code(node: CodeNode, ctx: MdastContext) {
    if (!ctx.fileURL?.pathname.includes(DOCS_SOURCE)) return;

    ctx.insertBefore(node, { rawHtml: headHtml(node.lang) });

    if (DEMO_META.test(node.meta ?? '')) {
      const source = Buffer.from(node.value ?? '', 'utf8').toString('base64');
      ctx.insertAfter(node, { rawHtml: `<div data-docs-demo="${source}"></div>` });
    }
  },
};
