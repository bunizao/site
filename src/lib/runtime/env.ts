type EnvSource = Record<string, unknown>;

interface RuntimeEnvLocals {
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

export function readOptionalEnv(
  locals: RuntimeEnvLocals | undefined,
  name: string,
  buildEnv: EnvSource = import.meta.env as EnvSource
): string | undefined {
  return readValue(buildEnv, name)
    ?? readValue(locals?.runtime?.env, name)
    ?? readValue(locals?.env, name);
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
