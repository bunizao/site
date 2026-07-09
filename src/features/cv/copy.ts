import type { CvLang, Localized } from '@bunizao/contracts';

// All UI chrome strings in both languages, keyed off the same `lang` as the
// content. No i18n library — a plain record, per the PRD.
export interface CvStrings {
  eyebrow: string;
  sections: {
    summary: string;
    experience: string;
    projects: string;
    education: string;
    skills: string;
  };
  present: string;
  contact: {
    email: string;
    phone: string;
    location: string;
  };
  redacted: {
    label: string; // aria-label / screen-reader
    hint: string; // hover affordance / title
    word: string; // the term revealed as the fog lifts
  };
  pdf: string;
  updated: string;
  otherLang: string; // label on the language toggle (the language it switches TO)
  request: {
    open: string;
    title: string;
    lead: string;
    emailLabel: string;
    emailPlaceholder: string;
    intentLabel: string;
    intentPlaceholder: string;
    submit: string;
    submitting: string;
    successTitle: string;
    successBody: string;
    error: string;
    close: string;
    privacy: string;
  };
}

export const CV_STRINGS: Record<CvLang, CvStrings> = {
  en: {
    eyebrow: 'Résumé',
    sections: {
      summary: 'Summary',
      experience: 'Experience',
      projects: 'Projects',
      education: 'Education',
      skills: 'Skills',
    },
    present: 'Present',
    contact: { email: 'Email', phone: 'Phone', location: 'Based in' },
    redacted: { label: 'Hidden — request access to reveal', hint: 'Request access', word: 'redacted' },
    pdf: 'PDF',
    updated: 'Updated',
    otherLang: '中文',
    request: {
      open: 'Request the full résumé',
      title: 'Request access',
      lead: 'A few fields are hidden from the public page. Tell me who you are and I’ll send you a private link to the full version.',
      emailLabel: 'Your email',
      emailPlaceholder: 'you@company.com',
      intentLabel: 'Why you’re asking',
      intentPlaceholder: 'A line on the role or context helps.',
      submit: 'Send request',
      submitting: 'Sending…',
      successTitle: 'Request received',
      successBody: 'You’ll get a link once it’s approved. No account, no spam.',
      error: 'Something went wrong. Try again in a moment.',
      close: 'Close',
      privacy: 'Only used to send you the link.',
    },
  },
  zh: {
    eyebrow: '简历',
    sections: {
      summary: '简介',
      experience: '经历',
      projects: '项目',
      education: '教育',
      skills: '技能',
    },
    present: '至今',
    contact: { email: '邮箱', phone: '电话', location: '所在地' },
    redacted: { label: '已隐藏 —— 申请访问以查看', hint: '申请访问', word: 'redacted' },
    pdf: 'PDF',
    updated: '更新于',
    otherLang: 'EN',
    request: {
      open: '申请完整简历',
      title: '申请访问',
      lead: '公开页面隐藏了少数字段。告诉我你是谁，我会把完整版本的私密链接发给你。',
      emailLabel: '你的邮箱',
      emailPlaceholder: 'you@company.com',
      intentLabel: '申请缘由',
      intentPlaceholder: '一句话说明职位或背景即可。',
      submit: '提交申请',
      submitting: '提交中…',
      successTitle: '已收到申请',
      successBody: '通过后你会收到链接。无需账号，也不会有垃圾邮件。',
      error: '出了点问题，请稍后再试。',
      close: '关闭',
      privacy: '仅用于向你发送链接。',
    },
  },
};

export function pick(value: Localized, lang: CvLang): string {
  return value[lang];
}

/** Format 'YYYY-MM' / 'YYYY' into a compact, locale-aware period label. */
export function formatMonth(value: string, lang: CvLang): string {
  const [year, month] = value.split('-');
  if (!month) return year ?? value;
  if (lang === 'zh') return `${year}.${month}`;
  const date = new Date(Number(year), Number(month) - 1, 1);
  return date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
}

export function formatPeriod(start: string, end: string | undefined, lang: CvLang): string {
  const from = formatMonth(start, lang);
  const to = end ? formatMonth(end, lang) : CV_STRINGS[lang].present;
  return `${from} — ${to}`;
}
