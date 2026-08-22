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

    // --- Apple Music listening cards: wire the shared MusicKit player ---
    // The card markup + metadata are baked at build time. The singleton tries
    // full-track playback on first tap and preserves the preview as its floor.
    // This layer owns the card feedback, scrubbing, marquee, and sampled accent.

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
      const request = { catalogId, previewUrl, preferFullTrack: true };
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
    // A tap opens the original. Inside a gallery that opens the whole gallery,
    // walkable with the arrow keys, the side buttons, or a swipe.
    const zoomable = Array.from(
      root.querySelectorAll<HTMLImageElement>(
        '.kg-image, .kg-image-card img, .kg-gallery-image img',
      ),
    );

    if (zoomable.length > 0) {
      // data-zoom-src carries the unresized original (the on-page srcset may
      // have picked a small variant); fall back to whatever is displayed.
      const sourceOf = (img: HTMLImageElement) => img.dataset.zoomSrc || img.currentSrc || img.src;

      // A gallery card is the set the author composed, and it is the only set
      // the lightbox walks. An image the author placed on its own opens on its
      // own — the article is a reading order, not an album.
      const groupOf = (img: HTMLImageElement): HTMLImageElement[] => {
        const card = img.closest('.kg-gallery-card');
        return card
          ? Array.from(card.querySelectorAll<HTMLImageElement>('.kg-gallery-image img'))
          : [img];
      };

      const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
      const CHEVRON =
        '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor"'
        + ' stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">'
        + '<path d="m15 4-8 8 8 8" /></svg>';
      const SWIPE_COMMIT = 60; // px of horizontal travel that turns the page

      let overlay: HTMLDivElement | null = null;
      let view!: HTMLImageElement;
      let counter!: HTMLElement;
      let group: HTMLImageElement[] = [];
      let index = 0;
      let returnFocus: HTMLElement | null = null;

      const at = (position: number) => {
        const total = group.length;
        return ((position % total) + total) % total; // the walk wraps both ways
      };

      // Warm a neighbour, so the next step is a paint and not a download.
      const preload = (position: number) => {
        const img = group[at(position)];
        if (img) new Image().src = sourceOf(img);
      };

      // One primitive for every move: the image lands from `fromX`. A step slides
      // in from the side it came from; a released swipe springs back from wherever
      // the finger left it.
      const slide = (fromX: number, fromOpacity: number) => {
        if (reduceMotion.matches) return;
        view.animate(
          [
            { transform: `translateX(${fromX}px)`, opacity: fromOpacity },
            { transform: 'none', opacity: 1 },
          ],
          { duration: 220, easing: 'cubic-bezier(0.22, 0.61, 0.36, 1)' },
        );
      };

      const show = (next: number, direction: number) => {
        index = at(next);
        const img = group[index];
        view.src = sourceOf(img);
        view.alt = img.alt;
        counter.textContent = `${index + 1} / ${group.length}`;
        if (direction !== 0) slide(direction * 40, 0);
        preload(index + 1);
        preload(index - 1);
      };

      const step = (direction: number) => {
        if (group.length > 1) show(index + direction, direction);
      };

      const close = () => {
        overlay?.classList.remove('is-open');
        document.removeEventListener('keydown', onKey);
        // `inert` pulls focus back out of the closed overlay and keeps its two
        // buttons out of the article's tab order — an invisible layer that is
        // still tabbable is worse than no layer at all.
        if (overlay) overlay.inert = true;
        returnFocus?.focus({ preventScroll: true });
        returnFocus = null;
      };

      const onKey = (event: KeyboardEvent) => {
        if (event.key === 'Escape') close();
        else if (event.key === 'ArrowLeft') step(-1);
        else if (event.key === 'ArrowRight') step(1);
        else return;
        event.preventDefault();
      };

      const build = () => {
        const node = document.createElement('div');
        node.className = 'blog-lightbox';
        node.tabIndex = -1;
        node.inert = true;
        node.setAttribute('role', 'dialog');
        node.setAttribute('aria-modal', 'true');
        node.setAttribute('aria-label', 'Image viewer');
        node.innerHTML =
          '<img class="blog-lightbox__image" alt="" />'
          + `<button class="blog-lightbox__nav blog-lightbox__nav--prev" type="button"`
          + ` data-step="-1" aria-label="Previous image">${CHEVRON}</button>`
          + `<button class="blog-lightbox__nav blog-lightbox__nav--next" type="button"`
          + ` data-step="1" aria-label="Next image">${CHEVRON}</button>`
          + '<p class="blog-lightbox__counter" aria-hidden="true"></p>';
        view = node.querySelector<HTMLImageElement>('.blog-lightbox__image')!;
        counter = node.querySelector<HTMLElement>('.blog-lightbox__counter')!;

        // Drag to walk the set: the image tracks the pointer, and a release past
        // SWIPE_COMMIT turns the page. Anything shorter springs back and still
        // counts as the tap that closes — the scrim's original job.
        let startX = 0;
        let startY = 0;
        let dragging = false;
        let dragged = false;

        const settle = () => {
          dragging = false;
          view.style.transform = '';
          view.style.opacity = '';
        };

        node.addEventListener('pointerdown', (event) => {
          dragged = false;
          if (event.button !== 0 || group.length < 2) return;
          if ((event.target as HTMLElement).closest('.blog-lightbox__nav')) return;
          startX = event.clientX;
          startY = event.clientY;
          dragging = true;
          // Capture, so a drag that leaves the window still ends on this node.
          node.setPointerCapture(event.pointerId);
        });

        node.addEventListener('pointermove', (event) => {
          if (!dragging) return;
          const dx = event.clientX - startX;
          // Claim the gesture only once it is clearly horizontal, so a vertical
          // flick never turns the page.
          if (!dragged) {
            if (Math.abs(dx) < 10 || Math.abs(dx) <= Math.abs(event.clientY - startY)) return;
            dragged = true;
          }
          view.style.transform = `translateX(${dx}px)`;
          view.style.opacity = String(Math.max(0.3, 1 - Math.abs(dx) / (window.innerWidth * 0.7)));
        });

        node.addEventListener('pointerup', (event) => {
          if (!dragging) return;
          const dx = event.clientX - startX;
          const opacity = Number(view.style.opacity) || 1;
          settle();
          if (!dragged) return;
          if (Math.abs(dx) > SWIPE_COMMIT) step(dx < 0 ? 1 : -1);
          else slide(dx, opacity);
        });

        node.addEventListener('pointercancel', settle);

        node.addEventListener('click', (event) => {
          // A mouse swipe ends in a click; that click is not a dismissal.
          if (dragged) {
            dragged = false;
            return;
          }
          const nav = (event.target as HTMLElement).closest<HTMLElement>('.blog-lightbox__nav');
          if (nav) step(Number(nav.dataset.step));
          else close();
        });

        document.body.appendChild(node);
        return node;
      };

      const open = (img: HTMLImageElement) => {
        overlay ??= build();
        group = groupOf(img);
        overlay.classList.toggle('is-solo', group.length < 2);
        returnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
        show(Math.max(0, group.indexOf(img)), 0);
        overlay.inert = false;
        overlay.classList.add('is-open');
        // Focus the overlay itself: the arrow keys are bound to the document, and
        // this puts a screen reader (and Tab) inside the dialog rather than back
        // in the article behind it.
        overlay.focus({ preventScroll: true });
        document.addEventListener('keydown', onKey);
      };

      zoomable.forEach((img) => {
        img.style.cursor = 'zoom-in';
        img.addEventListener('click', () => open(img));
      });
    }
  }
