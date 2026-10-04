import { appendFileSync } from 'node:fs';
import { relative } from 'node:path';

export default class DeskCiReporter {
  onBegin(_config, suite) {
    this.suite = suite;
  }

  onEnd(result) {
    const lines = [`Browser validation: ${result.status}.`];
    for (const test of this.suite.allTests()) {
      const last = test.results.at(-1);
      if (!last || !['failed', 'timedOut', 'interrupted'].includes(last.status)) continue;
      const path = relative(process.cwd(), test.location.file).replaceAll('\\', '/');
      if (!path.startsWith('tests/e2e/') && !path.startsWith('src/features/desk/tests/')) continue;
      // Paths and line numbers are public Git metadata; source, titles and
      // error messages can contain private code and must remain local.
      lines.push(`${path}:${test.location.line}:${test.location.column}: ${last.status}`);
    }
    const summary = lines.join('\n') + '\n';
    if (process.env.DESK_CI_SUMMARY) appendFileSync(process.env.DESK_CI_SUMMARY, summary);
    if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, '```text\n' + summary + '```\n');
  }
}
