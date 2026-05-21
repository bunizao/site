import { describe, expect, test } from 'bun:test';
import { gridFromPattern } from '../../src/features/mascot/peek/model';
import { PEEK_TRACK_FAR_LEFT_POSE } from '../../src/features/mascot/peek/poses/track-far-left';
import { PEEK_TRACK_LEFT_POSE } from '../../src/features/mascot/peek/poses/track-left';
import { PEEK_TRACK_CENTER_POSE } from '../../src/features/mascot/peek/poses/track-center';
import { PEEK_TRACK_RIGHT_POSE } from '../../src/features/mascot/peek/poses/track-right';
import { PEEK_TRACK_FAR_RIGHT_POSE } from '../../src/features/mascot/peek/poses/track-far-right';
import { PEEK_IDLE_MOTION } from '../../src/features/mascot/peek/motions/idle';
import { PEEK_CURIOUS_MOTION } from '../../src/features/mascot/peek/motions/curious';
import { PEEK_DART_MOTION } from '../../src/features/mascot/peek/motions/dart';
import { PEEK_PURR_MOTION } from '../../src/features/mascot/peek/motions/purr';
import { PEEK_NAP_MOTION } from '../../src/features/mascot/peek/motions/nap';
import { PEEK_ALERT_MOTION } from '../../src/features/mascot/peek/motions/alert';
import { PEEK_SCAN_MOTION } from '../../src/features/mascot/peek/motions/scan';
import { compose } from '../../src/features/mascot/peek/compose';
import { PEEK_BASE } from '../../src/features/mascot/peek/base';
import { sparse } from '../../src/features/mascot/peek/layer';

const POSE_PATTERNS: Record<string, string> = {
  far_left:  '.#.....##.|##.....###|##########|##########|o####o####|o##*#o####|##########',
  left:      '.##....###|###....###|##########|##########|#o####o###|#o##*#o###|##########',
  center:    '.##....##.|###....###|##########|##########|##o####o##|##o##*#o##|##########',
  right:     '###....##.|###....###|##########|##########|###o####o#|###o#*##o#|##########',
  far_right: '.##.....#.|###.....##|##########|##########|####o####o|####o#*##o|##########',
};

