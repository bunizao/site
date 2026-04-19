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

type EmojiRoot = ParentNode & Node;
type EmojiWindow = Window & typeof globalThis & {
  lottie?: LottieLike;
  pako?: PakoLike;
};

const LOTTIE_SRC = 'https://cdn.jsdelivr.net/npm/lottie-web@5.12.2/build/player/lottie.min.js';
const PAKO_SRC = 'https://cdn.jsdelivr.net/npm/pako@2.1.0/dist/pako.min.js';
const scriptCache = new Map<string, Promise<void>>();
const emojiCache = new Map<string, Promise<unknown | null>>();

function getEmojiWindow(): EmojiWindow {
  return window as EmojiWindow;
}

function loadScript(src: string): Promise<void> {
  if (scriptCache.has(src)) {
    return scriptCache.get(src) as Promise<void>;
  }

  const promise = new Promise<void>((resolve, reject) => {
    const existing = document.querySelector(`script[src="${src}"]`) as HTMLScriptElement | null;
    if (existing) {
      if (existing.dataset.loaded === 'true') {
        resolve();
        return;
      }
      existing.addEventListener('load', () => resolve(), { once: true });
      existing.addEventListener('error', () => reject(new Error(`Failed to load ${src}`)), { once: true });
      return;
    }

    const script = document.createElement('script');
    script.src = src;
    script.async = true;
    script.dataset.loaded = 'false';
    script.onload = () => {
      script.dataset.loaded = 'true';
      resolve();
    };
    script.onerror = () => reject(new Error(`Failed to load ${src}`));
    document.head.appendChild(script);
  });

  scriptCache.set(src, promise);
  return promise;
}

function ensureLibs(): Promise<void> {
  return Promise.all([loadScript(LOTTIE_SRC), loadScript(PAKO_SRC)]).then(() => undefined);
}

async function getAnimationData(emojiId: string): Promise<unknown | null> {
  if (emojiCache.has(emojiId)) {
    return emojiCache.get(emojiId) as Promise<unknown | null>;
  }

  const promise = (async () => {
    const metaResponse = await fetch(`/static/https://t.me/i/emoji/${emojiId}.json`, { cache: 'no-store' });
    if (!metaResponse.ok) return null;

    const meta = await metaResponse.json() as EmojiMetaResponse;
    const emojiUrl = meta.emoji;
    if (!emojiUrl) return null;

    const proxied = emojiUrl.startsWith('http') ? `/static/${emojiUrl}` : emojiUrl;
    const tgsResponse = await fetch(proxied);
    if (!tgsResponse.ok) return null;

    const buffer = await tgsResponse.arrayBuffer();
    const pako = getEmojiWindow().pako;
    if (!pako) return null;

    const bytes = new Uint8Array(buffer);
    const jsonText = new TextDecoder('utf-8').decode(pako.ungzip(bytes));
    return JSON.parse(jsonText) as unknown;
  })().catch(() => null);

  emojiCache.set(emojiId, promise);
  return promise;
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

  const getVisibilityObserver = (): IntersectionObserver => {
    if (visibilityObserver) {
      return visibilityObserver;
    }

    visibilityObserver = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          const node = entry.target as HTMLElement;
          if (entry.isIntersecting) {
            playAnimation(node);
          } else {
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
    const nodes = Array.from(root.querySelectorAll('[data-emoji-id]')).filter((node) => {
      return node instanceof HTMLElement && !node.dataset.emojiAnimated;
    }) as HTMLElement[];

    if (!nodes.length) return;

    try {
      await ensureLibs();
    } catch {
      return;
    }

    const lottie = getEmojiWindow().lottie;
    if (!lottie) return;

    const observer = getVisibilityObserver();

    await Promise.all(
      nodes.map(async (node) => {
        const emojiId = node.dataset.emojiId;
        if (!emojiId) return;

        node.dataset.emojiAnimated = 'pending';
        const animationData = await getAnimationData(emojiId);
        if (!animationData) {
          node.dataset.emojiAnimated = 'false';
          return;
        }

        node.dataset.emojiAnimated = 'true';
        const container = document.createElement('span');
        container.className = 'tg-emoji-anim';
        node.appendChild(container);

        const animation = lottie.loadAnimation({
          container,
          renderer: 'svg',
          loop: true,
          autoplay: false,
          animationData,
          rendererSettings: {
            preserveAspectRatio: 'xMidYMid meet',
          },
        });

        animationInstances.set(node, animation);
        allAnimatedElements.add(node);
        observer.observe(node);
      })
    );
  };

  const observe = (root: EmojiRoot): void => {
    void hydrate(root);
    if (observedRoots.has(root)) {
      return;
    }

    const observer = new MutationObserver((mutations) => {
      if (!mutations.some((mutation) => mutation.addedNodes.length > 0)) return;
      void hydrate(root);
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
