type ListeningRoot = Pick<HTMLElement, 'classList'>;
type ListeningToggleButton = Pick<HTMLButtonElement, 'setAttribute'>;
type ListeningPanel = Pick<HTMLElement, 'toggleAttribute'>;

export function setListeningPanelExpanded(
  root: ListeningRoot,
  toggleButton: ListeningToggleButton,
  panel: ListeningPanel,
  isExpanded: boolean
): void {
  root.classList.toggle('is-expanded', isExpanded);
  toggleButton.setAttribute('aria-expanded', isExpanded ? 'true' : 'false');
  toggleButton.setAttribute('aria-label', isExpanded ? 'Hide track list' : 'Show track list');
  panel.toggleAttribute('hidden', !isExpanded);
}

export function initListeningSection(): void {
  const roots = document.querySelectorAll('[data-listening]');

  roots.forEach((root) => {
    if (!(root instanceof HTMLElement) || root.dataset.bound === 'true') {
      return;
    }

    root.dataset.bound = 'true';

    const items = Array.from(root.querySelectorAll('[data-listening-item]')).filter(
      (item) => item instanceof HTMLButtonElement
    );
    const playButton = root.querySelector('[data-listening-play]');
    const toggleButton = root.querySelector('[data-listening-toggle]');
    const panel = root.querySelector('[data-listening-panel]');
    const title = root.querySelector('[data-listening-title]');
    const artist = root.querySelector('[data-listening-artist]');
    const link = root.querySelector('[data-listening-link]');
    const cover = root.querySelector('[data-listening-cover]');

    if (!(playButton instanceof HTMLButtonElement) || !(cover instanceof HTMLImageElement) || items.length === 0) {
      return;
    }

    const audio = new Audio();
    audio.preload = 'none';

    let activeItem = items.find((item) => item.classList.contains('is-active')) ?? items[0];

    if (toggleButton instanceof HTMLButtonElement && panel instanceof HTMLElement) {
      setListeningPanelExpanded(root, toggleButton, panel, root.classList.contains('is-expanded'));

      toggleButton.addEventListener('click', () => {
        const isExpanded = !root.classList.contains('is-expanded');
        setListeningPanelExpanded(root, toggleButton, panel, isExpanded);
      });
    }

    const setPlayState = (isPlaying: boolean, hasPreview: boolean, trackTitle: string) => {
      playButton.disabled = !hasPreview;
      playButton.classList.toggle('is-playing', hasPreview && isPlaying);
      playButton.setAttribute('aria-pressed', hasPreview && isPlaying ? 'true' : 'false');

      const action = isPlaying ? 'Pause' : 'Play';
      playButton.setAttribute(
        'aria-label',
        hasPreview ? `${action} preview of ${trackTitle}` : `${trackTitle} preview unavailable`
      );
    };

    const stopAudio = () => {
      audio.pause();
      audio.currentTime = 0;
      setPlayState(false, Boolean(activeItem?.dataset.previewUrl), activeItem?.dataset.title ?? 'Track');
    };

    const syncFeature = (item: HTMLButtonElement) => {
      activeItem = item;

      items.forEach((candidate) => {
        const isSelected = candidate === item;
        candidate.classList.toggle('is-active', isSelected);
        candidate.setAttribute('aria-pressed', isSelected ? 'true' : 'false');
      });

      if (title instanceof HTMLElement) {
        title.textContent = item.dataset.title ?? '';
      }

      if (artist instanceof HTMLElement) {
        artist.textContent = item.dataset.artist ?? '';
      }

      if (link instanceof HTMLAnchorElement) {
        link.href = item.dataset.link ?? '#';
        link.setAttribute('aria-label', `Open ${item.dataset.title ?? 'track'} on Apple Music`);
      }

      if (item.dataset.artwork) {
        cover.src = item.dataset.artwork;
        cover.alt = `${item.dataset.title ?? 'Track'} cover art`;
      }

      if (audio.src !== (item.dataset.previewUrl ?? '')) {
        audio.pause();
        audio.currentTime = 0;
        if (item.dataset.previewUrl) {
          audio.src = item.dataset.previewUrl;
        } else {
          audio.removeAttribute('src');
        }
      }

      setPlayState(false, Boolean(item.dataset.previewUrl), item.dataset.title ?? 'Track');
    };

    playButton.addEventListener('click', async () => {
      if (!(activeItem instanceof HTMLButtonElement)) {
        return;
      }

      const previewUrl = activeItem.dataset.previewUrl ?? '';
      if (!previewUrl) {
        return;
      }

      if (audio.src !== previewUrl) {
        audio.src = previewUrl;
      }

      if (audio.paused) {
        try {
          await audio.play();
          setPlayState(true, true, activeItem.dataset.title ?? 'Track');
        } catch {
          setPlayState(false, true, activeItem.dataset.title ?? 'Track');
        }

        return;
      }

      stopAudio();
    });

    audio.addEventListener('ended', () => {
      setPlayState(false, Boolean(activeItem?.dataset.previewUrl), activeItem?.dataset.title ?? 'Track');
    });

    items.forEach((item) => {
      item.addEventListener('click', () => {
        if (item !== activeItem) {
          stopAudio();
        }

        syncFeature(item);
      });
    });

    syncFeature(activeItem);
  });
}
