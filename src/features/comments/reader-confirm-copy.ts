/* Copy for the one-time reader verification landing page. It stays outside
   the thread copy table so this server-only screen never enters the comment
   controller bundle. */

import type { BlogLocale } from '@/data/site';

export interface ReaderConfirmCopy {
  pageTitle: string;
  pageDescription: string;
  back: string;
  home: string;
  pendingTitle: string;
  pendingBody: string;
  confirm: string;
  confirmAria: string;
  /** What the card says while the auto-submit round trip is in flight. A
      browser with JS confirms the link on arrival, so this -- not the button
      -- is what almost every reader actually sees. */
  verifying: string;
  confirmedTitle: string;
  confirmedBody: (name: string) => string;
  confirmedBodyAnonymous: string;
  /** The two things a freshly verified reader can now decide. Reply alerts
      come on with the verification (the mail promised them); the newsletter
      does not, and says so. */
  prefsNotifyReplies: string;
  prefsSubscribe: string;
  prefsSaved: string;
  prefsError: string;
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
  home: '← 回到首页',
  pendingTitle: '确认一下是你',
  pendingBody: '确认后，即使换台设备、换个浏览器，也能随时修改、删除自己的评论。',
  confirm: '是我',
  confirmAria: '确认这个邮箱是我的',
  verifying: '正在验证…',
  confirmedTitle: '验证成功',
  confirmedBody: (name) => `${name}，这个邮箱现在归你了。有人回复你的评论时，会发邮件提醒。`,
  confirmedBodyAnonymous: '这个邮箱现在归你了。有人回复你的评论时，会发邮件提醒。',
  prefsNotifyReplies: '有人回复我的评论时，邮件提醒我',
  prefsSubscribe: '订阅 buxx.me 的新文章',
  prefsSaved: '已保存',
  prefsError: '没保存上，再点一次试试。',
  alreadyTitle: '已经验证过了',
  alreadyBody: '这个邮箱之前就确认过了，这里没别的事。',
  invalidTitle: '链接已失效',
  invalidBody: '链接可能过期了，也可能已经用过一次。留下当时的邮箱，我们再发一封。',
  emailLabel: '邮箱',
  emailPlaceholder: '邮箱',
  resend: '重新发一封',
  resentTitle: '新的验证邮件已发出',
  resentBody: '去收件箱（也看看垃圾邮件）找最新的那封，旧链接已经作废。',
};

const en: ReaderConfirmCopy = {
  pageTitle: "Confirm it's you",
  pageDescription: 'Confirm the email you commented with.',
  back: '← Back to the blog',
  home: '← Back to the homepage',
  pendingTitle: "Confirm it's you",
  pendingBody: 'Once confirmed, you can edit and delete your own comments from any browser, on any device.',
  confirm: "Yes, it's me",
  confirmAria: 'Confirm this address is mine',
  verifying: 'Confirming…',
  confirmedTitle: "You're confirmed",
  confirmedBody: (name) => `${name}, this address is yours now. We'll email you when someone replies.`,
  confirmedBodyAnonymous: "This address is yours now. We'll email you when someone replies.",
  prefsNotifyReplies: 'Email me when someone replies to my comment',
  prefsSubscribe: 'Subscribe to new posts on buxx.me',
  prefsSaved: 'Saved',
  prefsError: "That didn't save. Try once more.",
  alreadyTitle: 'Already confirmed',
  alreadyBody: 'This address was confirmed earlier. Nothing else to do here.',
  invalidTitle: 'This link has expired',
  invalidBody: "It expired, or it has already been used. Leave the email you commented with and we'll send a fresh one.",
  emailLabel: 'Email',
  emailPlaceholder: 'Email',
  resend: 'Send a new link',
  resentTitle: 'A new link is on its way',
  resentBody: 'Check your inbox (and the spam folder) for the newest one — the old link no longer works.',
};

export const readerConfirmCopy = { zh, en } satisfies Record<BlogLocale, ReaderConfirmCopy>;

export function resolveReaderConfirmLocale(value: string | null | undefined): BlogLocale {
  return value === 'en' ? 'en' : 'zh';
}
