// Progressive-blur ladder, shared by the <ProgressiveBlur> component and the
// string-rendered embed markup (src/lib/embed/*), which cannot import .astro
// files. The ladder itself is the reason this module exists: it is tuned
// against a Figma export and against per-browser backdrop cost, so a second
// hand-rolled copy of it in a renderer would be a worse blur at a worse price.

export type ProgressiveBlurDirection = 'top' | 'right' | 'bottom' | 'left';
export type ProgressiveBlurPreset = 'continuous' | 'topbar';

export interface ProgressiveBlurLayer {
  filter: string;
  webkitFilter: string;
  mask: string;
  compactMask: string | null;
  /** null drops the layer on WebKit; a string is the mask the survivor widens to. */
  webkitMask: string | null;
}

// Reference ladder: the 20 background-blur layers exported from Figma, as
// [radius, maskStart, maskEnd]. Figma's exported CSS uses half of the radius
// shown in the layer name. Kept whole as the source of truth; the tiers below
// sample it rather than replacing it.
const referenceLadder = [
  [0, 0, 0.160256],
  [0.001, 0.160256, 0.320513],
  [0.003, 0.320513, 0.641026],
  [0.013, 0.641026, 1.28205],
  [0.051, 1.28205, 2.5641],
  [0.205, 2.5641, 5.12821],
  [1.175, 5.12821, 12.2711],
  [2.94, 12.2711, 19.4139],
  [5.501, 19.4139, 26.5568],
  [8.858, 26.5568, 33.6996],
  [13.011, 33.6996, 40.8425],
  [17.96, 40.8425, 47.9853],
  [23.705, 47.9853, 55.1282],
  [30.246, 55.1282, 62.2711],
  [37.583, 62.2711, 69.4139],
  [45.715, 69.4139, 76.5568],
  [54.644, 76.5568, 83.6996],
  [64.368, 83.6996, 90.8425],
  [74.889, 90.8425, 97.9853],
  [78, 97.9853, 100],
] as const;

// Every layer is its own offscreen backdrop snapshot plus blur pass, so cost
// grows linearly with layer count while the perceived ramp stops improving well
// before twenty. Indices 0-5 are dropped outright: their radii are all under a
// fifth of a pixel, so they render nothing at full price. The rest are sampled
// on a stride, always keeping index 19 so peak blur matches the reference.
// compactIndices is a strict subset of wideIndices, which lets a single DOM node
// serve both tiers with nothing but its mask swapped. These two arrays are the
// whole tuning surface.
const wideIndices = [6, 8, 10, 12, 14, 16, 19];
const compactIndices = [6, 10, 14, 16, 19];

const roundRadius = (radius: number) => Math.round(radius * 1000) / 1000;

// A sampled layer ramps in from the previous kept layer's boundary instead of
// its own, so the widened gaps stay continuous and no seam appears where a
// dropped layer used to sit.
const maskLadder = (indices: readonly number[]) => {
  const masks = new Map<number, string>();
  let previousEnd = 0;

  for (const index of indices) {
    const end = referenceLadder[index][2];
    masks.set(
      index,
      `linear-gradient(var(--pblur-direction), transparent ${previousEnd}%, #000 ${end}%)`,
    );
    previousEnd = end;
  }

  return masks;
};

const continuousLayers = (strength: number): ProgressiveBlurLayer[] => {
  const wideMasks = maskLadder(wideIndices);
  const compactMasks = maskLadder(compactIndices);

  return wideIndices.map((index) => {
    const filter = `blur(${roundRadius(referenceLadder[index][0] * strength)}px)`;

    return {
      filter,
      webkitFilter: filter,
      mask: wideMasks.get(index)!,
      compactMask: compactMasks.get(index) ?? null,
      webkitMask: wideMasks.get(index)!,
    };
  });
};

