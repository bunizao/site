import type { MascotAsset } from '../model';
import { PEEK_COSTUME_ASSETS } from './costumes';
import { PEEK_EXPRESSION_ASSETS } from './expressions';

export const PEEK_LOOK_ASSETS: ReadonlyArray<MascotAsset> = [
  ...PEEK_EXPRESSION_ASSETS,
  ...PEEK_COSTUME_ASSETS,
];
