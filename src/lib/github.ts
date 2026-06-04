import * as cheerio from 'cheerio';

interface GitHubRepositoryResponse {
  data?: {
    repository?: {
      description?: string | null;
      stargazerCount?: number | null;
    } | null;
  } | null;
  errors?: { message: string }[];
}

interface GitHubRestRepositoryResponse {
  description?: string | null;
  stargazers_count?: number | null;
}

interface GitHubPinnedRepositoriesResponse {
  data?: {
    user?: {
      pinnedItems?: {
        nodes?: Array<{
          name?: string | null;
          nameWithOwner?: string | null;
          url?: string | null;
          description?: string | null;
          stargazerCount?: number | null;
          owner?: {
            login?: string | null;
          } | null;
          primaryLanguage?: {
            name?: string | null;
          } | null;
          repositoryTopics?: {
            nodes?: Array<{
              topic?: {
                name?: string | null;
              } | null;
            }> | null;
          } | null;
        } | null> | null;
      } | null;
    } | null;
  } | null;
  errors?: { message: string }[];
}

interface GitHubContributionDayResponse {
  date?: string | null;
  contributionCount?: number | null;
  contributionLevel?: string | null;
}

interface GitHubContributionCalendarResponse {
  totalContributions?: number | null;
  weeks?: Array<{
    contributionDays?: Array<GitHubContributionDayResponse | null> | null;
  } | null> | null;
}

interface GitHubContributionsCollectionResponse {
  contributionCalendar?: GitHubContributionCalendarResponse | null;
}

interface GitHubContributionsResponse {
  data?: {
    user?: {
      contributionsCollection?: GitHubContributionsCollectionResponse | null;
      yearlyContributions?: GitHubContributionsCollectionResponse | null;
      visibleContributions?: GitHubContributionsCollectionResponse | null;
    } | null;
  } | null;
  errors?: { message: string }[];
}

interface GitHubContributionsFallbackResponse {
  total?: {
    lastYear?: number | null;
  } | null;
  contributions?: Array<{
    date?: string | null;
    count?: number | null;
    level?: number | null;
  } | null> | null;
}

export interface GitHubRepoData {
  description: string;
  stars: number;
}

export interface GitHubPinnedRepoData {
  name: string;
  repo: string;
  url: string;
  description: string;
  stars: number;
  owner: string;
  primaryLanguage: string | null;
  topics: string[];
}

export interface GitHubContributionDay {
  date: string;
  count: number;
  level: number;
}

export interface GitHubContributionsData {
  total: {
    lastYear: number;
  };
  contributions: GitHubContributionDay[];
}

interface GitHubContributionsOptions {
  now?: Date;
  days?: number;
}

const MAX_CONTRIBUTION_DAYS = 365;
const GITHUB_REQUEST_TIMEOUT_MS = 5_000;

function getGitHubToken(env: ImportMetaEnv, runtimeEnv?: Record<string, string | undefined>): string {
  return env.GITHUB_TOKEN ?? runtimeEnv?.GITHUB_TOKEN ?? '';
}

function normalizeText(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

function parseGitHubCount(value: string): number {
  const normalized = value.trim().toLowerCase().replace(/,/g, '');
  const match = normalized.match(/^([\d.]+)([km])?$/);
  if (!match) return 0;

  const count = Number(match[1]);
  if (!Number.isFinite(count)) return 0;

  const multiplier = match[2] === 'm' ? 1_000_000 : match[2] === 'k' ? 1_000 : 1;
  return Math.round(count * multiplier);
}

function formatDateKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function normalizeContributionWindow(days = MAX_CONTRIBUTION_DAYS): number {
  if (!Number.isInteger(days)) return MAX_CONTRIBUTION_DAYS;
  return Math.min(MAX_CONTRIBUTION_DAYS, Math.max(1, days));
}

export function getGitHubContributionRange(now = new Date(), days = MAX_CONTRIBUTION_DAYS): { from: string; to: string; fromDate: string; toDate: string } {
  const windowDays = normalizeContributionWindow(days);
  const to = new Date(Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate(),
    23,
    59,
    59,
    999
  ));
  const from = new Date(to);
  from.setUTCDate(from.getUTCDate() - (windowDays - 1));
  from.setUTCHours(0, 0, 0, 0);

  return {
    from: from.toISOString(),
    to: to.toISOString(),
    fromDate: formatDateKey(from),
    toDate: formatDateKey(to)
  };
}

