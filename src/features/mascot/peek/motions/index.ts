import type { MascotAsset } from '../model';
import { PEEK_ALERT_MOTION } from './alert';
import { PEEK_CURIOUS_MOTION } from './curious';
import { PEEK_DART_MOTION } from './dart';
import { PEEK_DISSOLVE_MOTION } from './dissolve';
import { PEEK_HAPPY_MOTION } from './happy';
import { PEEK_HIDE_MOTION } from './hide';
import { PEEK_IDLE_MOTION } from './idle';
import { PEEK_NAP_MOTION } from './nap';
import { PEEK_POP_MOTION } from './pop';
import { PEEK_PURR_MOTION } from './purr';
import { PEEK_SCAN_MOTION } from './scan';
import { PEEK_SLEEPY_MOTION } from './sleepy';

export const PEEK_MOTION_ASSETS: ReadonlyArray<MascotAsset> = [
  PEEK_IDLE_MOTION,
  PEEK_HIDE_MOTION,
  PEEK_POP_MOTION,
  PEEK_CURIOUS_MOTION,
  PEEK_PURR_MOTION,
  PEEK_DART_MOTION,
  PEEK_NAP_MOTION,
  PEEK_SCAN_MOTION,
  PEEK_ALERT_MOTION,
  PEEK_DISSOLVE_MOTION,
  PEEK_HAPPY_MOTION,
  PEEK_SLEEPY_MOTION,
];
