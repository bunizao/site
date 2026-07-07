import { readRuntimeEnvSource, type RuntimeEnvLocals } from '@/lib/runtime/env';

interface AssetsBinding {
  fetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response>;
}

interface BuiltBlogMarkdownResult {
  body: string;
  status: number;
}

export type BuiltBlogMarkdownRoute =
  | { kind: 'index' }
  | { kind: 'tags' }
  | { kind: 'tag'; slug: string }
  | { kind: 'post'; slug: string };

function safeSegment(value: string): string {
  return encodeURIComponent(value).replace(/%2F/gi, '');
}

function readAssetsBinding(locals: unknown): AssetsBinding | null {
  const env = readRuntimeEnvSource(locals as RuntimeEnvLocals | undefined);
  const binding = env?.ASSETS;

  if (
    binding
    && typeof binding === 'object'
    && typeof (binding as AssetsBinding).fetch === 'function'
  ) {
    return binding as AssetsBinding;
  }

  return null;
}

export function builtBlogMarkdownAssetPath(route: BuiltBlogMarkdownRoute): string {
  if (route.kind === 'index') return '/_agent-markdown/blog/index.md';
  if (route.kind === 'tags') return '/_agent-markdown/blog/tags/index.md';
  if (route.kind === 'tag') return `/_agent-markdown/blog/tag/${safeSegment(route.slug)}.md`;
  return `/_agent-markdown/blog/post/${safeSegment(route.slug)}.md`;
}

export async function readBuiltBlogMarkdown(
  context: {
    locals: unknown;
    url: URL;
  },
  route: BuiltBlogMarkdownRoute,
): Promise<BuiltBlogMarkdownResult | null> {
  const assets = readAssetsBinding(context.locals);
  if (!assets) return null;

  const response = await assets.fetch(
    new Request(new URL(builtBlogMarkdownAssetPath(route), context.url.origin)),
  );

  if (response.status === 404) {
    return { body: 'Blog Markdown not found.\n', status: 404 };
  }

  if (!response.ok) {
    return { body: 'Failed to load blog Markdown.\n', status: 500 };
  }

  return {
    body: await response.text(),
    status: 200,
  };
}