function normalizeContributionLevel(level: string | null | undefined): number {
  switch (level) {
    case 'FIRST_QUARTILE':
      return 1;
    case 'SECOND_QUARTILE':
      return 2;
    case 'THIRD_QUARTILE':
      return 3;
    case 'FOURTH_QUARTILE':
      return 4;
    default:
      return 0;
  }
}

function normalizeExternalContributionDay(day: NonNullable<NonNullable<GitHubContributionsFallbackResponse['contributions']>[number]>): GitHubContributionDay | null {
  const date = day.date?.trim() ?? '';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;

  const count = typeof day.count === 'number' && Number.isFinite(day.count)
    ? Math.max(0, Math.round(day.count))
    : 0;
  const level = typeof day.level === 'number' && Number.isFinite(day.level)
    ? Math.min(4, Math.max(0, Math.round(day.level)))
    : 0;

  return {
    date,
    count,
    level
  };
}

function normalizeGraphQLContributionDays(
  calendar: GitHubContributionCalendarResponse,
  range: ReturnType<typeof getGitHubContributionRange>
): GitHubContributionDay[] {
  return (calendar.weeks ?? [])
    .flatMap((week) => week?.contributionDays ?? [])
    .filter((day): day is GitHubContributionDayResponse => Boolean(day?.date))
    .filter((day) => {
      const date = day.date ?? '';
      return date >= range.fromDate && date <= range.toDate;
    })
    .map((day) => ({
      date: day.date ?? '',
      count: day.contributionCount ?? 0,
      level: normalizeContributionLevel(day.contributionLevel)
    }))
    .sort((left, right) => left.date.localeCompare(right.date));
}

async function fetchGitHubRepoGraphQL(repo: string, token: string): Promise<GitHubRepoData | null> {
  const [owner, name] = repo.split('/');
  if (!owner || !name) return null;

  try {
    const response = await fetch('https://api.github.com/graphql', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
        'User-Agent': 'astro-site'
      },
      body: JSON.stringify({
        query: `
          query Repo($owner: String!, $name: String!) {
            repository(owner: $owner, name: $name) {
              description
              stargazerCount
            }
          }
        `,
        variables: { owner, name }
      })
    });

    if (!response.ok) return null;

    const payload = (await response.json()) as GitHubRepositoryResponse;
    if (payload.errors?.length) return null;

    const repository = payload.data?.repository;
    if (!repository) return null;

    return {
      description: repository.description ?? '',
      stars: repository.stargazerCount ?? 0
    };
  } catch {
    return null;
  }
}

async function fetchGitHubRepoRest(repo: string, token?: string): Promise<GitHubRepoData | null> {
  try {
    const response = await fetch(`https://api.github.com/repos/${repo}`, {
      headers: {
        'Accept': 'application/vnd.github.v3+json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        'User-Agent': 'astro-site'
      }
    });

    if (!response.ok) return null;

    const data = (await response.json()) as GitHubRestRepositoryResponse;
    return {
      description: data.description ?? '',
      stars: data.stargazers_count ?? 0
    };
  } catch {
    return null;
  }
}

export async function fetchGitHubRepo(
  repo: string,
  env: ImportMetaEnv,
  runtimeEnv?: Record<string, string | undefined>
): Promise<GitHubRepoData | null> {
  const token = getGitHubToken(env, runtimeEnv);
  if (token) {
    const graphData = await fetchGitHubRepoGraphQL(repo, token);
    if (graphData) return graphData;
  }

  return fetchGitHubRepoRest(repo, token || undefined);
}

