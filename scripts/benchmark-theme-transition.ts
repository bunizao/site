import { chromium, webkit, type BrowserType } from "@playwright/test";

const baseURL = process.env.THEME_BENCH_URL ?? "http://localhost:4321";
const iterations = Number(process.env.THEME_BENCH_ITERATIONS ?? 12);
const benchmarkAudio = process.env.THEME_BENCH_AUDIO === "1";
const routes = [
  { path: "/", selector: "[data-theme-option]" },
  { path: "/dev/portal", selector: "[data-portal-theme-toggle]" },
];
const profiles = [
  {
    name: "desktop",
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 1,
  },
  {
    name: "iphone",
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 3,
  },
];

interface FrameStats {
  nativeSupported: boolean;
  path: "native" | "fallback" | "none";
  animated: boolean;
  frames: number;
  median: number;
  p95: number;
  max: number;
  overBudget: number;
}

const benchmark = async (name: string, engine: BrowserType) => {
  const browser = await engine.launch();

  for (const profile of profiles) {
    const context = await browser.newContext({
      viewport: profile.viewport,
      deviceScaleFactor: profile.deviceScaleFactor,
      isMobile: profile.name === "iphone",
      hasTouch: profile.name === "iphone",
    });
    if (!benchmarkAudio) {
      await context.addInitScript(() => {
        HTMLMediaElement.prototype.play = async () => {};
      });
    }
    const page = await context.newPage();

    for (const route of routes) {
      await page.goto(`${baseURL}${route.path}`, { waitUntil: "networkidle" });
      await page.emulateMedia({ reducedMotion: "no-preference" });

      const stats = await page.evaluate(
        async ({ selector, iterations }): Promise<FrameStats> => {
          const frameDurations: number[] = [];
          let previous = performance.now();
          let recording = true;
          const sample = (now: number) => {
            frameDurations.push(now - previous);
            previous = now;
            if (recording) requestAnimationFrame(sample);
          };
          requestAnimationFrame(sample);

          const root = document.documentElement;
          const nativeSupported =
            typeof (document as Document & { startViewTransition?: unknown })
              .startViewTransition === "function";
          let path: FrameStats["path"] = "none";
          let animated = false;
          await new Promise<void>((resolve) =>
            requestAnimationFrame(() => resolve()),
          );
          previous = performance.now();
          for (let index = 0; index < iterations; index++) {
            const elements = Array.from(
              document.querySelectorAll<HTMLElement>(selector),
            );
            const target =
              selector === "[data-theme-option]"
                ? elements.find(
                    (element) =>
                      element.dataset.themeOption ===
                      (root.classList.contains("dark") ? "light" : "dark"),
                  )
                : elements[0];
            if (!target) throw new Error(`Theme control missing: ${selector}`);
            target.click();
            await new Promise<void>((resolve) => {
              const timeout = window.setTimeout(resolve, 1200);
              let sawTransition = false;
              const inspect = () => {
                const nativeActive = root.classList.contains("theme-wipe");
                const fallbackActive =
                  root.classList.contains("theme-wipe-webkit");
                if (nativeActive || fallbackActive) {
                  sawTransition = true;
                  animated = true;
                  path = nativeActive ? "native" : "fallback";
                }
                if (sawTransition && !nativeActive && !fallbackActive) {
                  clearTimeout(timeout);
                  resolve();
                  return;
                }
                requestAnimationFrame(inspect);
              };
              requestAnimationFrame(inspect);
            });
          }

          recording = false;
          frameDurations.shift();
          frameDurations.sort((a, b) => a - b);
          const pick = (ratio: number) =>
            frameDurations[
              Math.min(
                frameDurations.length - 1,
                Math.floor(frameDurations.length * ratio),
              )
            ] ?? 0;
          return {
            nativeSupported,
            path,
            animated,
            frames: frameDurations.length,
            median: pick(0.5),
            p95: pick(0.95),
            max: frameDurations.at(-1) ?? 0,
            overBudget: frameDurations.filter((duration) => duration > 20)
              .length,
          };
        },
        { selector: route.selector, iterations },
      );

      const status = stats.animated
        ? `${stats.path}${stats.nativeSupported ? "/native-api" : "/no-native-api"}`
        : `not-animated${stats.nativeSupported ? "/native-api" : "/no-native-api"}`;
      console.log(
        `${name.padEnd(8)} ${profile.name.padEnd(7)} ${route.path.padEnd(12)} ${status.padEnd(24)} ${stats.frames} frames  median=${stats.median.toFixed(1)}ms  p95=${stats.p95.toFixed(1)}ms  max=${stats.max.toFixed(1)}ms  >20ms=${stats.overBudget}`,
      );
    }

    await context.close();
  }

  await browser.close();
};

await benchmark("chromium", chromium);
await benchmark("webkit", webkit);
