import type { MascotRuntimeBehavior, MascotSlot } from '../shared/types';

export const PEEK_SLOTS: ReadonlyArray<MascotSlot> = [
  {
    id: 'navbar.brand.default',
    label: 'Navbar Brand Default',
    assetId: 'peek.motion.idle',
    notes: 'Brand mark at rest.',
  },
  {
    id: 'navbar.brand.hover',
    label: 'Navbar Brand Hover',
    assetId: 'peek.motion.dart',
    holdMs: 1000,
    notes: 'Brand hover and fast-scroll response.',
  },
  {
    id: 'navbar.nav-link.hover',
    label: 'Navbar Link Hover',
    assetId: 'peek.motion.curious',
    eventChannel: 'nav',
    notes: 'Desktop section-link hover expression.',
  },
  {
    id: 'navbar.section.active',
    label: 'Navbar Section Active',
    assetId: 'peek.motion.happy',
    eventChannel: 'nav',
    holdMs: 600,
    notes: 'Short positive burst when the active section changes.',
  },
  {
    id: 'navbar.idle-timeout',
    label: 'Navbar Idle Timeout',
    assetId: 'peek.motion.sleepy',
    eventChannel: 'nav',
    notes: 'Long inactivity state.',
  },
  {
    id: 'favicon.default',
    label: 'Favicon Default',
    assetId: 'peek.pose.base',
    notes: 'Static SVG route source for the favicon and mask icon.',
  },
  {
    id: 'preview.tracker.default',
    label: 'Preview Tracker Default',
    assetId: 'peek.motion.scan',
    eventChannel: 'preview-track',
    notes: 'Tracking demo rest state.',
  },
  {
    id: 'preview.tracker.far-left',
    label: 'Preview Tracker Far Left',
    assetId: 'peek.pose.track-far-left',
    eventChannel: 'preview-track',
  },
  {
    id: 'preview.tracker.left',
    label: 'Preview Tracker Left',
    assetId: 'peek.pose.track-left',
    eventChannel: 'preview-track',
  },
  {
    id: 'preview.tracker.center',
    label: 'Preview Tracker Center',
    assetId: 'peek.pose.track-center',
    eventChannel: 'preview-track',
  },
  {
    id: 'preview.tracker.right',
    label: 'Preview Tracker Right',
    assetId: 'peek.pose.track-right',
    eventChannel: 'preview-track',
  },
  {
    id: 'preview.tracker.far-right',
    label: 'Preview Tracker Far Right',
    assetId: 'peek.pose.track-far-right',
    eventChannel: 'preview-track',
  },
  {
    id: 'not-found.tracker.default',
    label: 'Not Found Tracker Default',
    assetId: 'peek.motion.scan',
    eventChannel: 'nf',
    notes: '404 tracking rest state.',
  },
  {
    id: 'not-found.tracker.far-left',
    label: 'Not Found Tracker Far Left',
    assetId: 'peek.pose.track-far-left',
    eventChannel: 'nf',
  },
  {
    id: 'not-found.tracker.left',
    label: 'Not Found Tracker Left',
    assetId: 'peek.pose.track-left',
    eventChannel: 'nf',
  },
  {
    id: 'not-found.tracker.center',
    label: 'Not Found Tracker Center',
    assetId: 'peek.pose.track-center',
    eventChannel: 'nf',
  },
  {
    id: 'not-found.tracker.right',
    label: 'Not Found Tracker Right',
    assetId: 'peek.pose.track-right',
    eventChannel: 'nf',
  },
  {
    id: 'not-found.tracker.far-right',
    label: 'Not Found Tracker Far Right',
    assetId: 'peek.pose.track-far-right',
    eventChannel: 'nf',
  },
  {
    id: 'not-found.cta.hover',
    label: 'Not Found CTA Hover',
    assetId: 'peek.motion.alert',
    eventChannel: 'nf',
    notes: 'Go-home CTA hover state.',
  },
  {
    id: 'not-found.cta.click',
    label: 'Not Found CTA Click',
    assetId: 'peek.motion.dissolve',
    eventChannel: 'nf',
    notes: 'Go-home CTA exit state.',
  },
];

export const PEEK_RUNTIME_BEHAVIORS: ReadonlyArray<MascotRuntimeBehavior> = [
  {
    slotId: 'navbar.brand.default',
    label: 'Default rest state',
    description: 'Navbar brand mark at rest before hover or event overrides.',
  },
  {
    slotId: 'navbar.brand.hover',
    label: 'Brand hover and fast scroll',
    description: 'Used for home hover and high-velocity scroll bursts.',
  },
  {
    slotId: 'navbar.nav-link.hover',
    label: 'Nav link hover',
    description: 'Desktop section links trigger a curious expression on pointer enter.',
  },
  {
    slotId: 'navbar.section.active',
    label: 'Section activation',
    description: 'When the active section changes, navbar code fires a short happy burst.',
  },
  {
    slotId: 'navbar.idle-timeout',
    label: 'Long idle timeout',
    description: 'After ten seconds of inactivity, the navbar mascot falls into its sleepy alias.',
  },
];
