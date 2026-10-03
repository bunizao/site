// The week on GitHub, for the desk's GitHub panel. It comes from the activity
// block in the profile README (bunizao/bunizao), which that repository's own
// workflow rewrites five times a day: how many commits went into how many
// projects over the last days, and which repositories they were, private
// ones already left unnamed. Read from there until site-api serves it
// (plans/desk-backend.md).
const README = 'https://raw.githubusercontent.com/bunizao/bunizao/HEAD/README.md';
const TIMEOUT_MS = 1500;
/** The README changes five times a day; an isolate rereads it at most this often. */
const KEEP_MS = 30 * 60_000;
const SHOWN = 3;

export interface DeskRepo {
  name: string;
  href: string;
}

export interface DeskGitHubWeek {
  days: number;
  commits: number;
  projects: number;
  repos: DeskRepo[];
}

/** The figures and repositories in the README's activity block; null when it has none. */
export function readActivityBlock(readme: string): DeskGitHubWeek | null {
  const block = readme.split('<!-- RECENT_ACTIVITY:START -->')[1]?.split('<!-- RECENT_ACTIVITY:END -->')[0];
  const query = block && /activity-panel\.svg\?([^"\s]+)/.exec(block)?.[1];
  if (!query) return null;
  const params = new URLSearchParams(query.replaceAll('&amp;', '&'));
  const [days, commits, projects] = ['days', 'commits', 'projects'].map((key) => Number(params.get(key)));
  if (![days, commits, projects].every((n) => Number.isInteger(n) && n >= 0)) return null;
  // Only linked entries: the workflow names a private repository without a link.
  const repos = [...block.matchAll(/<a href="https:\/\/github\.com\/bunizao\/([A-Za-z0-9._-]+)">/g)]
    .map((match) => match[1])
    .filter((name) => name !== 'bunizao')
    .slice(0, SHOWN)
    .map((name) => ({ name, href: `https://github.com/bunizao/${name}` }));
  return { days, commits, projects, repos };
}

let kept: { at: number; week: DeskGitHubWeek | null } | null = null;

export async function loadGitHubWeek(): Promise<DeskGitHubWeek | null> {
  if (kept && Date.now() - kept.at < KEEP_MS) return kept.week;
  try {
    const response = await fetch(README, { signal: AbortSignal.timeout(TIMEOUT_MS) });
    const week = response.ok ? readActivityBlock(await response.text()) : null;
    kept = { at: Date.now(), week };
    return week;
  } catch {
    return kept?.week ?? null;
  }
}
