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
  match(pathname: string): Record<string, string> | null;
  render(context: MarkdownRendererContext): Promise<MarkdownRendererResult> | MarkdownRendererResult;
}

export interface MatchedMarkdownRenderer {
  renderer: MarkdownRenderer;
  params: Record<string, string>;
}
