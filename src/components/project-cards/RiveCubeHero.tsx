import { useEffect, useMemo, useState } from "react";
import { Alignment, Fit, Layout, useRive } from "@rive-app/react-canvas";

// Card-native mount of the VoidZero cube. Self-contained (no external CSS) and
// tuned for a dark card: no multiply blend, fades in once Rive is ready.
export default function RiveCubeHero() {
  const [reduced, setReduced] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduced(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  const layout = useMemo(
    () => new Layout({ fit: Fit.Contain, alignment: Alignment.Center }),
    [],
  );

  const { RiveComponent, rive } = useRive(
    {
      src: "/effects/voidzero/homepage-desktop.riv",
      artboard: "pasted",
      stateMachines: "State Machine 1",
      autoplay: !reduced,
      layout,
      shouldDisableRiveListeners: true,
      onRiveReady: () => setReady(true),
    },
    {
      shouldResizeCanvasToContainer: true,
      useDevicePixelRatio: true,
      useOffscreenRenderer: true,
    },
  );

  useEffect(() => {
    if (!rive) return;
    if (reduced) rive.pause();
    else rive.play();
  }, [reduced, rive]);

  return (
    <div className="absolute inset-0 bg-[#0c0d10]">
      <div
        className={`h-full w-full transition-opacity duration-500 [&>canvas]:!h-full [&>canvas]:!w-full [&>canvas]:block ${
          ready ? "opacity-100" : "opacity-0"
        }`}
      >
        <RiveComponent role="img" aria-label="Animated protocol cube" />
      </div>
    </div>
  );
}
