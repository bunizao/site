import { spawnSync } from 'node:child_process';
import { prepareDeskCheckout } from './desk-checkout.mjs';
import { isDeskUnlocked } from './desk-lock.mjs';

prepareDeskCheckout();
if (!isDeskUnlocked()) {
  console.log('desk locked, skipped');
} else {
  const result = spawnSync('bun', ['test', '--preload', './tests/setup/isolate.ts', './src/features/desk/tests/unit', ...process.argv.slice(2)], { stdio: 'inherit' });
  if (result.error) throw result.error;
  process.exit(result.status ?? 1);
}
