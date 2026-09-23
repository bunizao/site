// One source of truth for how a fence language is presented: its display label
// and its mark. Both the component register's <CodeBox> and the docs code head
// read from here, so a language never shows one name in one place and another
// name somewhere else.

export interface CodeLanguageLogo {
  path: string;
  viewBox?: string;
  // Brand marks are solid shapes; the glyphs drawn here are line art. The flag
  // decides which of the two SVG paint modes the mark renders in.
  stroke?: boolean;
}

const BRAND_TS = 'M0 12v12h24V0H0zm19.34-.66c.61.15 1.07.42 1.5.86.22.24.55.67.57.78 0 .03-1.03.72-1.65 1.11-.02.02-.11-.07-.2-.22-.29-.42-.59-.6-1.06-.63-.68-.05-1.13.31-1.12.9 0 .17.03.28.1.4.15.31.42.5 1.3.87 1.6.69 2.29 1.15 2.71 1.8.48.73.59 1.88.27 2.75-.36.94-1.24 1.58-2.5 1.79-.39.07-1.3.06-1.71-.02-.9-.16-1.75-.6-2.28-1.19-.2-.23-.6-.82-.57-.86l.2-.13.8-.46.6-.35.13.19c.18.27.56.65.79.77.65.34 1.55.29 1.99-.11.18-.16.26-.33.26-.58 0-.23-.03-.33-.15-.5-.16-.22-.48-.4-1.39-.8-1.04-.44-1.48-.72-1.89-1.15a2.62 2.62 0 0 1-.54-1c-.07-.28-.09-.97-.03-1.24.19-.9.85-1.53 1.81-1.72.31-.06 1.04-.04 1.35.03zm-5.03 1.04v1.02H11.1v9.06H8.81v-9.06H5.6v-1a49 49 0 0 1 .01-1.04l4.36.01h4.34z';
const BRAND_JS = 'M0 0h24v24H0V0zm22.034 18.276c-.175-1.095-.888-2.015-3.003-2.873-.736-.345-1.554-.585-1.797-1.14-.091-.33-.105-.51-.046-.705.15-.646.915-.84 1.515-.66.39.12.75.42.976.9 1.034-.676 1.034-.676 1.755-1.125-.27-.42-.404-.601-.586-.78-.63-.705-1.469-1.065-2.834-1.034l-.705.089c-.676.165-1.32.525-1.71 1.005-1.14 1.291-.811 3.541.569 4.471 1.365 1.02 3.361 1.244 3.616 2.205.24 1.17-.87 1.545-1.966 1.41-.811-.18-1.26-.586-1.755-1.336l-1.83 1.051c.21.48.45.689.81 1.109 1.74 1.756 6.09 1.666 6.871-1.004.029-.09.24-.705.074-1.65l.046.067zm-8.983-7.245h-2.248c0 1.938-.009 3.864-.009 5.805 0 1.232.063 2.363-.138 2.711-.33.689-1.18.601-1.566.48-.396-.196-.597-.466-.83-.855-.063-.105-.11-.196-.127-.196l-1.825 1.125c.305.63.75 1.172 1.324 1.517.855.51 2.004.675 3.207.405.783-.226 1.458-.691 1.811-1.411.51-.93.402-2.07.397-3.346.012-2.054 0-4.109 0-6.179l.004-.056z';
const BRAND_ASTRO = 'M8.358 20.162c-1.186-1.07-1.532-3.316-1.038-4.944.856 1.026 2.043 1.352 3.272 1.535 1.897.283 3.76.177 5.522-.678.202-.098.388-.229.608-.36.166.473.209.95.151 1.437-.14 1.185-.738 2.1-1.688 2.794-.38.277-.782.525-1.175.787-1.205.804-1.531 1.747-1.078 3.119l.044.148a3.158 3.158 0 0 1-1.407-1.188 3.31 3.31 0 0 1-.544-1.815c-.004-.32-.004-.642-.048-.958-.106-.769-.472-1.113-1.161-1.133-.707-.02-1.267.411-1.415 1.09-.012.053-.028.104-.045.165h.002zm-5.961-4.445s3.24-1.575 6.49-1.575l2.451-7.565c.092-.366.36-.614.662-.614.302 0 .57.248.662.614l2.45 7.565c3.85 0 6.491 1.575 6.491 1.575L16.088.727C15.93.285 15.663 0 15.303 0H8.697c-.36 0-.615.285-.784.727l-5.516 14.99z';

// Line-art glyphs for the languages with no usable brand mark. Terminal prompt,
// braces, and the Markdown wordmark box are each recognizable on their own.
const GLYPH_SHELL = 'M3 4.5h18a1.5 1.5 0 0 1 1.5 1.5v12a1.5 1.5 0 0 1-1.5 1.5H3A1.5 1.5 0 0 1 1.5 18V6A1.5 1.5 0 0 1 3 4.5ZM6 9.5l3 2.5-3 2.5M12.5 15h5';
const GLYPH_BRACES = 'M8 3H7a2 2 0 0 0-2 2v4a2 2 0 0 1-2 2 2 2 0 0 1 2 2v4a2 2 0 0 0 2 2h1M16 3h1a2 2 0 0 1 2 2v4a2 2 0 0 0 2 2 2 2 0 0 0-2 2v4a2 2 0 0 1-2 2h-1';
const GLYPH_MARKDOWN = 'M3 5.5h18a1.5 1.5 0 0 1 1.5 1.5v10a1.5 1.5 0 0 1-1.5 1.5H3A1.5 1.5 0 0 1 1.5 17V7A1.5 1.5 0 0 1 3 5.5ZM5.5 15.5v-7l3 3.5 3-3.5v7M16 8.5v7m0 0 2.5-2.75M16 15.5l-2.5-2.75';
const GLYPH_CODE = 'm8.5 8.5-4 3.5 4 3.5M15.5 8.5l4 3.5-4 3.5M13.5 5.5l-3 13';

