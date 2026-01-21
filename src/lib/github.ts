interface GitHubRepositoryResponse {
  data?: {
    repository?: {
      description?: string | null;
      stargazerCount?: number | null;
    } | null;
  } | null;
  errors?: { message: string }[];
}

export interface GitHubRepoData {
  description: string;
  stars: number;
}

function getGitHubToken(env: ImportMetaEnv, runtimeEnv?: Record<string, string | undefined>): string {
  return env.GITHUB_TOKEN ?? runtimeEnv?.GITHUB_TOKEN ?? '';
}

export async function fetchGitHubRepo(
  repo: string,
  env: ImportMetaEnv,
  runtimeEnv?: Record<string, string | undefined>
): Promise<GitHubRepoData | null> {
  const token = getGitHubToken(env, runtimeEnv);
  if (!token) return null;

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
