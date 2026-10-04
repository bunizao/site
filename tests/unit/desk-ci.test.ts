import { expect, test } from 'bun:test';
import { spawnSync } from 'node:child_process';
import { isDeskUnlocked } from '../../scripts/desk-lock.mjs';

for (const code of [0, 7]) {
  test(`CI validation preserves exit ${code} without publishing private output`, () => {
    const source = 'PRIVATE_SOURCE_SNIPPET';
    const result = spawnSync('bash', ['scripts/desk-ci.sh', 'node', '-e', `console.log('${source}'); process.exit(${code});`], { encoding: 'utf8' });
    expect(result.status).toBe(code);
    const output = result.stdout + result.stderr;
    if (isDeskUnlocked()) {
      expect(output).not.toContain(source);
      expect(output).toContain(code === 0 ? 'validation passed' : 'validation failed');
    } else {
      expect(output).toContain(source);
    }
  });
}