const LOGOS: Record<string, CodeLanguageLogo> = {
  ts: { path: BRAND_TS },
  tsx: { path: BRAND_TS },
  typescript: { path: BRAND_TS },
  js: { path: BRAND_JS },
  jsx: { path: BRAND_JS },
  javascript: { path: BRAND_JS },
  astro: { path: BRAND_ASTRO },
  sh: { path: GLYPH_SHELL, stroke: true },
  bash: { path: GLYPH_SHELL, stroke: true },
  zsh: { path: GLYPH_SHELL, stroke: true },
  shell: { path: GLYPH_SHELL, stroke: true },
  shellscript: { path: GLYPH_SHELL, stroke: true },
  console: { path: GLYPH_SHELL, stroke: true },
  json: { path: GLYPH_BRACES, stroke: true },
  jsonc: { path: GLYPH_BRACES, stroke: true },
  json5: { path: GLYPH_BRACES, stroke: true },
  md: { path: GLYPH_MARKDOWN, stroke: true },
  markdown: { path: GLYPH_MARKDOWN, stroke: true },
  mdx: { path: GLYPH_MARKDOWN, stroke: true },
};

// Readable display names. Highlighting is universal — Shiki bundles every
// language — so this only governs the label; anything absent shows its raw
// fence name, which is already lowercase and short.
const LABELS: Record<string, string> = {
  ts: 'TypeScript', typescript: 'TypeScript', mts: 'TypeScript', cts: 'TypeScript', tsx: 'TypeScript',
  js: 'JavaScript', javascript: 'JavaScript', jsx: 'JavaScript', mjs: 'JavaScript', cjs: 'JavaScript',
  astro: 'Astro', vue: 'Vue', svelte: 'Svelte',
  json: 'JSON', jsonc: 'JSON', json5: 'JSON', toml: 'TOML', yaml: 'YAML', yml: 'YAML', ini: 'INI',
  html: 'HTML', xml: 'XML', svg: 'SVG',
  css: 'CSS', scss: 'SCSS', sass: 'Sass', less: 'Less',
  md: 'Markdown', markdown: 'Markdown', mdx: 'MDX',
  py: 'Python', python: 'Python',
  rb: 'Ruby', ruby: 'Ruby', php: 'PHP',
  go: 'Go', golang: 'Go', rs: 'Rust', rust: 'Rust',
  java: 'Java', kt: 'Kotlin', kotlin: 'Kotlin', swift: 'Swift', dart: 'Dart', scala: 'Scala',
  c: 'C', h: 'C', cpp: 'C++', 'c++': 'C++', cc: 'C++', cxx: 'C++', hpp: 'C++',
  cs: 'C#', csharp: 'C#', 'c#': 'C#',
  sh: 'Shell', bash: 'Bash', zsh: 'Shell', shell: 'Shell', shellscript: 'Shell', console: 'Shell',
  powershell: 'PowerShell', ps1: 'PowerShell', bat: 'Batch', cmd: 'Batch',
  sql: 'SQL', graphql: 'GraphQL', gql: 'GraphQL', proto: 'Protobuf',
  dockerfile: 'Dockerfile', docker: 'Dockerfile', makefile: 'Makefile', cmake: 'CMake',
  nginx: 'Nginx', apache: 'Apache', diff: 'Diff', patch: 'Diff',
  lua: 'Lua', r: 'R', perl: 'Perl', elixir: 'Elixir', ex: 'Elixir', erlang: 'Erlang',
  hs: 'Haskell', haskell: 'Haskell', clojure: 'Clojure', clj: 'Clojure', ocaml: 'OCaml',
  conversation: 'Conversation', mermaid: 'Mermaid',
  text: 'Text', txt: 'Text', plaintext: 'Text', ansi: 'Text',
};

// Every fenced block gets a mark. A language with no curated logo falls back to
// the generic code glyph rather than leaving a ragged gap where the icon sits.
const FALLBACK_LOGO: CodeLanguageLogo = { path: GLYPH_CODE, stroke: true };

export function codeLanguageLabel(lang?: string | null): string {
  const key = lang?.toLowerCase() ?? '';
  return LABELS[key] ?? lang ?? '';
}

export function codeLanguageLogo(lang?: string | null): CodeLanguageLogo {
  return LOGOS[lang?.toLowerCase() ?? ''] ?? FALLBACK_LOGO;
}

// Markup form, for the remark plugin that builds the docs code head as a string.
export function codeLanguageLogoHtml(lang: string | null | undefined, className: string): string {
  const logo = codeLanguageLogo(lang);
  const paint = logo.stroke
    ? 'fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"'
    : 'fill="currentColor"';

  return `<svg class="${className}" viewBox="${logo.viewBox ?? '0 0 24 24'}" ${paint} aria-hidden="true"><path d="${logo.path}"/></svg>`;
}
