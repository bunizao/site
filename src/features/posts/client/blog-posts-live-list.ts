// Polls /dev/portal/api/ghost-posts for near-realtime updates to the Ghost
// post list on /dev/portal/blog. Rebuilds the grouped list in place, keeps
// the current selection (falling back to the first draft/post if it
// disappeared), flashes rows whose status or updated time changed, and only
// swaps the preview iframe when the selection itself changes — the iframe
// page (/dev/blog/[id]) already live-reloads its own content. Pauses polling
// while the tab is hidden, mirroring draft-live-reload.ts.

const POLL_MS = 5_000;
const MAX_RETRY_MS = 30_000;
const FLASH_MS = 1_200;

interface GhostPostSummary {
  id: string;
  slug: string;
  title: string;
  status: string;
  updatedAt: string | null;
}

const GROUP_ORDER: readonly { key: string; label: string }[] = [
  { key: 'draft', label: 'Drafts' },
  { key: 'scheduled', label: 'Scheduled' },
  { key: 'published', label: 'Published' },
  { key: 'other', label: 'Other' },
];

function groupKeyFor(status: string): string {
  return status === 'draft' || status === 'scheduled' || status === 'published' ? status : 'other';
}

const relativeFormatter = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });

function formatRelativeTime(iso: string | null): string {
  if (!iso) return 'never';
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return 'unknown';

  const diffMinutes = Math.round((Date.now() - then) / 60_000);
  if (Math.abs(diffMinutes) < 1) return 'just now';
  if (Math.abs(diffMinutes) < 60) return relativeFormatter.format(-diffMinutes, 'minute');

  const diffHours = Math.round(diffMinutes / 60);
  if (Math.abs(diffHours) < 24) return relativeFormatter.format(-diffHours, 'hour');

  const diffDays = Math.round(diffHours / 24);
  return relativeFormatter.format(-diffDays, 'day');
}

function buildRow(post: GhostPostSummary, selectedId: string, ghostEditorBase: string): HTMLLIElement {
  const row = document.createElement('li');
  row.className = 'blog-post-row';
  row.dataset.postId = post.id;
  row.dataset.slug = post.slug;
  row.dataset.status = post.status;
  row.dataset.updatedAt = post.updatedAt ?? '';
  if (post.id === selectedId) row.setAttribute('aria-current', 'true');

  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'blog-post-row-main';

  const title = document.createElement('span');
  title.className = 'blog-post-row-title';
  title.textContent = post.title.trim() || 'Untitled';
  button.append(title);

  const meta = document.createElement('span');
  meta.className = 'blog-post-row-meta';

  const chip = document.createElement('span');
  chip.className = 'blog-status-chip';
  chip.dataset.status = post.status;
  chip.textContent = post.status;
  meta.append(chip);

  const slug = document.createElement('span');
  slug.className = 'blog-post-row-slug';
  slug.textContent = post.slug;
  meta.append(slug);

  const time = document.createElement('span');
  time.className = 'blog-post-row-time';
  time.dataset.updatedLabel = 'true';
  time.textContent = formatRelativeTime(post.updatedAt);
  meta.append(time);

  button.append(meta);
  row.append(button);

  const actions = document.createElement('span');
  actions.className = 'blog-post-row-actions';
  if (ghostEditorBase) {
    const ghostLink = document.createElement('a');
    ghostLink.className = 'blog-post-row-action';
    ghostLink.href = `${ghostEditorBase}${post.id}`;
    ghostLink.target = '_blank';
    ghostLink.rel = 'noreferrer';
    ghostLink.textContent = 'Ghost';
    actions.append(ghostLink);
  }
  if (post.status === 'published') {
    const viewLink = document.createElement('a');
    viewLink.className = 'blog-post-row-action';
    viewLink.href = `/blog/${post.slug}`;
    viewLink.target = '_blank';
    viewLink.rel = 'noreferrer';
    viewLink.textContent = 'View';
    actions.append(viewLink);
  }
  row.append(actions);

  return row;
}

function buildEmptyState(title: string, hint: string): HTMLDivElement {
  const wrap = document.createElement('div');
  wrap.className = 'portal-empty';

  const titleEl = document.createElement('p');
  titleEl.className = 'portal-empty-title';
  titleEl.textContent = title;

  const hintEl = document.createElement('p');
  hintEl.className = 'portal-empty-hint';
  hintEl.textContent = hint;

  wrap.append(titleEl, hintEl);
  return wrap;
}

