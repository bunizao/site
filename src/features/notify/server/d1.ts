import { readRuntimeEnvSource } from '@/lib/runtime/env';
import { getNotifyConfig, requireConfigValue } from './env';

export interface CloudflareD1Config {
  accountId: string;
  apiToken: string;
  databaseId: string;
}

export interface NotifyD1Client {
  query<T>(sql: string, params?: unknown[]): Promise<T[]>;
  first<T>(sql: string, params?: unknown[]): Promise<T | null>;
  run(sql: string, params?: unknown[]): Promise<{ changes: number; lastRowId: number | null }>;
}

interface NotifyD1ClientContext {
  locals?: any;
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

interface WorkerD1Result<T = unknown> {
  success?: boolean;
  error?: string;
  results?: T[];
  meta?: CloudflareD1Meta;
}

interface WorkerD1PreparedStatement {
  bind(...params: unknown[]): WorkerD1PreparedStatement;
  all<T = unknown>(): Promise<WorkerD1Result<T>>;
  first<T = unknown>(): Promise<T | null>;
  run(): Promise<WorkerD1Result>;
}

interface WorkerD1Database {
  prepare(sql: string): WorkerD1PreparedStatement;
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

function mapMeta(meta: CloudflareD1Meta | undefined): { changes: number; lastRowId: number | null } {
  const changes = Number(meta?.changes ?? 0);
  const lastRowIdRaw = meta?.last_row_id;
  const lastRowId = Number.isFinite(lastRowIdRaw) ? Number(lastRowIdRaw) : null;
  return {
    changes: Number.isFinite(changes) ? changes : 0,
    lastRowId,
  };
}

function isWorkerD1Database(value: unknown): value is WorkerD1Database {
  return typeof value === 'object'
    && value !== null
    && typeof (value as { prepare?: unknown }).prepare === 'function';
}

function getWorkerD1Database(context: NotifyD1ClientContext): WorkerD1Database | undefined {
  const source = readRuntimeEnvSource(context.locals);
  const binding = source?.NOTIFY_DB;
  return isWorkerD1Database(binding) ? binding : undefined;
}

function assertWorkerD1Result(result: WorkerD1Result, operation: string): void {
  if (result.success === false) {
    const details = (result.error || '').trim();
    throw new Error(`Cloudflare D1 binding ${operation} failed${details ? `: ${details}` : ''}`);
  }
}

class WorkerD1Client implements NotifyD1Client {
  constructor(private readonly database: WorkerD1Database) {}

  private prepare(sql: string, params: unknown[]): WorkerD1PreparedStatement {
    const statement = this.database.prepare(sql);
    return params.length ? statement.bind(...params) : statement;
  }

  async query<T>(sql: string, params: unknown[] = []): Promise<T[]> {
    const result = await this.prepare(sql, params).all<T>();
    assertWorkerD1Result(result, 'query');
    return result.results ?? [];
  }

  async first<T>(sql: string, params: unknown[] = []): Promise<T | null> {
    return await this.prepare(sql, params).first<T>() ?? null;
  }

  async run(sql: string, params: unknown[] = []): Promise<{ changes: number; lastRowId: number | null }> {
    const result = await this.prepare(sql, params).run();
    assertWorkerD1Result(result, 'statement');
    return mapMeta(result.meta);
  }
}

export class CloudflareD1Client implements NotifyD1Client {
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
    return mapMeta(result.meta);
  }
}

export function createNotifyD1Client(context: NotifyD1ClientContext = {}): NotifyD1Client {
  const workerDatabase = getWorkerD1Database(context);
  if (workerDatabase) {
    return new WorkerD1Client(workerDatabase);
  }

  const config = getNotifyConfig(context);
  requireConfigValue(config.cloudflareAccountId, 'CLOUDFLARE_ACCOUNT_ID');
  requireConfigValue(config.cloudflareApiToken, 'CLOUDFLARE_API_TOKEN');
  requireConfigValue(config.cloudflareNotifyD1DatabaseId, 'CLOUDFLARE_NOTIFY_D1_DATABASE_ID');

  return new CloudflareD1Client({
    accountId: config.cloudflareAccountId,
    apiToken: config.cloudflareApiToken,
    databaseId: config.cloudflareNotifyD1DatabaseId,
  });
}