const MOTION_PATTERNS: Record<string, string[]> = {
  idle: [
    ...Array(8).fill('.##....##.|###....###|##########|##########|##o####o##|##o##*#o##|##########'),
    '.##....##.|###....###|##########|##########|##########|##o##*#o##|##########',
  ],
  curious: [
    '.##....##.|###.......|##########|##########|#o####o###|#o##*#o###|##########',
    '.##....##.|###....###|##########|##########|##o####o##|##o##*#o##|##########',
    '.##....##.|###....###|##########|##########|##o####o##|##o##*#o##|##########',
    '.##....##.|.......###|##########|##########|###o####o#|###o#*##o#|##########',
    '.##....##.|.......###|##########|##########|###o####o#|###o#*##o#|##########',
    '.##....##.|###....###|##########|##########|##o####o##|##o##*#o##|##########',
    '.##....##.|###....###|##########|##########|##o####o##|##o##*#o##|##########',
    '.##....##.|###....###|##########|##########|##o####o##|##o##*#o##|##########',
  ],
  dart: [
    '.##....##.|###....###|##########|##########|##o####o##|##o##*#o##|##########',
    '.##....##.|###....###|##########|##########|#o####o###|#o##*#o###|##########',
    '.##....##.|###....###|##########|##########|#o####o###|#o##*#o###|##########',
    '.##....##.|###....###|##########|##########|##o####o##|##o##*#o##|##########',
    '.##....##.|###....###|##########|##########|###o####o#|###o#*##o#|##########',
    '.##....##.|###....###|##########|##########|###o####o#|###o#*##o#|##########',
    '.##....##.|###....###|##########|##########|##o####o##|##o##*#o##|##########',
    '.##....##.|###....###|##########|##########|##########|##o##*#o##|##########',
  ],
  purr: [
    '.##....##.|###....###|##########|##########|##########|##oo*#oo##|##########',
    '.##....##.|###....###|##########|##########|##########|##oo**oo##|##########',
    '.##....##.|###....###|##########|##########|##########|##oo*#oo##|##########',
    '.##....##.|###....###|##########|##########|##########|##o##*#o##|##########',
    '.##....##.|###....###|##########|##########|##########|##oo**oo##|##########',
    '.##....##.|###....###|##########|##########|##########|##oo*#oo##|##########',
  ],
  nap: [
    '.##....##.|###....###|##########|##########|##########|#####*####|##########',
    '.##....##.|###....###|##########|##########|##########|##########|##########',
    '.##....##.|###....###|##########|##########|##########|#####*####|##########',
    '.##....##.|###....###|##########|##########|##########|##########|##########',
  ],
  alert: [
    '.##....##.|.##....##.|###....###|##########|##oo##oo##|##oo#*oo##|##########',
    '.##....##.|.##....##.|###....###|##########|##oo##oo##|##oo**oo##|##########',
    '.##....##.|.##....##.|###....###|##########|##oo##oo##|##oo#*oo##|##########',
    '.##....##.|.##....##.|###....###|##########|##oo##oo##|##oo#*oo##|##########',
    '.##....##.|.##....##.|###....###|##########|##oo##oo##|##oo#*oo##|##########',
  ],
  scan: [
    '.##....###|###....###|##########|##########|#o####o###|#o##*#o###|##########',
    '.##....###|###....###|##########|##########|#o####o###|#o##*#o###|##########',
    '.#.....##.|##.....###|##########|##########|o####o####|o##*#o####|##########',
    '.#.....##.|##.....###|##########|##########|o####o####|o##*#o####|##########',
    '.##....###|###....###|##########|##########|#o####o###|#o##*#o###|##########',
    '.##....##.|###....###|##########|##########|##o####o##|##o##*#o##|##########',
    '###....##.|###....###|##########|##########|###o####o#|###o#*##o#|##########',
    '.##.....#.|###.....##|##########|##########|####o####o|####o#*##o|##########',
    '.##.....#.|###.....##|##########|##########|####o####o|####o#*##o|##########',
    '###....##.|###....###|##########|##########|###o####o#|###o#*##o#|##########',
    '###....##.|###....###|##########|##########|###o####o#|###o#*##o#|##########',
    '.##....##.|###....###|##########|##########|##o####o##|##o##*#o##|##########',
    '.##....##.|###....###|##########|##########|##o####o##|##o##*#o##|##########',
    '.##....###|###....###|##########|##########|#o####o###|#o##*#o###|##########',
  ],
};

describe('peek layer snapshots', () => {
  test('migrated tracking poses match original pixel patterns', () => {
    const poses = {
      far_left: PEEK_TRACK_FAR_LEFT_POSE.grid!,
      left: PEEK_TRACK_LEFT_POSE.grid!,
      center: PEEK_TRACK_CENTER_POSE.grid!,
      right: PEEK_TRACK_RIGHT_POSE.grid!,
      far_right: PEEK_TRACK_FAR_RIGHT_POSE.grid!,
    };
    for (const [name, pattern] of Object.entries(POSE_PATTERNS)) {
      expect(poses[name as keyof typeof poses]).toEqual(gridFromPattern(pattern));
    }
  });

  test('migrated motions match original frame patterns', () => {
    const motions = {
      idle: PEEK_IDLE_MOTION.frames!,
      curious: PEEK_CURIOUS_MOTION.frames!,
      dart: PEEK_DART_MOTION.frames!,
      purr: PEEK_PURR_MOTION.frames!,
      nap: PEEK_NAP_MOTION.frames!,
      alert: PEEK_ALERT_MOTION.frames!,
      scan: PEEK_SCAN_MOTION.frames!,
    };
    for (const [name, frames] of Object.entries(MOTION_PATTERNS)) {
      const got = motions[name as keyof typeof motions];
      expect(got.length).toBe(frames.length);
      for (let i = 0; i < frames.length; i += 1) {
        expect(got[i]!).toEqual(gridFromPattern(frames[i]!));
      }
    }
  });

  test('compose treats -1 as erase and overlays sparse pixels', () => {
    const out = compose(
      PEEK_BASE.base,
      sparse([
        [0, 0, -1],
        [4, 5, 1],
      ]),
    );
    expect(out[0]![0]).toBe(0);
    expect(out[5]![4]).toBe(1);
    expect(out[2]![5]).toBe(PEEK_BASE.base[2]![5]);
  });
});
