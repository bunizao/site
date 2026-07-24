interface EmojiMetaResponse {
  emoji?: string;
}

interface PakoLike {
  ungzip(input: Uint8Array): Uint8Array;
}

interface LottieAnimationInstance {
  play(): void;
  pause(): void;
  destroy?: () => void;
}

interface LottieLoadOptions {
  container: HTMLElement;
  renderer: 'svg';
  loop: boolean;
  autoplay: boolean;
  animationData: unknown;
  rendererSettings: {
    preserveAspectRatio: string;
  };
}

interface LottieLike {
  loadAnimation(options: LottieLoadOptions): LottieAnimationInstance;
}

interface EmojiLibraries {
  lottie: LottieLike;
  pako: PakoLike;
}

type EmojiRoot = ParentNode & Node;

const toStaticProxyUrl = (value: string): string => `/static/${value.replace('://', ':/')}`;
const ANIMATION_FETCH_ATTEMPTS = 2;
const ANIMATION_RETRY_DELAY_MS = 250;
let librariesPromise: Promise<EmojiLibraries> | null = null;
const emojiCache = new Map<string, Promise<unknown | null>>();

async function loadLibraries(): Promise<EmojiLibraries> {
  if (!librariesPromise) {
    librariesPromise = Promise.all([
      import('lottie-web/build/player/lottie_light'),
      import('pako'),
    ]).then(([lottieModule, pakoModule]) => ({
      lottie: lottieModule.default as LottieLike,
      pako: pakoModule as PakoLike,
    }));
  }

  return librariesPromise;
}

async function loadAnimationData(emojiId: string, pako: PakoLike): Promise<unknown | null> {
  try {
    const metaResponse = await fetch(toStaticProxyUrl(`https://t.me/i/emoji/${emojiId}.json`));
    if (!metaResponse.ok) return null;

    const meta = await metaResponse.json() as EmojiMetaResponse;
    const emojiUrl = meta.emoji;
    if (!emojiUrl) return null;

    const proxied = emojiUrl.startsWith('http') ? `/static/${emojiUrl}` : emojiUrl;
    const tgsResponse = await fetch(proxied);
    if (!tgsResponse.ok) return null;

    const buffer = await tgsResponse.arrayBuffer();
    const bytes = new Uint8Array(buffer);
    const jsonText = new TextDecoder('utf-8').decode(pako.ungzip(bytes));
    return JSON.parse(jsonText) as unknown;
  } catch {
    return null;
  }
}

async function getAnimationData(emojiId: string, pako: PakoLike): Promise<unknown | null> {
  if (emojiCache.has(emojiId)) {
    return emojiCache.get(emojiId) as Promise<unknown | null>;
  }

  const promise = (async () => {
    for (let attempt = 0; attempt < ANIMATION_FETCH_ATTEMPTS; attempt += 1) {
      const animationData = await loadAnimationData(emojiId, pako);
      if (animationData) return animationData;
      if (attempt + 1 < ANIMATION_FETCH_ATTEMPTS) {
        await new Promise((resolve) => setTimeout(resolve, ANIMATION_RETRY_DELAY_MS));
      }
    }
    return null;
  })();

  emojiCache.set(emojiId, promise);
  const animationData = await promise;
  if (!animationData) {
    emojiCache.delete(emojiId);
  }
  return animationData;
}

function ensureStaticFallback(node: HTMLElement, emojiId: string): void {
  if (node.querySelector('img, .tg-emoji-anim')) return;

  const image = document.createElement('img');
  image.className = 'tg-emoji-fallback';
  image.src = toStaticProxyUrl(`https://t.me/i/emoji/${emojiId}.webp`);
  image.alt = node.textContent?.trim() || 'emoji';
  image.loading = 'lazy';
  image.decoding = 'async';
  image.width = 20;
  image.height = 20;
  node.replaceChildren(image);
}

export interface AnimatedEmojiManager {
  hydrate(root?: ParentNode): Promise<void>;
  observe(root: EmojiRoot): void;
  disconnect(): void;
}

