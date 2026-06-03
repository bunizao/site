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

interface GitHubContributionsResponse {
  data?: {
    user?: {
      contributionsCollection?: {
        contributionCalendar?: {
          totalContributions?: number | null;
          weeks?: Array<{
            contributionDays?: Array<{
              date?: string | null;
              contributionCount?: number | null;
              contributionLevel?: string | null;
            } | null> | null;
          } | null> | null;
        } | null;
      } | null;
    } | null;
  } | null;
  errors?: { message: string }[];
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
}

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

export function getGitHubContributionRange(now = new Date()): { from: string; to: string; fromDate: string; toDate: string } {
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
  from.setUTCDate(from.getUTCDate() - 364);
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
  if (!token) return null;

  const range = getGitHubContributionRange(options.now);

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
        variables: {
          username,
          from: range.from,
          to: range.to
        }
      })
    });

    if (!response.ok) return null;

    const payload = (await response.json()) as GitHubContributionsResponse;
    if (payload.errors?.length) return null;

    const calendar = payload.data?.user?.contributionsCollection?.contributionCalendar;
    if (!calendar) return null;

    const contributions = (calendar.weeks ?? [])
      .flatMap((week) => week?.contributionDays ?? [])
      .filter((day): day is NonNullable<typeof day> => Boolean(day?.date))
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

    return {
      total: {
        lastYear: calendar.totalContributions ?? contributions.reduce((sum, day) => sum + day.count, 0)
      },
      contributions
    };
  } catch {
    return null;
  }
}
