function readEnvFlag(locals: any, name: string): string {
  const processValue = process.env[name];
  if (typeof processValue === 'string' && processValue.trim()) {
    return processValue;
  }

  const buildValue = import.meta.env[name];
  if (typeof buildValue === 'string' && buildValue.trim()) {
    return buildValue;
  }

  const runtimeValue = locals?.runtime?.env?.[name] ?? locals?.env?.[name];
  if (typeof runtimeValue === 'string') {
    return runtimeValue;
  }

  return '';
}

export function isE2ESiteFixtureEnabled(locals: any): boolean {
  return readEnvFlag(locals, 'E2E_SITE_FIXTURE') === '1';
}
