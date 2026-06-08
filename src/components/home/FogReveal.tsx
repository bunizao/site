import type { ReactNode } from 'react';
import { motion, useReducedMotion } from 'framer-motion';

interface FogRevealProps {
  children: ReactNode;
  /** When true the fog is blown away and the content sharpens into view. */
  revealed: boolean;
  /** Layout classes for the content row underneath the fog. */
  className?: string;
}

// Soft wind-out: quick to lift, gentle to settle.
const EASE = [0.22, 1, 0.36, 1] as const;

// Two soft cloud layers — the second drifts faster for a wispy parallax.
const FOG_BACK =
  'radial-gradient(75% 130% at 22% 35%, hsl(var(--background)/0.98), hsl(var(--background)/0) 76%),' +
  'radial-gradient(72% 125% at 72% 60%, hsl(var(--background)/0.95), hsl(var(--background)/0) 78%)';
const FOG_WISP =
  'radial-gradient(60% 110% at 45% 50%, hsl(var(--background)/0.7), hsl(var(--background)/0) 72%)';

/**
 * Hides its content behind a soft fog. On hover/focus the fog is blown away —
 * drifting sideways, swelling, and dissolving — while the blurred content
 * sharpens into place.
 */
export function FogReveal({ children, revealed, className }: FogRevealProps) {
  const reduced = useReducedMotion();
  const show = revealed || reduced;

  return (
    <div className="relative">
      <motion.div
        className={className}
        initial={false}
        animate={{ filter: show ? 'blur(0px)' : 'blur(7px)', opacity: show ? 1 : 0.5 }}
        transition={{ duration: 0.6, ease: EASE }}
      >
        {children}
      </motion.div>

      {!reduced && (
        <>
          <motion.div
            aria-hidden="true"
            className="pointer-events-none absolute -inset-x-3 -inset-y-2"
            style={{ background: FOG_BACK }}
            initial={false}
            animate={
              revealed
                ? { opacity: 0, x: 26, scale: 1.08, filter: 'blur(9px)' }
                : { opacity: 1, x: 0, scale: 1, filter: 'blur(2px)' }
            }
            transition={{ duration: 0.7, ease: EASE }}
          />
          <motion.div
            aria-hidden="true"
            className="pointer-events-none absolute -inset-x-3 -inset-y-2"
            style={{ background: FOG_WISP }}
            initial={false}
            animate={
              revealed
                ? { opacity: 0, x: 44, scale: 1.12, filter: 'blur(12px)' }
                : { opacity: 1, x: 0, scale: 1, filter: 'blur(4px)' }
            }
            transition={{ duration: 0.55, ease: EASE }}
          />
        </>
      )}
    </div>
  );
}
