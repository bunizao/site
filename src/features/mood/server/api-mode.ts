import { readOptionalEnv, type RuntimeEnvLocals } from '@/lib/runtime/env';
import { readMoodApiModeQueryValue } from '../shared/api-mode';

const DEFAULT_ENV_NAME = 'MOOD_API_V2_DEFAULT';

function readBooleanEnv(value: string | undefined, defaultValue: boolean): boolean {
  if (value === undefined) return defaultValue;

  const normalized = value.trim().toLowerCase();
  if (!normalized) return defaultValue;

  return normalized !== '0'
    && normalized !== 'false'
    && normalized !== 'no'
    && normalized !== 'off';
}

export function isMoodApiV2DefaultEnabled(locals: RuntimeEnvLocals | undefined): boolean {
  return readBooleanEnv(readOptionalEnv(locals, DEFAULT_ENV_NAME), false);
}

export function resolveMoodApiV2Mode(url: URL, locals: RuntimeEnvLocals | undefined): boolean {
  const explicitMode = readMoodApiModeQueryValue(url);
  if (explicitMode) return explicitMode === 'true';

  return isMoodApiV2DefaultEnabled(locals);
}
