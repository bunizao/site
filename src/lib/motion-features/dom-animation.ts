// Split into its own module so LazyMotion's dynamic `features` loader pulls
// only the domAnimation bundle (animation + exit + hover/tap/focus gestures)
// as a separate chunk from domMax, instead of bundling both together.
export { domAnimation as default } from 'framer-motion';