export function createAnimatedEmojiManager(
  options: { maxConcurrentAnimations?: number } = {}
): AnimatedEmojiManager {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    return {
      hydrate: async () => {},
      observe: () => {},
      disconnect: () => {},
    };
  }

  const maxConcurrentAnimations = options.maxConcurrentAnimations ?? 10;
  const animationInstances = new WeakMap<HTMLElement, LottieAnimationInstance>();
  const activeAnimations = new Set<HTMLElement>();
  const observedRoots = new Map<EmojiRoot, MutationObserver>();
  const allAnimatedElements = new Set<HTMLElement>();
  const nearViewportNodes = new Set<HTMLElement>();
  let visibilityObserver: IntersectionObserver | null = null;

  const playAnimation = (node: HTMLElement): void => {
    if (activeAnimations.size >= maxConcurrentAnimations) return;
    const animation = animationInstances.get(node);
    if (!animation || activeAnimations.has(node)) return;
    animation.play();
    activeAnimations.add(node);
  };

  const pauseAnimation = (node: HTMLElement): void => {
    const animation = animationInstances.get(node);
    if (!animation || !activeAnimations.has(node)) return;
    animation.pause();
    activeAnimations.delete(node);
  };

  const hydrateNode = async (node: HTMLElement): Promise<void> => {
    const emojiId = node.dataset.emojiId;
    if (!emojiId || !/^\d{1,32}$/.test(emojiId) || node.dataset.emojiAnimated) return;

    node.dataset.emojiAnimated = 'pending';
    let libraries: EmojiLibraries;
    try {
      libraries = await loadLibraries();
    } catch {
      node.dataset.emojiAnimated = 'false';
      return;
    }

    const animationData = await getAnimationData(emojiId, libraries.pako);
    if (!animationData) {
      node.dataset.emojiAnimated = 'false';
      return;
    }

    const container = document.createElement('span');
    container.className = 'tg-emoji-anim';

    let animation: LottieAnimationInstance;
    try {
      animation = libraries.lottie.loadAnimation({
        container,
        renderer: 'svg',
        loop: true,
        autoplay: false,
        animationData,
        rendererSettings: {
          preserveAspectRatio: 'xMidYMid meet',
        },
      });
    } catch {
      node.dataset.emojiAnimated = 'false';
      return;
    }

    node.replaceChildren(container);
    node.dataset.emojiAnimated = 'true';
    animationInstances.set(node, animation);
    allAnimatedElements.add(node);
    if (nearViewportNodes.has(node)) {
      playAnimation(node);
    }
  };

  const getVisibilityObserver = (): IntersectionObserver | null => {
    if (visibilityObserver) return visibilityObserver;
    if (!('IntersectionObserver' in window)) return null;

    visibilityObserver = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          const node = entry.target as HTMLElement;
          if (entry.isIntersecting) {
            nearViewportNodes.add(node);
            if (node.dataset.emojiAnimated === 'true') {
              playAnimation(node);
            } else if (!node.dataset.emojiAnimated) {
              void hydrateNode(node);
            }
          } else {
            nearViewportNodes.delete(node);
            pauseAnimation(node);
          }
        });
      },
      {
        rootMargin: '100px 0px',
        threshold: 0,
      }
    );

    return visibilityObserver;
  };

  const hydrate = async (root: ParentNode = document): Promise<void> => {
    const rootNode = root instanceof HTMLElement && root.matches('[data-emoji-id]') ? [root] : [];
    const nodes = [...rootNode, ...Array.from(root.querySelectorAll('[data-emoji-id]'))].filter((node) => {
      return node instanceof HTMLElement && !node.dataset.emojiAnimated;
    }) as HTMLElement[];

    if (!nodes.length) return;

    const observer = getVisibilityObserver();
    nodes.forEach((node) => {
      const emojiId = node.dataset.emojiId;
      if (!emojiId || !/^\d{1,32}$/.test(emojiId)) return;
      ensureStaticFallback(node, emojiId);
      if (observer) {
        observer.observe(node);
      } else {
        nearViewportNodes.add(node);
        void hydrateNode(node);
      }
    });
  };

  const observe = (root: EmojiRoot): void => {
    void hydrate(root);
    if (observedRoots.has(root)) {
      return;
    }

    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        mutation.addedNodes.forEach((node) => {
          if (node instanceof HTMLElement || node instanceof DocumentFragment) {
            void hydrate(node);
          }
        });
      });
    });

    observer.observe(root, { childList: true, subtree: true });
    observedRoots.set(root, observer);
  };

  const disconnect = (): void => {
    observedRoots.forEach((observer) => observer.disconnect());
    observedRoots.clear();

    if (visibilityObserver) {
      visibilityObserver.disconnect();
      visibilityObserver = null;
    }

    activeAnimations.clear();
    nearViewportNodes.clear();
    allAnimatedElements.forEach((node) => {
      const animation = animationInstances.get(node);
      animation?.destroy?.();
    });
    allAnimatedElements.clear();
  };

  return {
    hydrate,
    observe,
    disconnect,
  };
}