// The topbar ramp is hand-tuned rather than sampled: it covers a short fixed
// band, so four layers already read as continuous. WebKit resolves the same
// radius visually heavier, hence the trimmed companion values.
//
// WebKit also charges per PASS, not per radius: every backdrop-filter element
// snapshots the backdrop into its own offscreen buffer, blurs it, then reads it
// back. Behind a fixed bar that whole chain reruns on every scrolled frame, so
// four layers mean four full-width blurs competing with whatever else is
// animating in the bar. Only layers 2 and 4 survive there (webkitMask set); the
// two carry the ramp on widened masks and a single saturate pass between them.
const topbarLayers: ProgressiveBlurLayer[] = [
  {
    filter: 'blur(4px)',
    webkitFilter: 'blur(3px)',
    mask: 'linear-gradient(to bottom, #000 0%, #000 60%, transparent 100%)',
    compactMask: null,
    webkitMask: null,
  },
  {
    filter: 'blur(8px)',
    webkitFilter: 'blur(5px)',
    mask: 'linear-gradient(to bottom, #000 0%, #000 45%, transparent 80%)',
    compactMask: null,
    webkitMask: 'linear-gradient(to bottom, #000 0%, #000 50%, transparent 100%)',
  },
  {
    filter: 'blur(14px) saturate(1.4)',
    webkitFilter: 'blur(9px) saturate(1.3)',
    mask: 'linear-gradient(to bottom, #000 0%, #000 30%, transparent 62%)',
    compactMask: null,
    webkitMask: null,
  },
  {
    filter: 'blur(22px) saturate(1.6)',
    webkitFilter: 'blur(16px) saturate(1.4)',
    mask: 'linear-gradient(to bottom, #000 0%, #000 12%, transparent 45%)',
    compactMask: null,
    webkitMask: 'linear-gradient(to bottom, #000 0%, #000 18%, transparent 58%)',
  },
];

export function progressiveBlurLayers(
  preset: ProgressiveBlurPreset,
  strength = 1,
): ProgressiveBlurLayer[] {
  const normalizedStrength = Number.isFinite(strength) && strength >= 0 ? strength : 1;
  return preset === 'topbar' ? topbarLayers : continuousLayers(normalizedStrength);
}

export function progressiveBlurLayerStyle(
  layer: ProgressiveBlurLayer,
): Record<string, string> {
  return {
    '--pblur-filter': layer.filter,
    '--pblur-webkit-filter': layer.webkitFilter,
    '--pblur-mask': layer.mask,
    ...(layer.compactMask ? { '--pblur-mask-compact': layer.compactMask } : {}),
    ...(layer.webkitMask ? { '--pblur-mask-webkit': layer.webkitMask } : {}),
  };
}

/**
 * Same DOM the <ProgressiveBlur> component emits, for renderers that build HTML
 * strings. The ladder values are machine-generated from the arrays above (no
 * user input reaches them), so they need no escaping.
 */
export function renderProgressiveBlurMarkup(options: {
  preset?: ProgressiveBlurPreset;
  direction?: ProgressiveBlurDirection;
  strength?: number;
  className?: string;
} = {}): string {
  const preset = options.preset ?? 'continuous';
  const direction = options.direction ?? 'bottom';
  const layers = progressiveBlurLayers(preset, options.strength ?? 1);
  const classAttribute = ['pblur', options.className].filter(Boolean).join(' ');

  const spans = layers.map((layer, index) => {
    const style = Object.entries(progressiveBlurLayerStyle(layer))
      .map(([property, value]) => `${property}:${value}`)
      .join(';');

    return `<span class="pblur__layer" data-layer="${index + 1}" data-compact="${
      layer.compactMask ? 'true' : 'false'
    }" data-webkit="${layer.webkitMask ? 'true' : 'false'}" style="${style}"></span>`;
  });

  return `<span class="${classAttribute}" data-direction="${direction}" data-preset="${preset}" data-progressive-blur aria-hidden="true">${spans.join('')}</span>`;
}