export function startGhostPostsLiveList(root: HTMLElement): () => void {
  const groupsContainer = root.querySelector<HTMLElement>('[data-post-groups]');
  const countEl = root.querySelector<HTMLElement>('[data-post-count]');
  const previewTitle = root.querySelector<HTMLElement>('[data-preview-title]');
  const previewGhostLink = root.querySelector<HTMLAnchorElement>('[data-preview-ghost-link]');
  const previewFrame = root.querySelector<HTMLElement>('[data-preview-frame]');
  const ghostEditorBase = root.dataset.ghostEditorBase ?? '';

  if (!groupsContainer || !previewFrame) return () => {};

  let selectedId = root.dataset.selectedId ?? '';
  let stopped = false;
  let failures = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let controller: AbortController | undefined;

  const schedule = (delay: number) => {
    if (stopped) return;
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => void poll(), delay);
  };

  function rowTitle(id: string): string {
    const row = groupsContainer!.querySelector<HTMLElement>(
      `.blog-post-row[data-post-id="${CSS.escape(id)}"]`,
    );
    return row?.querySelector('.blog-post-row-title')?.textContent ?? '';
  }

  function applySelection(id: string, forceIframeReload: boolean): void {
    const previousId = selectedId;
    selectedId = id;

    groupsContainer!.querySelectorAll<HTMLElement>('.blog-post-row').forEach((row) => {
      if (row.dataset.postId === id) row.setAttribute('aria-current', 'true');
      else row.removeAttribute('aria-current');
    });

    if (previewTitle) previewTitle.textContent = id ? rowTitle(id) || 'Untitled' : 'No post selected';
    if (previewGhostLink) {
      if (id && ghostEditorBase) {
        previewGhostLink.href = `${ghostEditorBase}${id}`;
        previewGhostLink.hidden = false;
      } else {
        previewGhostLink.hidden = true;
      }
    }

    if (!id) {
      previewFrame!.replaceChildren(
        buildEmptyState('Select a post', 'Choose a post from the list to preview it here.'),
      );
      return;
    }

    const hasIframe = Boolean(previewFrame!.querySelector('iframe'));
    if (forceIframeReload || previousId !== id || !hasIframe) {
      const iframe = document.createElement('iframe');
      iframe.className = 'blog-portal-iframe';
      iframe.title = 'Ghost post preview';
      iframe.src = `/dev/blog/${id}`;
      previewFrame!.replaceChildren(iframe);
    }
  }

  groupsContainer.addEventListener('click', (event) => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    const button = target.closest<HTMLElement>('.blog-post-row-main');
    if (!button) return;
    const row = button.closest<HTMLElement>('.blog-post-row');
    const id = row?.dataset.postId;
    if (id && id !== selectedId) applySelection(id, true);
  });

  function flash(id: string): void {
    const row = groupsContainer!.querySelector<HTMLElement>(
      `.blog-post-row[data-post-id="${CSS.escape(id)}"]`,
    );
    if (!row) return;
    row.classList.remove('blog-post-row--flash');
    void row.offsetWidth; // restart the animation if it is already running
    row.classList.add('blog-post-row--flash');
    setTimeout(() => row.classList.remove('blog-post-row--flash'), FLASH_MS);
  }

  function render(posts: GhostPostSummary[]): void {
    const previous = new Map<string, { status: string; updatedAt: string | null }>();
    groupsContainer!.querySelectorAll<HTMLElement>('.blog-post-row').forEach((row) => {
      const id = row.dataset.postId;
      if (id) previous.set(id, { status: row.dataset.status ?? '', updatedAt: row.dataset.updatedAt || null });
    });

    if (countEl) countEl.textContent = String(posts.length);

    if (posts.length === 0) {
      groupsContainer!.replaceChildren(
        buildEmptyState('No Ghost posts yet', 'Posts you create in Ghost will show up here.'),
      );
      applySelection('', false);
      return;
    }

    const changedIds = posts
      .filter((post) => {
        const prior = previous.get(post.id);
        return !prior || prior.status !== post.status || prior.updatedAt !== post.updatedAt;
      })
      .map((post) => post.id);

    const groups = GROUP_ORDER
      .map((group) => ({ ...group, items: posts.filter((post) => groupKeyFor(post.status) === group.key) }))
      .filter((group) => group.items.length > 0);

    const stillSelected = Boolean(selectedId) && posts.some((post) => post.id === selectedId);
    const nextSelectedId = stillSelected
      ? selectedId
      : (groups.find((group) => group.key === 'draft')?.items[0]?.id ?? posts[0]?.id ?? '');

    const fragment = document.createDocumentFragment();
    for (const group of groups) {
      const section = document.createElement('div');
      section.className = 'blog-portal-group';
      section.dataset.group = group.key;

      const label = document.createElement('div');
      label.className = 'blog-portal-group-label';
      label.append(document.createTextNode(`${group.label} `));
      const count = document.createElement('span');
      count.textContent = String(group.items.length);
      label.append(count);
      section.append(label);

      const list = document.createElement('ul');
      list.className = 'blog-portal-rows';
      list.setAttribute('role', 'list');
      for (const post of group.items) list.append(buildRow(post, nextSelectedId, ghostEditorBase));
      section.append(list);

      fragment.append(section);
    }

    groupsContainer!.replaceChildren(fragment);
    applySelection(nextSelectedId, false);

    for (const id of changedIds) flash(id);
  }

  async function fetchPosts(): Promise<GhostPostSummary[]> {
    controller = new AbortController();
    const response = await fetch('/dev/portal/api/ghost-posts', {
      cache: 'no-store',
      credentials: 'same-origin',
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`ghost_posts_fetch_failed_${response.status}`);

    const data = (await response.json()) as { posts?: unknown };
    if (!Array.isArray(data.posts)) throw new Error('ghost_posts_invalid_payload');
    return data.posts as GhostPostSummary[];
  }

  async function poll(): Promise<void> {
    if (stopped) return;
    if (document.visibilityState !== 'visible') {
      schedule(POLL_MS);
      return;
    }

    try {
      const posts = await fetchPosts();
      failures = 0;
      render(posts);
      schedule(POLL_MS);
    } catch (error) {
      if (stopped || (error instanceof DOMException && error.name === 'AbortError')) return;
      failures += 1;
      schedule(Math.min(POLL_MS * 2 ** failures, MAX_RETRY_MS));
    }
  }

  const onVisibilityChange = () => {
    if (document.visibilityState === 'visible') schedule(0);
  };
  const stop = () => {
    stopped = true;
    if (timer) clearTimeout(timer);
    controller?.abort();
    document.removeEventListener('visibilitychange', onVisibilityChange);
  };

  document.addEventListener('visibilitychange', onVisibilityChange);
  window.addEventListener('pagehide', stop, { once: true });
  schedule(POLL_MS);
  return stop;
}