async function fetchGitHubPinnedReposGraphQL(
  username: string,
  token: string,
  limit = 6
): Promise<GitHubPinnedRepoData[] | null> {
  try {
    const response = await fetch('https://api.github.com/graphql', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
        'User-Agent': 'astro-site'
      },
      body: JSON.stringify({
        query: `
          query PinnedRepos($username: String!, $limit: Int!) {
            user(login: $username) {
              pinnedItems(first: $limit, types: REPOSITORY) {
                nodes {
                  ... on Repository {
                    name
                    nameWithOwner
                    url
                    description
                    stargazerCount
                    owner {
                      login
                    }
                    primaryLanguage {
                      name
                    }
                    repositoryTopics(first: 5) {
                      nodes {
                        topic {
                          name
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        `,
        variables: {
          username,
          limit
        }
      })
    });

    if (!response.ok) return null;

    const payload = (await response.json()) as GitHubPinnedRepositoriesResponse;
    if (payload.errors?.length) return null;

    const nodes = payload.data?.user?.pinnedItems?.nodes;
    if (!nodes) return [];

    return nodes
      .filter((node): node is NonNullable<typeof node> => Boolean(node?.name && node?.nameWithOwner && node?.url))
      .map((node) => ({
        name: node.name ?? '',
        repo: node.nameWithOwner ?? '',
        url: node.url ?? '',
        description: node.description ?? '',
        stars: node.stargazerCount ?? 0,
        owner: node.owner?.login ?? '',
        primaryLanguage: node.primaryLanguage?.name ?? null,
        topics: (node.repositoryTopics?.nodes ?? [])
          .map((topicNode) => topicNode?.topic?.name?.trim() ?? '')
          .filter(Boolean)
      }));
  } catch {
    return null;
  }
}

async function fetchGitHubPinnedReposHtml(
  username: string,
  limit = 6
): Promise<GitHubPinnedRepoData[] | null> {
  try {
    const response = await fetch(`https://github.com/${username}`, {
      headers: {
        'Accept': 'text/html,application/xhtml+xml',
        'User-Agent': 'astro-site'
      }
    });

    if (!response.ok) return null;

    const html = await response.text();
    const $ = cheerio.load(html);

    const repos = $('.js-pinned-item-list-item, .pinned-item-list-item')
      .slice(0, limit)
      .toArray()
      .flatMap<GitHubPinnedRepoData>((element) => {
        const repoLink = $(element)
          .find('.pinned-item-list-item-content a[href^="/"]')
          .first();

        const href = (repoLink.attr('href') ?? '').trim();
        const [owner, name] = href.replace(/^\/+/, '').split('/');
        if (!owner || !name) return [];

        const description = normalizeText(
          $(element).find('.pinned-item-desc').first().text()
        );
        const primaryLanguage = normalizeText(
          $(element).find('[itemprop="programmingLanguage"]').first().text()
        );
        const stars = parseGitHubCount(
          normalizeText($(element).find('a[href$="/stargazers"]').first().text())
        );

        return [{
          name,
          repo: `${owner}/${name}`,
          url: `https://github.com/${owner}/${name}`,
          description,
          stars,
          owner,
          primaryLanguage: primaryLanguage || null,
          topics: []
        } satisfies GitHubPinnedRepoData];
      });

    return repos;
  } catch {
    return null;
  }
}

export async function fetchGitHubPinnedRepos(
  username: string,
  env: ImportMetaEnv,
  runtimeEnv?: Record<string, string | undefined>,
  limit = 6
): Promise<GitHubPinnedRepoData[] | null> {
  const token = getGitHubToken(env, runtimeEnv);
  if (token) {
    const graphData = await fetchGitHubPinnedReposGraphQL(username, token, limit);
    if (graphData) return graphData;
  }

  return fetchGitHubPinnedReposHtml(username, limit);
}

