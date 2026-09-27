export interface MarkdownRendererContext {
  request: Request;
  locals: App.Locals;
  url: URL;
  site: URL;
  params: Record<string, string>;
}

export interface MarkdownRendererResult {
  body: string;
  status?: number;
  headers?: HeadersInit;
}

export interface MarkdownRenderer {
  id: string;
  cacheTtlSeconds: number;
  // Freshness for shared caches outside Cloudflare (`Cache-Control:
  // s-maxage`). Defaults to cacheTtlSeconds.
  sharedCacheTtlSeconds?: number;
  // Build-backed renderers can let the platform cache their 404s briefly;
  // without it every non-200 Markdown response is no-store.
  notFoundCacheTtlSeconds?: number;
  match(pathname: string): Record<string, string> | null;
  render(context: MarkdownRendererContext): Promise<MarkdownRendererResult> | MarkdownRendererResult;
}

export interface MatchedMarkdownRenderer {
  renderer: MarkdownRenderer;
  params: Record<string, string>;
}
