import type { MascotAsset } from '../../model';
import { PEEK_CONFUSED_EXPRESSION } from './confused';
import { PEEK_CRY_EXPRESSION } from './cry';
import { PEEK_ERROR_EXPRESSION } from './error';
import { PEEK_FOCUS_EXPRESSION } from './focus';
import { PEEK_HEART_EXPRESSION } from './heart';
import { PEEK_SLEEPY_EXPRESSION } from './sleepy';
import { PEEK_STARRY_EXPRESSION } from './starry';
import { PEEK_WINK_EXPRESSION } from './wink';

export const PEEK_EXPRESSION_ASSETS: ReadonlyArray<MascotAsset> = [
  PEEK_CONFUSED_EXPRESSION,
  PEEK_WINK_EXPRESSION,
  PEEK_HEART_EXPRESSION,
  PEEK_SLEEPY_EXPRESSION,
  PEEK_ERROR_EXPRESSION,
  PEEK_STARRY_EXPRESSION,
  PEEK_FOCUS_EXPRESSION,
  PEEK_CRY_EXPRESSION,
];
