import type { MascotAsset } from '../model';
import { PEEK_BASE_POSE } from './base';
import { PEEK_TRACK_CENTER_POSE } from './track-center';
import { PEEK_TRACK_FAR_LEFT_POSE } from './track-far-left';
import { PEEK_TRACK_FAR_RIGHT_POSE } from './track-far-right';
import { PEEK_TRACK_LEFT_POSE } from './track-left';
import { PEEK_TRACK_RIGHT_POSE } from './track-right';

export const PEEK_POSE_ASSETS: ReadonlyArray<MascotAsset> = [
  PEEK_BASE_POSE,
  PEEK_TRACK_FAR_LEFT_POSE,
  PEEK_TRACK_LEFT_POSE,
  PEEK_TRACK_CENTER_POSE,
  PEEK_TRACK_RIGHT_POSE,
  PEEK_TRACK_FAR_RIGHT_POSE,
];
