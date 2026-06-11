export type EnvSource = Record<string, unknown>;

export interface RuntimeEnvLocals {
  runtime?: {
    env?: EnvSource;
  };
  env?: EnvSource;
}

function readValue(source: EnvSource | undefined, name: string): string | undefined {
  const raw = source?.[name];
  if (typeof raw !== 'string') {
    return undefined;
  }

  const value = raw.trim();
  return value ? value : undefined;
}

export function readRuntimeEnvSource(locals: RuntimeEnvLocals | undefined): EnvSource | undefined {
  const directEnv = locals?.env;
  if (directEnv) {
    return directEnv;
  }

  try {
    return locals?.runtime?.env;
  } catch {
    return undefined;
  }
}

export function readRuntimeValue(
  locals: RuntimeEnvLocals | undefined,
  name: string
): string | undefined {
  const directValue = readValue(locals?.env, name);
  if (directValue) {
    return directValue;
  }

  try {
    return readValue(locals?.runtime?.env, name);
  } catch {
    return undefined;
  }
}

function readProcessEnv(name: string): string | undefined {
  const processEnv = (globalThis as typeof globalThis & {
    process?: {
      env?: EnvSource;
    };
  }).process?.env;

  return readValue(processEnv, name);
}

export function readOptionalEnv(
  locals: RuntimeEnvLocals | undefined,
  name: string,
  buildEnv: EnvSource = import.meta.env as EnvSource
): string | undefined {
  return readProcessEnv(name)
    ?? readValue(buildEnv, name)
    ?? readRuntimeValue(locals, name);
}

export function readEnv(
  locals: RuntimeEnvLocals | undefined,
  name: string,
  buildEnv: EnvSource = import.meta.env as EnvSource
): string {
  return readOptionalEnv(locals, name, buildEnv) ?? '';
}

export function readPublicEnv(
  locals: RuntimeEnvLocals | undefined,
  name: string,
  buildEnv: EnvSource = import.meta.env as EnvSource
): string {
  const publicName = name.startsWith('PUBLIC_') ? name : `PUBLIC_${name}`;
  return readEnv(locals, publicName, buildEnv);
}
