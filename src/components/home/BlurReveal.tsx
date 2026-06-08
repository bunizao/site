import { useRef, useState, type ReactNode } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import confetti from 'canvas-confetti';

interface BlurRevealProps {
  children: ReactNode;
  className?: string;
}

/**
 * Hides its content behind a soft blur. On hover/focus the blur clears and a
 * short monochrome particle burst fires from the element's centre — the
 * "joke" experiences reveal themselves only when you reach for them.
 */
export function BlurReveal({ children, className }: BlurRevealProps) {
  const reduced = useReducedMotion();
  const ref = useRef<HTMLDivElement>(null);
  const [revealed, setRevealed] = useState(false);

  const burst = () => {
    if (reduced) return;
    const el = ref.current;
    if (!el) return;

    const rect = el.getBoundingClientRect();
    const origin = {
      x: (rect.left + rect.width / 2) / window.innerWidth,
      y: (rect.top + rect.height / 2) / window.innerHeight,
    };
    const dark = document.documentElement.classList.contains('dark');
    const colors = dark
      ? ['#ffffff', '#d4d4d4', '#8f8f8f']
      : ['#0a0a0a', '#404040', '#8f8f8f'];

    confetti({
      particleCount: 34,
      spread: 64,
      startVelocity: 20,
      gravity: 0.9,
      decay: 0.92,
      ticks: 80,
      scalar: 0.55,
      shapes: ['circle'],
      colors,
      origin,
      zIndex: 60,
      disableForReducedMotion: true,
    });
  };

  const reveal = () => {
    if (!revealed) burst();
    setRevealed(true);
  };

  return (
    <motion.div
      ref={ref}
      className={className}
      onHoverStart={reveal}
      onHoverEnd={() => setRevealed(false)}
      onFocusCapture={reveal}
      onBlurCapture={() => setRevealed(false)}
      initial={false}
      animate={{
        filter: revealed || reduced ? 'blur(0px)' : 'blur(7px)',
        opacity: revealed || reduced ? 1 : 0.5,
      }}
      transition={{ duration: 0.42, ease: [0.2, 0, 0, 1] }}
    >
      {children}
    </motion.div>
  );
}
