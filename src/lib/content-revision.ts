import { execFileSync } from 'node:child_process';

/**
 * Last commit that touched a content file, resolved from local git history.
 *
 * This runs at build time only. Pages that use it must be prerendered
 * (`output: 'static'` covers every page in this repo today) — `node:child_process`
 * does not exist in the Workers runtime, so calling this from an SSR route
 * would break the deployed worker rather than fail at build.
 */
export type ContentRevision = {
  /** Full 40-character commit hash. */
  sha: string;
  /** Abbreviated hash, as GitHub displays it. */
  shortSha: string;
  /** Commit date, ISO 8601, for the <time datetime> attribute. */
  isoDate: string;
  /** Commit date formatted the way the policy prose reads: "July 26, 2026". */
  displayDate: string;
  commitUrl: string;
  historyUrl: string;
};

const REPO = 'bunizao/site';

const DATE_FORMAT = new Intl.DateTimeFormat('en-US', {
  year: 'numeric',
  month: 'long',
  day: 'numeric',
  timeZone: 'UTC',
});

function git(args: string[]): string | null {
  try {
    return execFileSync('git', args, {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    return null;
  }
}

export function getContentRevision(path: string): ContentRevision | null {
  const output = git(['log', '-1', '--format=%H%n%cI', '--', path]);

  if (!output) {
    // A shallow clone has no per-file history, so this degrades to "no revision
    // shown" rather than to a wrong one. Warn loudly: the page still builds, and
    // a silently missing hash in production is otherwise invisible.
    console.warn(
      `[content-revision] No git history for ${path}. `
        + 'The revision hash will be omitted. If this is a CI build, the clone is '
        + 'likely shallow — increase the clone depth to restore it.',
    );
    return null;
  }

  const [sha, isoDate] = output.split('\n');

  if (!sha || !isoDate) {
    return null;
  }

  return {
    sha,
    shortSha: sha.slice(0, 7),
    isoDate,
    displayDate: DATE_FORMAT.format(new Date(isoDate)),
    commitUrl: `https://github.com/${REPO}/commit/${sha}`,
    historyUrl: `https://github.com/${REPO}/commits/main/${path}`,
  };
}
