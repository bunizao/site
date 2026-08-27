const HTML_ENTITY_PATTERN = /&(nbsp|amp|lt|gt|quot|#39);/gu;

const HTML_ENTITIES: Readonly<Record<string, string>> = {
  nbsp: ' ',
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  '#39': "'",
};

export function docsHtmlToText(html: string): string {
  return html
    .replace(/<(script|style)[\s\S]*?<\/\1>/giu, ' ')
    .replace(/<[^>]+>/gu, ' ')
    .replace(HTML_ENTITY_PATTERN, (entity, name: string) => HTML_ENTITIES[name] ?? entity)
    .replace(/\s+/gu, ' ')
    .trim();
}
