import { useEffect, useMemo, useState } from 'react';
import { Alignment, Fit, Layout, useRive } from '@rive-app/react-canvas';

type Variant = 'desktop' | 'mobile';

const assets: Record<Variant, { artboard: string; src: string }> = {
  desktop: {
    artboard: 'pasted',
    src: '/effects/voidzero/homepage-desktop.riv',
  },
  mobile: {
    artboard: 'MOBILE',
    src: '/effects/voidzero/homepage-mobile.riv',
  },
};

function useViewportVariant() {
  const [variant, setVariant] = useState<Variant | null>(null);

  useEffect(() => {
    const media = window.matchMedia('(max-width: 767px)');
    const update = () => setVariant(media.matches ? 'mobile' : 'desktop');

    update();
    media.addEventListener('change', update);

    return () => {
      media.removeEventListener('change', update);
    };
  }, []);

  return variant;
}

function usePrefersReducedMotion() {
  const [reducedMotion, setReducedMotion] = useState(false);

  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setReducedMotion(media.matches);

    update();
    media.addEventListener('change', update);

    return () => {
      media.removeEventListener('change', update);
    };
  }, []);

  return reducedMotion;
}

function RiveCanvas({ reducedMotion, variant }: { reducedMotion: boolean; variant: Variant }) {
  const [isReady, setIsReady] = useState(false);
  const asset = assets[variant];
  const layout = useMemo(() => new Layout({ fit: Fit.Contain, alignment: Alignment.Center }), []);

  const { RiveComponent, rive } = useRive(
    {
      src: asset.src,
      artboard: asset.artboard,
      stateMachines: 'State Machine 1',
      autoplay: !reducedMotion,
      layout,
      shouldDisableRiveListeners: true,
      onRiveReady: () => setIsReady(true),
    },
    {
      fitCanvasToArtboardHeight: false,
      shouldResizeCanvasToContainer: true,
      useDevicePixelRatio: true,
      useOffscreenRenderer: true,
    }
  );

  useEffect(() => {
    if (!rive) return;

    if (reducedMotion) {
      rive.pause();
    } else {
      rive.play();
    }
  }, [reducedMotion, rive]);

  return (
    <div className="rive-stage" data-ready={isReady ? 'true' : 'false'}>
      <RiveComponent aria-label="VoidZero cube breakdown animation" role="img" />
    </div>
  );
}

export default function VoidZeroRiveHero() {
  const variant = useViewportVariant();
  const reducedMotion = usePrefersReducedMotion();

  return (
    <div className="rive-shell" data-variant={variant ?? 'pending'}>
      {variant ? (
        <RiveCanvas key={variant} reducedMotion={reducedMotion} variant={variant} />
      ) : (
        <div className="rive-stage" data-ready="false" aria-hidden="true" />
      )}
    </div>
  );
}
