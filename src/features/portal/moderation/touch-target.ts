/** A 44px hit area on touch, centred on the element, from an ::after box,
    so dense rows and bars keep their height. A leaf of its own: most
    screens need this string and nothing else from segmented.tsx. */
export const TOUCH_TARGET =
  'relative pointer-coarse:after:absolute pointer-coarse:after:top-1/2 pointer-coarse:after:left-1/2 pointer-coarse:after:h-11 pointer-coarse:after:w-full pointer-coarse:after:min-w-11 pointer-coarse:after:-translate-x-1/2 pointer-coarse:after:-translate-y-1/2';
