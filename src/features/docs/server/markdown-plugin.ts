import { isMermaidLanguage, renderMermaidDiagram } from '../../content/mermaid';

/* Mermaid fences become shared diagram markup on every Markdown surface. Docs
   code fences get two things markdown does not give them: a header strip
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
   insertions and no tree surgery. Non-Mermaid enhancements only touch files
   under src/content/docs; every other markdown source keeps the plain fence. */

import { codeLanguageLabel, codeLanguageLogoHtml } from '../../../lib/code-language';

const DOCS_SOURCE = '/src/content/docs/';
const DEMO_META = /(?:^|\s)demo(?:\s|$)/u;

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
  // An unlabelled fence still gets the generic code mark: the strip carries a
  // copy button on the right, and a mark on the left is what keeps it a header
  // rather than a blank band.
  const label = lang ? codeLanguageLabel(lang) : '';
  const logo = codeLanguageLogoHtml(lang, 'docs-code-logo');

  // Same icon-only copy control as the rest of the site (styles/copy-button.css);
  // the icons are inlined here because this runs as a string transform, with no
  // component layer to import lucide from.
  return (
    '<div class="docs-code-head">' +
    `<span class="docs-code-lang">${logo}${label}</span>` +
    '<button class="copy-btn" type="button" data-docs-copy aria-label="Copy code">' +
    '<span class="copy-btn-icons" aria-hidden="true">' +
    '<svg class="copy-btn-icon copy-btn-icon--copy" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>' +
    '<svg class="copy-btn-icon copy-btn-icon--check" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>' +
    '</span>' +
    '<span class="copy-btn-tip" role="status">Copied</span>' +
    '</button>' +
    '</div>'
  );
}

export const contentCodePlugin = {
  name: 'content-code',
  code(node: CodeNode, ctx: MdastContext) {
    if (isMermaidLanguage(node.lang)) {
      return { rawHtml: renderMermaidDiagram(node.value ?? '') };
    }

    if (!ctx.fileURL?.pathname.includes(DOCS_SOURCE)) return;

    ctx.insertBefore(node, { rawHtml: headHtml(node.lang) });

    if (DEMO_META.test(node.meta ?? '')) {
      // The language travels with the snippet: `conversation` is rendered by the
      // conversation module and everything else by the directive pipeline, and
      // only the fence knows which.
      const source = Buffer.from(node.value ?? '', 'utf8').toString('base64');
      const lang = (node.lang ?? '').toLowerCase().replace(/[^a-z0-9-]/gu, '');
      ctx.insertAfter(node, {
        rawHtml: `<div data-docs-demo="${source}" data-docs-demo-lang="${lang}"></div>`,
      });
    }
  },
};
