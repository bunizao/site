/* Copy for the one-time reader verification landing page. It stays outside
   the thread copy table so this server-only screen never enters the comment
   controller bundle. */

import type { BlogLocale } from '@/data/site';

export interface ReaderConfirmCopy {
  pageTitle: string;
  pageDescription: string;
  back: string;
  pendingTitle: string;
  pendingBody: string;
  confirm: string;
  confirmAria: string;
  confirmedTitle: string;
  confirmedBody: (name: string) => string;
  confirmedBodyAnonymous: string;
  alreadyTitle: string;
  alreadyBody: string;
  invalidTitle: string;
  invalidBody: string;
  emailLabel: string;
  emailPlaceholder: string;
  resend: string;
  resentTitle: string;
  resentBody: string;
}

const zh: ReaderConfirmCopy = {
  pageTitle: '确认一下是你',
  pageDescription: '确认你在無人之境留下的邮箱。',
  back: '← 回到博客',
  pendingTitle: '确认一下是你',
  pendingBody: '确认之后，换一台设备、换一个浏览器，你还是能编辑和删除自己的评论。',
  confirm: '是我',
  confirmAria: '确认这个邮箱是我的',
  confirmedTitle: '确认好了',
  confirmedBody: (name) => `${name}，你的评论从现在起跟着这个邮箱走。`,
  confirmedBodyAnonymous: '你的评论从现在起跟着这个邮箱走。',
  alreadyTitle: '早就确认过了',
  alreadyBody: '这个邮箱之前就确认过。这里没别的事了。',
  invalidTitle: '这个链接用不了了',
  invalidBody: '可能过期了，也可能已经用过一次。留下当时的邮箱，我们再发一封。',
  emailLabel: '邮箱',
  emailPlaceholder: '邮箱',
  resend: '重新发一封',
  resentTitle: '去邮箱看看',
  resentBody: '如果这个邮箱确实留过评论，新的链接已经在路上了。',
};

const en: ReaderConfirmCopy = {
  pageTitle: "Confirm it's you",
  pageDescription: 'Confirm the email you commented with.',
  back: '← Back to the blog',
  pendingTitle: "Confirm it's you",
  pendingBody: 'Once confirmed, you can edit and delete your own comments from any browser, on any device.',
  confirm: "Yes, it's me",
  confirmAria: 'Confirm this address is mine',
  confirmedTitle: "You're confirmed",
  confirmedBody: (name) => `${name}, your comments follow this address from here on.`,
  confirmedBodyAnonymous: 'Your comments follow this address from here on.',
  alreadyTitle: 'Already confirmed',
  alreadyBody: 'This address was confirmed earlier. Nothing else to do here.',
  invalidTitle: "This link doesn't work",
  invalidBody: "It expired, or it has already been used. Leave the email you commented with and we'll send a fresh one.",
  emailLabel: 'Email',
  emailPlaceholder: 'Email',
  resend: 'Send a new link',
  resentTitle: 'Check your inbox',
  resentBody: 'If that address has a comment on file, a new link is on its way.',
};

export const readerConfirmCopy = { zh, en } satisfies Record<BlogLocale, ReaderConfirmCopy>;

export function resolveReaderConfirmLocale(value: string | null | undefined): BlogLocale {
  return value === 'en' ? 'en' : 'zh';
}
