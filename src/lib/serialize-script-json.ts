/**
 * Serialize a value for embedding inside an inline `<script>` element via
 * `set:html`. HTML parsing scans for the byte sequence `</script` inside raw
 * text elements before the content is treated as JavaScript/JSON, so a plain
 * `JSON.stringify()` result can truncate the script or corrupt the
 * surrounding DOM if the payload contains a case-insensitive match (e.g. a
 * Telegram/Ghost string like `</SCRIPT>` or `<style>`). Escaping `<` as its
 * JSON unicode escape (`<`) neutralizes every HTML tag delimiter while
 * remaining valid JSON, so `JSON.parse()` on the client still round-trips the
 * original value exactly.
 *
 * Do not use this for normal `application/json` HTTP response bodies or HTML
 * text nodes — those are not parsed as raw script text and have different
 * escaping contracts.
 */
export function serializeScriptJson(value: unknown): string {
  return JSON.stringify(value).replace(/</g, '\\u003c');
}
