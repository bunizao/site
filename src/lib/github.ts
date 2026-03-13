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

function getGitHubToken(env: ImportMetaEnv, runtimeEnv?: Record<string, string | undefined>): string {
  return env.GITHUB_TOKEN ?? runtimeEnv?.GITHUB_TOKEN ?? '';
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

export async function fetchGitHubPinnedRepos(
  username: string,
  env: ImportMetaEnv,
  runtimeEnv?: Record<string, string | undefined>,
  limit = 6
): Promise<GitHubPinnedRepoData[] | null> {
  const token = getGitHubToken(env, runtimeEnv);
  if (!token) return null;

  return fetchGitHubPinnedReposGraphQL(username, token, limit);
}
