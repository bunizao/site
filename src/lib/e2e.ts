import { readEnv } from '@/lib/runtime/env';

function readEnvFlag(locals: any, name: string): string {
  return readEnv(locals, name);
}

export function isE2ESiteFixtureEnabled(locals: any): boolean {
  return readEnvFlag(locals, 'E2E_SITE_FIXTURE') === '1';
}
