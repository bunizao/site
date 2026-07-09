import { describe, expect, test } from 'bun:test';
import {
  cvValue,
  redactCvDocument,
  type CvDocument,
} from '../../packages/contracts/src/cv';

function makeDoc(): CvDocument {
  return {
    updatedAt: '2026-07-09',
    identity: {
      displayName: { en: 'Bunizao', zh: 'Bunizao' },
      legalName: { value: { en: 'Real Name', zh: '真名' }, redacted: true },
      headline: { en: 'Engineer', zh: '工程师' },
      location: { value: { en: 'Melbourne', zh: '墨尔本' } }, // public
      email: { value: { en: 'me@example.com', zh: 'me@example.com' }, redacted: true },
      phone: { value: { en: '+61 400 000 000', zh: '+61 400 000 000' }, redacted: true },
      links: [{ label: { en: 'GitHub', zh: 'GitHub' }, url: 'https://github.com/bunizao' }],
    },
    summary: { en: 'A summary', zh: '一段简介' },
    work: [
      {
        company: { value: { en: 'Acme', zh: 'Acme' } }, // public
        role: { en: 'Dev', zh: '开发' },
        location: { value: { en: 'Remote', zh: '远程' }, redacted: true },
        start: '2024-01',
        summary: { en: 'Did things', zh: '做了事情' },
        highlights: [{ en: 'Shipped', zh: '交付' }],
      },
    ],
    education: [
      {
        school: { value: { en: 'Uni', zh: '大学' }, redacted: true },
        degree: { en: 'BSc', zh: '学士' },
        start: '2019',
        end: '2023',
      },
    ],
    projects: [{ name: { en: 'Site', zh: '站点' }, description: { en: 'x', zh: 'x' } }],
    skills: [{ group: { en: 'Lang', zh: '语言' }, items: ['TypeScript'] }],
  };
}

describe('redactCvDocument', () => {
  test('strips values from redacted leaves entirely', () => {
    const pub = redactCvDocument(makeDoc());

    expect(pub.identity.legalName).toEqual({ redacted: true });
    expect(pub.identity.phone).toEqual({ redacted: true });
    expect(pub.identity.email).toEqual({ redacted: true });
    expect(pub.work[0]!.location).toEqual({ redacted: true });
    expect(pub.education[0]!.school).toEqual({ redacted: true });
  });

  test('preserves public leaves', () => {
    const pub = redactCvDocument(makeDoc());

    expect(cvValue(pub.identity.location)?.en).toBe('Melbourne');
    expect(cvValue(pub.work[0]!.company)?.en).toBe('Acme');
    expect(cvValue(pub.identity.legalName)).toBeNull();
  });

  test('never serializes a redacted value (crawler hygiene)', () => {
    const json = JSON.stringify(redactCvDocument(makeDoc()));

    expect(json).not.toContain('Real Name');
    expect(json).not.toContain('真名');
    expect(json).not.toContain('+61 400 000 000');
    expect(json).not.toContain('me@example.com');
    // Public values still ride along.
    expect(json).toContain('Melbourne');
  });

  test('leaves non-redactable content intact', () => {
    const pub = redactCvDocument(makeDoc());
    expect(pub.summary.en).toBe('A summary');
    expect(pub.identity.displayName.en).toBe('Bunizao');
    expect(pub.skills[0]!.items).toEqual(['TypeScript']);
  });
});
