import {
  postDirectiveRegistry,
  transformPostDirectives,
  type DirectiveContext,
  type DirectiveTransformResult,
} from './directives';
import { isRichDirectiveOutputTarget } from './directives/types';
import {
  normalizeDirectiveCodeBlocks,
  promoteConversationBlocks,
} from './code-blocks';

const sourceDirectiveNames = new Set<string>();
for (const directive of postDirectiveRegistry) {
  if (directive.kind !== 'inline') sourceDirectiveNames.add(directive.name.toLowerCase());
}

/**
 * The single rich-source compiler shared by published posts and draft preview.
 * Routes provide source and context; authoring carriers and transform order stay
 * behind this interface.
 */
export async function renderPostContent(
  html: string,
  context: DirectiveContext,
): Promise<DirectiveTransformResult> {
  const normalized = normalizeDirectiveCodeBlocks(html, sourceDirectiveNames);
  const rendered = await transformPostDirectives(normalized, context);

  return isRichDirectiveOutputTarget(context.outputTarget)
    ? { ...rendered, html: promoteConversationBlocks(rendered.html) }
    : rendered;
}