export async function fetchGitHubContributions(
  username: string,
  env: ImportMetaEnv,
  runtimeEnv?: Record<string, string | undefined>,
  options: GitHubContributionsOptions = {}
): Promise<GitHubContributionsData | null> {
  const token = getGitHubToken(env, runtimeEnv);
  if (!token) return fetchGitHubContributionsFallback(username, options);

  const days = normalizeContributionWindow(options.days);
  const totalRange = getGitHubContributionRange(options.now);
  const visibleRange = getGitHubContributionRange(options.now, days);
  const useVisibleWindow = days < MAX_CONTRIBUTION_DAYS;

  try {
    const response = await fetch('https://api.github.com/graphql', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
        'User-Agent': 'astro-site'
      },
      signal: AbortSignal.timeout(GITHUB_REQUEST_TIMEOUT_MS),
      body: JSON.stringify({
        query: useVisibleWindow
          ? `
            query Contributions($username: String!, $from: DateTime!, $visibleFrom: DateTime!, $to: DateTime!) {
              user(login: $username) {
                yearlyContributions: contributionsCollection(from: $from, to: $to) {
                  contributionCalendar {
                    totalContributions
                  }
                }
                visibleContributions: contributionsCollection(from: $visibleFrom, to: $to) {
                  contributionCalendar {
                    weeks {
                      contributionDays {
                        date
                        contributionCount
                        contributionLevel
                      }
                    }
                  }
                }
              }
            }
          `
          : `
            query Contributions($username: String!, $from: DateTime!, $to: DateTime!) {
              user(login: $username) {
                contributionsCollection(from: $from, to: $to) {
                  contributionCalendar {
                    totalContributions
                    weeks {
                      contributionDays {
                        date
                        contributionCount
                        contributionLevel
                      }
                    }
                  }
                }
              }
            }
          `,
        variables: useVisibleWindow
          ? {
            username,
            from: totalRange.from,
            visibleFrom: visibleRange.from,
            to: totalRange.to
          }
          : {
            username,
            from: totalRange.from,
            to: totalRange.to
          }
      })
    });

    if (!response.ok) return fetchGitHubContributionsFallback(username, options);

    const payload = (await response.json()) as GitHubContributionsResponse;
    if (payload.errors?.length) return fetchGitHubContributionsFallback(username, options);

    const user = payload.data?.user;
    const totalCalendar = useVisibleWindow
      ? user?.yearlyContributions?.contributionCalendar
      : user?.contributionsCollection?.contributionCalendar;
    const visibleCalendar = useVisibleWindow
      ? user?.visibleContributions?.contributionCalendar
      : totalCalendar;
    if (!totalCalendar || !visibleCalendar) return fetchGitHubContributionsFallback(username, options);

    const contributions = normalizeGraphQLContributionDays(visibleCalendar, visibleRange);

    return {
      total: {
        lastYear: totalCalendar.totalContributions ?? contributions.reduce((sum, day) => sum + day.count, 0)
      },
      contributions
    };
  } catch {
    return fetchGitHubContributionsFallback(username, options);
  }
}

async function fetchGitHubContributionsFallback(
  username: string,
  options: GitHubContributionsOptions = {}
): Promise<GitHubContributionsData | null> {
  const range = getGitHubContributionRange(options.now, options.days);

  try {
    const response = await fetch(
      `https://github-contributions-api.jogruber.de/v4/${encodeURIComponent(username)}?y=last`,
      {
        headers: {
          Accept: 'application/json',
          'User-Agent': 'astro-site'
        },
        signal: AbortSignal.timeout(GITHUB_REQUEST_TIMEOUT_MS)
      }
    );

    if (!response.ok) return null;

    const payload = (await response.json()) as GitHubContributionsFallbackResponse;
    const contributions = (payload.contributions ?? [])
      .flatMap((day) => {
        if (!day) return [];
        const normalized = normalizeExternalContributionDay(day);
        return normalized ? [normalized] : [];
      })
      .filter((day) => day.date >= range.fromDate && day.date <= range.toDate)
      .sort((left, right) => left.date.localeCompare(right.date));

    return {
      total: {
        lastYear: typeof payload.total?.lastYear === 'number' && Number.isFinite(payload.total.lastYear)
          ? payload.total.lastYear
          : contributions.reduce((sum, day) => sum + day.count, 0)
      },
      contributions
    };
  } catch {
    return null;
  }
}
