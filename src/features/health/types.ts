import type { MoodFeedResponse } from '@/features/mood/server/contracts';

export type ApiHealthStatus = 'ok' | 'degraded' | 'down' | 'skipped';
export type ApiHealthMode = 'default' | 'deep';

export interface ApiHealthContext {
  request: Request;
  locals?: any;
  deep: boolean;
}

export interface ApiHealthState {
  latestMoodId?: string;
  moodFeed?: MoodFeedResponse;
}

export interface ApiHealthCheckResult {
  status: ApiHealthStatus;
  message?: string;
  metadata?: Record<string, unknown>;
}

export interface ApiHealthCheckReport extends ApiHealthCheckResult {
  id: string;
  label: string;
  critical: boolean;
  durationMs: number;
}

export interface ApiHealthCheck {
  id: string;
  label: string;
  critical: boolean;
  deepOnly?: boolean;
  timeoutMs?: number;
  run: (
    context: ApiHealthContext,
    state: ApiHealthState
  ) => Promise<ApiHealthCheckResult>;
}

export interface ApiHealthReport {
  status: Exclude<ApiHealthStatus, 'skipped'>;
  mode: ApiHealthMode;
  checkedAt: string;
  durationMs: number;
  checks: ApiHealthCheckReport[];
}
