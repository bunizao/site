import { getPeekAssets } from '@/features/mascot/peek/catalog';
import type { PeekLookDefinition } from './types';

function toLookDefinition(asset: ReturnType<typeof getPeekAssets>[number]): PeekLookDefinition {
  if (!asset.grid || (asset.kind !== 'expression' && asset.kind !== 'costume')) {
    throw new Error(`Peek look compatibility received non-look asset: ${asset.id}`);
  }
  return {
    kind: asset.kind,
    label: asset.key,
    blurb: asset.summary,
    grid: asset.grid,
  };
}

export const PEEK_EXPRESSION_LOOKS: ReadonlyArray<PeekLookDefinition> = getPeekAssets({
  kind: 'expression',
}).map(toLookDefinition);

export const PEEK_COSTUME_LOOKS: ReadonlyArray<PeekLookDefinition> = getPeekAssets({
  kind: 'costume',
}).map(toLookDefinition);
