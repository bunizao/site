  import { musicKitPlayer } from '@/lib/musickit/player';
  import {
    createBrowserListeningAnalytics,
    inferListeningSurface,
  } from '@/lib/listening/analytics';

  // --- Blur-up reveal: crossfade each image in once it decodes ---
  // Covers both the article body and the feature hero (outside .blog-prose).
  // An already-cached image fires no `load`, so reveal it immediately; a broken
  // one reveals too, so it never shimmers forever.
  document.querySelectorAll<HTMLElement>('.blog-media').forEach((media) => {
    const img = media.querySelector('img');
    if (!img) return;
    // After the crossfade (0.6s + 0.1s delay) the LQIP ::before is invisible
    // but still a live blur(14px) layer; dropping the class releases it —
    // otherwise a media-heavy article keeps every one composited (WebKit pays
    // this in memory and scroll work).
    const reveal = () => {
      media.classList.add('is-loaded');
      setTimeout(() => media.classList.remove('is-blur'), 900);
    };
    if (img.complete && img.naturalWidth > 0) reveal();
    else {
      img.addEventListener('load', reveal, { once: true });
      img.addEventListener('error', reveal, { once: true });
    }
  });

  const root = document.querySelector('.blog-prose');
  if (root) {
    // --- Gallery: restore Ghost's flex-ratio layout ---
    // Ghost normally inlines flex-grow ∝ aspect ratio so a row tiles to a single
    // height. The live feed omits it, so derive it from each image's dimensions.
    root.querySelectorAll('.kg-gallery-image').forEach((cell) => {
      const img = cell.querySelector<HTMLImageElement>('img');
      if (!img) return;
      const ratio =
        (img.naturalWidth || Number(img.getAttribute('width')) || 1) /
        (img.naturalHeight || Number(img.getAttribute('height')) || 1);
      (cell as HTMLElement).style.flex = `${ratio} 1 0`;
    });

    // --- Video: drop Ghost's JS player chrome, use a native player ---
    // Ghost's overlay/play-button/scrubber need a runtime we don't ship. Strip
    // them and give the bare <video> native controls. The real poster and
    // `preload="none"` are baked at build time (blur-up.ts), so nothing
    // downloads until the card is reached.
    root.querySelectorAll('.kg-video-card').forEach((card) => {
      const video = card.querySelector('video');
      if (!video) return;

      video.setAttribute('controls', '');
      // (Ghost's inline background thumbnail is stripped at build; the --lqip
      // custom property carries the placeholder, so leave `background` alone.)

      // Remove the non-functional Ghost player furniture.
      card
        .querySelectorAll('.kg-video-overlay, .kg-video-player-container, .kg-video-player')
        .forEach((el) => el.remove());

      // Lift the <video> out of Ghost's now-empty container wrapper.
      const container = card.querySelector('.kg-video-container');
      if (container && video.parentElement === container) {
        container.replaceWith(video);
      }
    });

    // Lazy media on video cards, driven by one IntersectionObserver:
    //  - data-blog-poster → the real thumbnail, promoted to `poster` as the
    //    card approaches (until then the inlined --lqip blur fills the slot);
    //  - data-blog-autoplay → Ghost ambient loops, demoted at build. Play on
    //    approach, pause off-screen: looks native-autoplay in view, but a
    //    13 MB loop three screens down costs nothing until the reader arrives.
    const lazyVideos = root.querySelectorAll<HTMLVideoElement>(
      'video[data-blog-poster], video[data-blog-autoplay]',
    );
    if (lazyVideos.length > 0) {
      const io = new IntersectionObserver(
        (entries) => {
          entries.forEach((entry) => {
            const video = entry.target as HTMLVideoElement;
            if (entry.isIntersecting) {
              if (video.dataset.blogPoster) {
                video.poster = video.dataset.blogPoster;
                delete video.dataset.blogPoster;
              }
              if ('blogAutoplay' in video.dataset) {
                video.muted = true; // required for programmatic autoplay
                video.play().catch(() => {}); // autoplay veto → poster stays, controls work
              }
            } else if ('blogAutoplay' in video.dataset) {
              video.pause();
            }
          });
        },
        { rootMargin: '25% 0px' },
      );
      lazyVideos.forEach((video) => io.observe(video));
    }

    // --- Mood embeds: grow the iframe to its real content height ---
    // Ghost HTML cards can embed buxx.me/mood (class="js-mood-embed"), which
    // posts a {type:'mood-embed-resize', height} message but ships no host-side
    // listener. Authors hardcode a short height + overflow:hidden, so the embed
    // clips (avatar, title, image cut off). We are the documented host here, so
    // wire the listener: unclip the frame and size it to the reported height.
    const moodFrames = root.querySelectorAll<HTMLIFrameElement>(
      'iframe.js-mood-embed, iframe[src*="/mood/embed"]',
    );
    if (moodFrames.length > 0) {
      moodFrames.forEach((frame) => {
        frame.style.height = '120px';
        frame.style.overflow = 'hidden';
      });
      window.addEventListener('message', (event) => {
        const data = event.data;
        if (!data || data.type !== 'mood-embed-resize') return;
        const height = Number(data.height);
        if (!Number.isFinite(height)) return;
        moodFrames.forEach((frame) => {
          if (frame.contentWindow && event.source === frame.contentWindow) {
            frame.style.height = `${Math.max(120, Math.ceil(height))}px`;
          }
        });
      });

      // Keep the embed's theme in step with the blog (the toggle adds/removes
      // `.dark` on <html>); without this the iframe only follows the OS scheme.
      const moodTheme = () =>
        document.documentElement.classList.contains('dark') ? 'dark' : 'light';
      const pushMoodTheme = () => {
        moodFrames.forEach((frame) => {
          frame.contentWindow?.postMessage({ type: 'mood-embed-theme', theme: moodTheme() }, '*');
        });
      };
      moodFrames.forEach((frame) => frame.addEventListener('load', pushMoodTheme));
      new MutationObserver(pushMoodTheme).observe(document.documentElement, {
        attributes: true,
        attributeFilter: ['class'],
      });
    }

    // --- Promote literary blockquotes to verse cards ---
    // The author marks verse three ways and we normalize all of them into clean
    // stanza <p>s so the .blog-poem CSS applies uniformly:
    //   1) an explicit "[!poem] Title [center]" lead (often wrapped in <em>),
    //      with the body hand-broken by <br> and no <p> wrappers;
    //   2) a plain quote closing with a dash attribution ("… — 海子");
    //   3) hand-broken verse (>=2 <br>) with neither marker nor attribution.
    // Prose blockquotes (a single <p>, no breaks, no attribution) stay untouched.
    // Attribution: a signature line. The poem-card spec recognises a leading
    // em/en dash, a double hyphen, or a single hyphen.
    const ATTRIBUTION = /[—–]\s*[^—–\n]{1,40}\s*$/;
    const ATTRIBUTION_ONLY = /^(?:[—–]|--|-)\s*\S.{0,40}$/;
    const INLINE_ATTRIBUTION = /^([\s\S]*?)\s*((?:[—–]|--)\s*[^—–<]{1,40})\s*$/;
    const stripTags = (value: string) => {
      const parsed = new DOMParser().parseFromString(value, 'text/html');
      return (parsed.body.textContent ?? '').replace(/\s+/g, ' ').trim();
    };

    const promotePoem = (quote: HTMLElement, rawHtml: string) => {
      let html = rawHtml;
      let title = '';
      let center = false;
      let plain = false;

      // Lift a leading "[!poem] Title [center] [plain]" marker (often wrapped in
      // an inline tag like <em>), then drop its closing tag and the trailing <br>.
      // The [center]/[plain] modifiers may appear in any order around the title.
      const marker = html.match(/^\s*(?:<(?:em|strong|b|i|p)>\s*)?\[!poem\]\s*([^<\n]*)/i);
      if (marker) {
        const label = marker[1]
          .replace(/\[(center|plain)\]/gi, (_full, mod: string) => {
            if (/center/i.test(mod)) center = true;
            else plain = true;
            return '';
          })
          .replace(/\s+/g, ' ')
          .trim();
        title = label;
        html = html
          .slice(marker[0].length)
          .replace(/^\s*(?:<\/(?:em|strong|b|i|p)>)?\s*(?:<br\s*\/?>\s*)?/i, '');
      }

      // Stanzas: each <p> when Ghost wrapped them, else split hand-broken lines on
      // a blank line (<br><br>) and keep single <br>s as line breaks within one.
      let stanzas: string[];
      if (/<p[\s>]/i.test(html)) {
        const box = document.createElement('div');
        box.innerHTML = html;
        stanzas = Array.from(box.querySelectorAll('p'))
          .map((p) => p.innerHTML.trim())
          .filter(Boolean);
      } else {
        stanzas = html
          .split(/(?:<br\s*\/?>\s*){2,}/i)
          .map((s) => s.replace(/^(?:\s*<br\s*\/?>)+|(?:<br\s*\/?>\s*)+$/gi, '').trim())
          .filter(Boolean);
      }
      if (stanzas.length === 0) return;

      // Pull a trailing "— Name" onto its own signature line.
      let attribution = '';
      const last = stanzas[stanzas.length - 1];
      if (ATTRIBUTION_ONLY.test(stripTags(last)) && stanzas.length > 1) {
        attribution = stanzas.pop()!;
      } else {
        const split = last.match(INLINE_ATTRIBUTION);
        if (split) {
          stanzas[stanzas.length - 1] = split[1].trim();
          attribution = split[2].trim();
        }
      }

      const parts: string[] = [];
      if (title) parts.push(`<p class="blog-poem__title">${title}</p>`);
      for (const s of stanzas) parts.push(`<p>${s}</p>`);
      if (attribution) parts.push(`<cite class="blog-poem__attribution">${attribution}</cite>`);

      quote.innerHTML = parts.join('');
      quote.classList.add('blog-poem');
      if (center) quote.classList.add('blog-poem--center');
      if (plain) quote.classList.add('blog-poem--plain');
    };

    root.querySelectorAll<HTMLElement>('blockquote').forEach((quote) => {
      if (quote.classList.contains('blog-poem')) return;
      const html = quote.innerHTML;
      const text = (quote.textContent || '').replace(/\s+/g, ' ').trim();
      if (!text) return;

      const hasMarker = /^\s*(?:<\w+>\s*)?\[!poem\]/i.test(html);
      const hasAttribution = ATTRIBUTION.test(text);
      // Hand-broken verse: several <br>s and no list/heading/code structure.
      const versey = (html.match(/<br\s*\/?>/gi) || []).length >= 2 && !/<\/(ul|ol|h[1-6]|pre)>/i.test(html);

      if (hasMarker || hasAttribution || versey) promotePoem(quote, html);
    });

    // --- Apple Music listening cards: wire the 30s preview toggle ---
    // The card markup + metadata are baked at build time; here we only add the
    // play/pause interaction, the long-title marquee, and an artwork-sampled
    // accent — mirroring the homepage now-playing widget. One <audio> per card,
    // created lazily on first tap.

    // Pull a vivid accent from the cover art so the playing wave + progress bar
    // can tint to the track, the same approach as features/home/ui/Listening.astro (kept
    // lightweight here — average the saturated pixels, skip near-grey/extremes).
    const sampleAccent = (image: HTMLImageElement): string | null => {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      if (!ctx || !image.naturalWidth || !image.naturalHeight) return null;
      const size = 24;
      canvas.width = size;
      canvas.height = size;
      ctx.drawImage(image, 0, 0, size, size);
      let data: Uint8ClampedArray;
      try {
        data = ctx.getImageData(0, 0, size, size).data;
      } catch {
        return null; // tainted canvas — fall back to the grey default
      }
      let r = 0;
      let g = 0;
      let b = 0;
      let weight = 0;
      for (let i = 0; i < data.length; i += 4) {
        if ((data[i + 3] ?? 0) < 180) continue;
        const red = data[i] ?? 0;
        const green = data[i + 1] ?? 0;
        const blue = data[i + 2] ?? 0;
        const max = Math.max(red, green, blue);
        const min = Math.min(red, green, blue);
        const sat = max === 0 ? 0 : (max - min) / max;
        const light = (max + min) / 510;
        if (sat < 0.18 || light < 0.14 || light > 0.86) continue;
        const w = 0.3 + sat;
        r += red * w;
        g += green * w;
        b += blue * w;
        weight += w;
      }
      if (weight === 0) return null;
      return `rgb(${Math.round(r / weight)} ${Math.round(g / weight)} ${Math.round(b / weight)})`;
    };

    // When the title is wider than its column, clone the run and scroll it.
    const syncMusicMarquee = (card: Element) => {
      const title = card.querySelector<HTMLElement>('[data-blog-music-title]');
      const text = card.querySelector<HTMLElement>('[data-blog-music-title-text]');
      const label = card.querySelector<HTMLElement>('[data-blog-music-title-label]');
      if (!title || !text || !label) return;
      title.classList.remove('is-marquee');
      requestAnimationFrame(() => {
        const overflow = label.scrollWidth > title.clientWidth + 2;
        if (!overflow) return;
        const distance = label.scrollWidth + 28;
        const duration = Math.max(12, Math.min(26, distance / 22));
        title.style.setProperty('--title-marquee-distance', `${distance}px`);
        title.style.setProperty('--title-marquee-duration', `${duration}s`);
        title.classList.add('is-marquee');
      });
    };

    root.querySelectorAll('[data-blog-music]').forEach((card) => {
      const artwork = card.querySelector<HTMLImageElement>('[data-blog-music-artwork]');
      if (artwork) {
        const applyAccent = () => {
          try {
            const accent = sampleAccent(artwork);
            if (accent) (card as HTMLElement).style.setProperty('--blog-music-accent', accent);
          } catch {
            /* leave the grey default */
          }
        };
        if (artwork.complete) applyAccent();
        else artwork.addEventListener('load', applyAccent, { once: true });
      }

      syncMusicMarquee(card);
      window.addEventListener('resize', () => syncMusicMarquee(card), { passive: true });

      const button = card.querySelector<HTMLButtonElement>('[data-blog-music-play]');
      if (!button) return;
      const catalogId = button.dataset.appleCatalogId ?? '';
      const previewUrl = button.dataset.previewUrl ?? '';
      if (!catalogId && !previewUrl) return;

      // One PlayRequest per card. Identity matters: the singleton tells us
      // "is this card the active owner" by reference, not by id string.
      const request = { catalogId, previewUrl };
      const cardEl = card as HTMLElement;
      const listeningAnalytics = createBrowserListeningAnalytics(() => ({
        trackId: cardEl.dataset.trackId?.trim() || catalogId.trim() || null,
        trackTitle: cardEl.dataset.trackTitle?.trim() || 'Track',
        trackArtist: cardEl.dataset.trackArtist?.trim() || null,
        pagePath: window.location.pathname,
        surface: inferListeningSurface(window.location.pathname),
      }));

      const recordEl = card.querySelector<HTMLElement>('.blog-music__record');
      const progress = card.querySelector<HTMLElement>('[data-blog-music-progress]');
      const elapsedEl = card.querySelector<HTMLElement>('[data-blog-music-elapsed]');
      const totalEl = card.querySelector<HTMLElement>('[data-blog-music-total]');
      const RECORD_SCRUB_TURNS = 6;
      let wasPlaying = false;

      const syncProgress = (fraction: number) => {
        const clamped = Math.min(1, Math.max(0, fraction));
        if (progress) {
          progress.style.setProperty('--fill', String(clamped));
          progress.setAttribute('aria-valuenow', String(Math.round(clamped * 100)));
        }
      };

      // Resolve the three rotating elements once, then write transform directly
      // to each during a drag. Setting --record-rotation on the card instead
      // would be one write, but it invalidates style for the card's whole
      // subtree — title, buttons, progress track and all — on every pointermove,
      // to move three elements. The variable stays for the non-drag paths below.
      const spinners = [
        cardEl.querySelector<HTMLElement>('.blog-music__record'),
        cardEl.querySelector<HTMLElement>('.blog-music__cover'),
        cardEl.querySelector<HTMLElement>('.blog-music__label'),
      ].filter((el): el is HTMLElement => el !== null);

      const syncRecordRotation = (fraction: number) => {
        const clamped = Math.min(1, Math.max(0, fraction));
        const turns = clamped * RECORD_SCRUB_TURNS;
        for (const el of spinners) {
          el.style.transform = `translate(-50%, -50%) rotate(${turns}turn)`;
        }
      };

      const freezeCurrentRecordRotation = () => {
        if (!recordEl) return;
        const transform = getComputedStyle(recordEl).transform;
        if (!transform || transform === 'none') return;
        const matrix = new DOMMatrixReadOnly(transform);
        const degrees = Math.atan2(matrix.b, matrix.a) * (180 / Math.PI);
        cardEl.style.setProperty('--record-rotation', `${degrees}deg`);
      };

      const formatTime = (seconds: number) => {
        if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
        const m = Math.floor(seconds / 60);
        const s = Math.floor(seconds % 60);
        return `${m}:${s.toString().padStart(2, '0')}`;
      };

      musicKitPlayer.subscribe((snap) => {
        const ours = snap.owner === request;
        const playing = ours && snap.isPlaying;
        if (wasPlaying && !playing) freezeCurrentRecordRotation();
        card.classList.toggle('is-playing', playing);
        cardEl.classList.toggle('is-source-full', ours && snap.source === 'full');
        cardEl.classList.toggle('is-source-preview', ours && snap.source === 'preview');
        button.setAttribute('aria-pressed', String(playing));
        wasPlaying = playing;

        const duration = ours ? snap.duration : 0;
        const current = ours ? snap.currentTime : 0;
        listeningAnalytics?.observe({
          owned: ours,
          isPlaying: playing,
          currentTime: current,
          duration,
        });
        const fraction = duration > 0 ? Math.min(1, current / duration) : 0;
        syncProgress(fraction);
        if (elapsedEl) elapsedEl.textContent = formatTime(current);
        if (totalEl) totalEl.textContent = duration > 0 ? formatTime(duration) : '';
      });

      button.addEventListener('click', () => {
        const snapshot = musicKitPlayer.snapshot();
        const startsPlayback = snapshot.owner !== request
          || (!snapshot.isPlaying && !snapshot.isLoading);
        if (startsPlayback) listeningAnalytics?.requestPlay();
        musicKitPlayer.toggle(request).catch(() => undefined);
      });

      // Draggable seek. Pointer events cover mouse + touch + pen in one path.
      if (progress) {
        const seekFromEvent = (event: PointerEvent) => {
          const rect = progress.getBoundingClientRect();
          if (rect.width <= 0) return;
          const fraction = (event.clientX - rect.left) / rect.width;
          syncProgress(fraction);
          syncRecordRotation(fraction);
          musicKitPlayer.seekFraction(fraction);
        };
        let scrubbing = false;
        progress.addEventListener('pointerdown', (event) => {
          if (musicKitPlayer.snapshot().owner !== request) return;
          scrubbing = true;
          cardEl.classList.add('is-scrubbing');
          progress.setPointerCapture(event.pointerId);
          seekFromEvent(event);
        });
        progress.addEventListener('pointermove', (event) => {
          if (!scrubbing) return;
          seekFromEvent(event);
        });
        const endScrub = (event: PointerEvent) => {
          if (!scrubbing) return;
          scrubbing = false;
          // Hand the transform back to the stylesheet before the spin animation
          // resumes; an inline transform would outrank the keyframes and freeze
          // the record at wherever the finger left it.
          freezeCurrentRecordRotation();
          for (const el of spinners) el.style.removeProperty('transform');
          cardEl.classList.remove('is-scrubbing');
          listeningAnalytics?.recordSeek();
          progress.releasePointerCapture(event.pointerId);
        };
        progress.addEventListener('pointerup', endScrub);
        progress.addEventListener('pointercancel', endScrub);
      }
    });

    // --- Tap-to-zoom lightbox for content images ---
    const zoomable = root.querySelectorAll<HTMLImageElement>(
      '.kg-image, .kg-image-card img, .kg-gallery-image img',
    );

    if (zoomable.length > 0) {
      let overlay: HTMLDivElement | null = null;

      const close = () => {
        overlay?.classList.remove('is-open');
        document.removeEventListener('keydown', onKey);
      };
      const onKey = (event: KeyboardEvent) => {
        if (event.key === 'Escape') close();
      };

      const open = (src: string, alt: string) => {
        if (!overlay) {
          overlay = document.createElement('div');
          overlay.className = 'blog-lightbox';
          overlay.innerHTML = '<img alt="" />';
          overlay.addEventListener('click', close);
          document.body.appendChild(overlay);
        }
        const img = overlay.querySelector('img')!;
        img.src = src;
        img.alt = alt;
        overlay.classList.add('is-open');
        document.addEventListener('keydown', onKey);
      };

      zoomable.forEach((img) => {
        img.style.cursor = 'zoom-in';
        // data-zoom-src carries the unresized original (the on-page srcset may
        // have picked a small variant); fall back to whatever is displayed.
        img.addEventListener('click', () =>
          open(img.dataset.zoomSrc || img.currentSrc || img.src, img.alt));
      });
    }
  }
