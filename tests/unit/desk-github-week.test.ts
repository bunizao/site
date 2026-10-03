import { describe, expect, test } from 'bun:test';

import { readActivityBlock } from '@/features/desk/server/github';

const readme = (block: string) => `<div align="center">intro</div>
<!-- RECENT_ACTIVITY:START -->
${block}
<!-- RECENT_ACTIVITY:END -->`;

const panel = '<img src="https://buxx.me/api/activity-panel.svg?days=7&projects=8&commits=484&added=%2B341%2C729&theme=dark&exp=1&sig=x" />';

describe('readActivityBlock', () => {
  test('reads the week and the linked repositories, in order', () => {
    const week = readActivityBlock(readme(`${panel}
<ul>
  <li><strong><a href="https://github.com/bunizao/site">bunizao/site</a></strong> — The site. <em>(25 PRs)</em></li>
  <li><strong>bunizao/private-repo</strong> — If you know, you know.</li>
  <li><strong><a href="https://github.com/bunizao/bunizao">bunizao/bunizao</a></strong></li>
  <li><strong><a href="https://github.com/bunizao/moodle-cli">bunizao/moodle-cli</a></strong></li>
  <li><strong><a href="https://github.com/bunizao/Attegi">bunizao/Attegi</a></strong></li>
  <li><strong><a href="https://github.com/bunizao/cli-kit">bunizao/cli-kit</a></strong></li>
</ul>`));
    expect(week).toEqual({
      days: 7,
      commits: 484,
      projects: 8,
      repos: [
        { name: 'site', href: 'https://github.com/bunizao/site' },
        { name: 'moodle-cli', href: 'https://github.com/bunizao/moodle-cli' },
        { name: 'Attegi', href: 'https://github.com/bunizao/Attegi' },
      ],
    });
  });

  test('reads HTML-escaped panel URLs', () => {
    expect(readActivityBlock(readme(panel.replaceAll('&', '&amp;')))?.commits).toBe(484);
  });

  test('says nothing without the block or its figures', () => {
    expect(readActivityBlock('# Hello')).toBeNull();
    expect(readActivityBlock(readme('<ul></ul>'))).toBeNull();
    expect(readActivityBlock(readme(panel.replace('commits=484', 'commits=lots')))).toBeNull();
  });
});
