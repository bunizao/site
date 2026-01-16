import { useEffect, useRef, type ReactNode } from 'react';

interface MagneticButtonProps {
  children: ReactNode;
  strength?: number;
  className?: string;
}

export default function MagneticButton({
  children,
  strength = 0.3,
  className = ''
}: MagneticButtonProps) {
  const buttonRef = useRef<HTMLDivElement>(null);
  const gsapRef = useRef<typeof import('gsap')['default'] | null>(null);
  const gsapPromiseRef = useRef<Promise<typeof import('gsap')['default']> | null>(null);
  const quickXRef = useRef<((value: number) => void) | null>(null);
  const quickYRef = useRef<((value: number) => void) | null>(null);
  const boundsRef = useRef<DOMRect | null>(null);

  useEffect(() => {
    const button = buttonRef.current;
    if (!button) return;

    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
      return;
    }

    const ensureGsap = async () => {
      if (gsapRef.current) return gsapRef.current;
      if (!gsapPromiseRef.current) {
        gsapPromiseRef.current = import('gsap').then((mod) => mod.default);
      }
      const gsap = await gsapPromiseRef.current;
      gsapRef.current = gsap;
      if (!quickXRef.current || !quickYRef.current) {
        quickXRef.current = gsap.quickTo(button, 'x', {
          duration: 0.3,
          ease: 'power2.out'
        });
        quickYRef.current = gsap.quickTo(button, 'y', {
          duration: 0.3,
          ease: 'power2.out'
        });
      }
      return gsap;
    };

    const updateBounds = () => {
      boundsRef.current = button.getBoundingClientRect();
    };

    const handlePointerEnter = (e: PointerEvent) => {
      if (e.pointerType && e.pointerType !== 'mouse') return;
      updateBounds();
      void ensureGsap();
    };

    const handlePointerMove = (e: PointerEvent) => {
      if (e.pointerType && e.pointerType !== 'mouse') return;
      if (!boundsRef.current) {
        updateBounds();
      }
      if (!boundsRef.current || !quickXRef.current || !quickYRef.current) return;
      const { left, top, width, height } = boundsRef.current;
      const centerX = left + width / 2;
      const centerY = top + height / 2;

      const deltaX = (e.clientX - centerX) * strength;
      const deltaY = (e.clientY - centerY) * strength;

      quickXRef.current(deltaX);
      quickYRef.current(deltaY);
    };

    const handlePointerLeave = (e: PointerEvent) => {
      if (e.pointerType && e.pointerType !== 'mouse') return;
      boundsRef.current = null;
      if (!gsapRef.current) return;
      gsapRef.current.to(button, {
        x: 0,
        y: 0,
        duration: 0.5,
        ease: 'elastic.out(1, 0.3)'
      });
    };

    button.style.willChange = 'transform';

    button.addEventListener('pointerenter', handlePointerEnter, { passive: true });
    button.addEventListener('pointermove', handlePointerMove, { passive: true });
    button.addEventListener('pointerleave', handlePointerLeave, { passive: true });
    window.addEventListener('resize', updateBounds);

    return () => {
      button.removeEventListener('pointerenter', handlePointerEnter);
      button.removeEventListener('pointermove', handlePointerMove);
      button.removeEventListener('pointerleave', handlePointerLeave);
      window.removeEventListener('resize', updateBounds);
    };
  }, [strength]);

  return (
    <div ref={buttonRef} className={className}>
      {children}
    </div>
  );
}
