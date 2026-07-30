export type DirectiveOutputTarget =
  | 'web'
  | 'preview'
  | 'rss'
  | 'og'
  | 'excerpt'
  | 'agent-markdown';

export function isRichDirectiveOutputTarget(outputTarget: DirectiveOutputTarget): boolean {
  return outputTarget === 'web' || outputTarget === 'preview';
}

export interface DirectiveContext {
  slug: string;
  locale: string;
  outputTarget: DirectiveOutputTarget;
}

export type DirectiveAttributes = Record<string, string>;

export interface DirectiveWarning {
  code: string;
  directive: string;
  slug?: string;
  message: string;
}

export interface DirectiveHtmlResult {
  html: string;
  warnings?: readonly DirectiveWarning[];
}

export type DirectiveHtmlOutput = string | DirectiveHtmlResult;

export interface BlockDirective {
  name: string;
  kind: 'block';
  parse(rawAttributes: string): DirectiveAttributes;
  render(
    attributes: DirectiveAttributes,
    context: DirectiveContext,
  ): DirectiveHtmlOutput | Promise<DirectiveHtmlOutput>;
}

export interface MetaDirective {
  name: string;
  kind: 'meta';
  parse(rawAttributes: string): DirectiveAttributes;
}

export interface InlineDirective {
  name: string;
  kind: 'inline';
  transform(
    html: string,
    context: DirectiveContext,
  ): DirectiveHtmlOutput | Promise<DirectiveHtmlOutput>;
}

export type Directive = BlockDirective | MetaDirective | InlineDirective;

export interface DirectiveTransformResult {
  html: string;
  meta: Record<string, DirectiveAttributes[]>;
  warnings: DirectiveWarning[];
}

export type DirectiveTransformer = (
  html: string,
  context: DirectiveContext,
) => Promise<DirectiveTransformResult>;
