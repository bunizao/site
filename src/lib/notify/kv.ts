export interface CloudflareKvConfig {
  accountId: string;
  apiToken: string;
  namespaceId: string;
}

interface CloudflareListResponse {
  result: Array<{ name: string }>;
  result_info?: {
    cursor?: string;
  };
}

function buildBaseUrl(config: CloudflareKvConfig): string {
  return `https://api.cloudflare.com/client/v4/accounts/${config.accountId}/storage/kv/namespaces/${config.namespaceId}`;
}

async function readErrorMessage(response: Response): Promise<string> {
  try {
    const text = await response.text();
    return text || `${response.status} ${response.statusText}`;
  } catch {
    return `${response.status} ${response.statusText}`;
  }
}

export class CloudflareKvClient {
  constructor(private readonly config: CloudflareKvConfig) {}

  private async request(path: string, init: RequestInit): Promise<Response> {
    const url = `${buildBaseUrl(this.config)}${path}`;
    return fetch(url, {
      ...init,
      headers: {
        Authorization: `Bearer ${this.config.apiToken}`,
        ...(init.headers || {}),
      },
    });
  }

  async get(key: string): Promise<string | null> {
    const encodedKey = encodeURIComponent(key);
    const response = await this.request(`/values/${encodedKey}`, {
      method: 'GET',
    });

    if (response.status === 404) {
      return null;
    }

    if (!response.ok) {
      throw new Error(`Cloudflare KV get failed: ${await readErrorMessage(response)}`);
    }

    return response.text();
  }

  async getJson<T>(key: string): Promise<T | null> {
    const value = await this.get(key);
    if (!value) return null;
    try {
      return JSON.parse(value) as T;
    } catch {
      return null;
    }
  }

  async put(key: string, value: string, options: { expirationTtl?: number } = {}): Promise<void> {
    const encodedKey = encodeURIComponent(key);
    const query =
      options.expirationTtl && options.expirationTtl > 0
        ? `?expiration_ttl=${options.expirationTtl}`
        : '';

    const response = await this.request(`/values/${encodedKey}${query}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'text/plain',
      },
      body: value,
    });

    if (!response.ok) {
      throw new Error(`Cloudflare KV put failed: ${await readErrorMessage(response)}`);
    }
  }

  async putJson(key: string, value: unknown, options: { expirationTtl?: number } = {}): Promise<void> {
    await this.put(key, JSON.stringify(value), options);
  }

  async delete(key: string): Promise<void> {
    const encodedKey = encodeURIComponent(key);
    const response = await this.request(`/values/${encodedKey}`, {
      method: 'DELETE',
    });

    if (!response.ok && response.status !== 404) {
      throw new Error(`Cloudflare KV delete failed: ${await readErrorMessage(response)}`);
    }
  }

  async listKeys(prefix: string, maxKeys = 1000): Promise<string[]> {
    const keys: string[] = [];
    let cursor = '';
    const visitedCursors = new Set<string>();

    while (keys.length < maxKeys) {
      if (cursor) {
        if (visitedCursors.has(cursor)) {
          break;
        }
        visitedCursors.add(cursor);
      }

      const pageLimit = Math.min(1000, maxKeys - keys.length);
      const search = new URLSearchParams({
        prefix,
        limit: String(pageLimit),
      });
      if (cursor) {
        search.set('cursor', cursor);
      }

      const response = await this.request(`/keys?${search.toString()}`, {
        method: 'GET',
      });

      if (!response.ok) {
        throw new Error(`Cloudflare KV list failed: ${await readErrorMessage(response)}`);
      }

      const payload = (await response.json()) as CloudflareListResponse;
      const batch = payload.result?.map((entry) => entry.name) ?? [];

      if (!batch.length) {
        break;
      }

      keys.push(...batch);

      cursor = payload.result_info?.cursor ?? '';
      if (!cursor) {
        break;
      }
    }

    return keys;
  }
}
