export interface CloudflareD1Config {
  accountId: string;
  apiToken: string;
  databaseId: string;
}

interface CloudflareErrorEntry {
  message?: string;
}

interface CloudflareD1Meta {
  changes?: number;
  last_row_id?: number;
}

interface CloudflareD1ResultSet {
  success?: boolean;
  error?: string;
  results?: unknown[];
  meta?: CloudflareD1Meta;
}

interface CloudflareD1Response {
  success?: boolean;
  errors?: CloudflareErrorEntry[];
  result?: CloudflareD1ResultSet[];
}

function buildBaseUrl(config: CloudflareD1Config): string {
  return `https://api.cloudflare.com/client/v4/accounts/${config.accountId}/d1/database/${config.databaseId}/query`;
}

function formatCloudflareErrors(payload: CloudflareD1Response | null | undefined): string {
  const messages = (payload?.errors ?? [])
    .map((entry) => (entry?.message || '').trim())
    .filter(Boolean);
  if (!messages.length) return '';
  return messages.join('; ');
}

async function readErrorMessage(response: Response): Promise<string> {
  try {
    const text = await response.text();
    return text || `${response.status} ${response.statusText}`;
  } catch {
    return `${response.status} ${response.statusText}`;
  }
}

export class CloudflareD1Client {
  constructor(private readonly config: CloudflareD1Config) {}

  private async executeStatement(
    sql: string,
    params: unknown[] = []
  ): Promise<CloudflareD1ResultSet> {
    const response = await fetch(buildBaseUrl(this.config), {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.config.apiToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        sql,
        params,
      }),
    });

    if (!response.ok) {
      throw new Error(`Cloudflare D1 request failed: ${await readErrorMessage(response)}`);
    }

    let payload: CloudflareD1Response | null = null;
    try {
      payload = (await response.json()) as CloudflareD1Response;
    } catch {
      throw new Error('Cloudflare D1 response is not valid JSON');
    }

    if (!payload?.success) {
      const details = formatCloudflareErrors(payload);
      throw new Error(`Cloudflare D1 query failed${details ? `: ${details}` : ''}`);
    }

    const result = payload.result?.[0];
    if (!result) {
      return {
        success: true,
        results: [],
        meta: {},
      };
    }

    if (result.success === false) {
      const details = [
        (result.error || '').trim(),
        formatCloudflareErrors(payload),
      ].filter(Boolean).join('; ');
      throw new Error(`Cloudflare D1 statement failed${details ? `: ${details}` : ''}`);
    }

    return result;
  }

  async query<T>(sql: string, params: unknown[] = []): Promise<T[]> {
    const result = await this.executeStatement(sql, params);
    const rows = result.results ?? [];
    return rows as T[];
  }

  async first<T>(sql: string, params: unknown[] = []): Promise<T | null> {
    const rows = await this.query<T>(sql, params);
    return rows[0] ?? null;
  }

  async run(sql: string, params: unknown[] = []): Promise<{ changes: number; lastRowId: number | null }> {
    const result = await this.executeStatement(sql, params);
    const changes = Number(result.meta?.changes ?? 0);
    const lastRowIdRaw = result.meta?.last_row_id;
    const lastRowId = Number.isFinite(lastRowIdRaw) ? Number(lastRowIdRaw) : null;
    return {
      changes: Number.isFinite(changes) ? changes : 0,
      lastRowId,
    };
  }
}
