// Font stacks for server-rendered surfaces (SVG routes, email HTML) that cannot
// read the CSS variables in src/styles/globals.css. Keep these in sync with the
// :root tokens there — same faces, same fallback order.
//
//   FONT_MONO     site identity, terminal/craft   (Geist Mono)
//   FONT_CODE     literal code + data readouts     (JetBrains Mono)
//   FONT_SANS     long-form reading prose          (Inter)
//   FONT_DISPLAY  portal & docs UI                 (Geist Sans)

const MONO_FALLBACK =
  "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace";
const SANS_FALLBACK =
  "ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif";

export const FONT_MONO = `'Geist Mono', ${MONO_FALLBACK}`;
export const FONT_CODE = `'JetBrains Mono', ${MONO_FALLBACK}`;
export const FONT_SANS = `'Inter', ${SANS_FALLBACK}`;
export const FONT_DISPLAY = `'Geist', ${SANS_FALLBACK}`;

// Web font binaries, served from /public/fonts. Use for <link rel="preload">
// and @font-face src in self-contained SVG/email documents.
export const FONT_FILES = {
  mono: '/fonts/geist-mono-variable.woff2',
  code: '/fonts/jetbrains-mono-variable.woff2',
  sans: '/fonts/inter-variable.woff2',
  display: '/fonts/geist-sans-variable.woff2',
} as const;
