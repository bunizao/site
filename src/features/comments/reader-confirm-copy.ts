/* Copy for the reader verification landing page. It stays outside the thread
   copy table so this server-only screen never enters the comment controller
   bundle.

   The Chinese here is the owner's own wording -- treat it as fixed content,
   not as a draft to tighten. The English is its translation, and follows it
   when it changes. */

import type { BlogLocale } from '@/data/site';

export interface ReaderConfirmCopy {
  pageTitle: string;
  pageDescription: string;
  /** Back to the post the comment was left under. */
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
  confirmedBody: string;
  /** The same card reached without a token by a signed-in reader, which is
      where the reply mail's "turn these off" link lands. */
  settingsTitle: string;
  settingsBody: string;
  /** The two things a verified reader can decide. Reply alerts come on with
      the verification (the mail promised them); the newsletter does not. */
  prefsNotifyReplies: string;
  /** Scoped to the post the reply mail came from, and only rendered when the
      link carried one. Phrased positively like its neighbours: every switch
      on this card is on when the thing it names is happening, so "off" never
      has to be read as a double negative. */
  prefsMutePost: string;
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
  back: '← 返回文章',
  home: '← 返回首页',
  pendingTitle: '确认一下是你',
  pendingBody: '确认后，即使换台设备或浏览器，也能随时修改、删除评论。',
  confirm: '是我',
  confirmAria: '确认这个邮箱是我的',
  verifying: '正在验证…',
  confirmedTitle: '验证成功！',
  confirmedBody: '您的完整权限现已开启！后续有新回复时会收到邮件提醒。',
  settingsTitle: '评论提醒设置',
  settingsBody: '这几项随时可以改，改动立即生效。',
  prefsNotifyReplies: '有人回复我的评论时发送邮件提醒',
  prefsMutePost: '接收这篇文章的回复提醒',
  prefsSubscribe: '订阅 buxx.me 的最新文章',
  prefsSaved: '已保存',
  prefsError: '没保存上，再点一次试试。',
  alreadyTitle: '已经验证过了',
  alreadyBody: '该邮箱已完成确认。',
  invalidTitle: '链接已失效',
  invalidBody: '链接可能已过期或已被使用。填写当时的邮箱，即可重新获取验证链接。',
  emailLabel: '邮箱',
  emailPlaceholder: '邮箱',
  resend: '重新发一封',
  resentTitle: '新的验证邮件已发出',
  resentBody: '请前往收件箱（或垃圾邮件箱）查收最新链接，之前的旧链接已自动作废。',
};

const en: ReaderConfirmCopy = {
  pageTitle: "Confirm it's you",
  pageDescription: 'Confirm the email you commented with.',
  back: '← Back to the post',
  home: '← Back to the homepage',
  pendingTitle: "Confirm it's you",
  pendingBody: 'Once confirmed, you can edit and delete your comments at any time, even from another device or browser.',
  confirm: "Yes, it's me",
  confirmAria: 'Confirm this address is mine',
  verifying: 'Confirming…',
  confirmedTitle: "You're verified!",
  confirmedBody: "Full control is on. We'll email you whenever there's a new reply.",
  settingsTitle: 'Comment alert settings',
  settingsBody: 'Change any of these any time — it takes effect immediately.',
  prefsNotifyReplies: 'Email me when someone replies to my comment',
  prefsMutePost: 'Reply alerts for this post',
  prefsSubscribe: 'Subscribe to the latest posts on buxx.me',
  prefsSaved: 'Saved',
  prefsError: "That didn't save. Try once more.",
  alreadyTitle: 'Already verified',
  alreadyBody: 'This address has already been confirmed.',
  invalidTitle: 'This link has expired',
  invalidBody: "It may have expired or already been used. Enter the email you commented with and we'll send a fresh link.",
  emailLabel: 'Email',
  emailPlaceholder: 'Email',
  resend: 'Send a new link',
  resentTitle: 'A new verification email is on its way',
  resentBody: 'Check your inbox (or the spam folder) for the newest link — the old one has already been voided.',
};

export const readerConfirmCopy = { zh, en } satisfies Record<BlogLocale, ReaderConfirmCopy>;

export function resolveReaderConfirmLocale(value: string | null | undefined): BlogLocale {
  return value === 'en' ? 'en' : 'zh';
}
