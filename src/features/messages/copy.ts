// Copy for the /message form, in both site locales.
//
// The voice is the point here. This form asks a stranger to write something
// only one person will ever read, which is a different act from leaving a
// comment and should not be dressed as one. So: no "get in touch", no
// "we value your feedback", no plural we. It says who reads it, whether an
// answer can reach them, and nothing else.

export interface MessageCopy {
  /** Masthead trigger label. Sits beside 订阅 / 联系, so it matches their
      weight -- a noun, not a sentence. */
  trigger: string;
  title: string;
  lede: string;
  nameLabel: string;
  namePlaceholder: string;
  emailLabel: string;
  emailOptional: string;
  emailPlaceholder: string;
  /** Sits under the address field. The trade being offered, stated plainly. */
  emailHint: string;
  bodyLabel: string;
  bodyPlaceholder: string;
  submit: string;
  submitting: string;
  privacy: string;
  /** Receipt headings and bodies, by what can actually happen next. */
  sentTitle: string;
  sentReplyable: string;
  sentVerify: string;
  sentAnonymous: string;
  sendAnother: string;
  errorGeneric: string;
  errorRateLimited: string;
  errorTurnstile: string;
  errorBody: string;
  errorName: string;
  errorEmail: string;
}

export const messagesCopy: Record<'zh' | 'en', MessageCopy> = {
  zh: {
    trigger: '留言',
    title: '给我留言',
    lede: '这里写的东西不会公开，只有我看得到。想说什么都行。',
    nameLabel: '怎么称呼你',
    namePlaceholder: '随便写，化名也行',
    emailLabel: '邮箱',
    emailOptional: '选填',
    emailPlaceholder: 'you@example.com',
    emailHint: '留了邮箱我才有办法回你。不留也能发，我就是收不到回信的地址。',
    bodyLabel: '想说的话',
    bodyPlaceholder: '慢慢写，不着急。',
    submit: '发送',
    submitting: '发送中…',
    privacy: '这条留言不会出现在网站的任何地方。',
    sentTitle: '收到了。',
    sentReplyable: '我会看的。要是需要回复，会发到你留的邮箱。',
    sentVerify: '我给你的邮箱发了一封确认信——点一下里面的链接，我才能回你。不点也没关系，留言我已经收到了。',
    sentAnonymous: '你没有留邮箱，所以我没办法回你——但这条我看到了。',
    sendAnother: '再写一条',
    errorGeneric: '没发出去。过一会儿再试试？',
    errorRateLimited: '发得有点快，歇一会儿再来。',
    errorTurnstile: '人机验证没过，刷新页面重试一下。',
    errorBody: '写点东西吧，至少两个字。',
    errorName: '留个称呼，怎么写都行。',
    errorEmail: '这个邮箱地址看起来不太对。',
  },
  en: {
    trigger: 'Message',
    title: 'Write to me',
    lede: 'Nothing here goes public. I am the only one who reads it.',
    nameLabel: 'What to call you',
    namePlaceholder: 'Anything. A made-up name is fine',
    emailLabel: 'Email',
    emailOptional: 'optional',
    emailPlaceholder: 'you@example.com',
    emailHint: 'An address is the only way I can write back. Without one this still sends — I just have nowhere to answer.',
    bodyLabel: 'What you want to say',
    bodyPlaceholder: 'Take your time.',
    submit: 'Send',
    submitting: 'Sending…',
    privacy: 'This message will not appear anywhere on the site.',
    sentTitle: 'Got it.',
    sentReplyable: 'I read these. If it needs an answer, it goes to the address you left.',
    sentVerify: 'I sent a confirmation to your address — click the link in it and I can write back. Skip it if you like; your message already arrived.',
    sentAnonymous: 'You left no address, so I cannot write back — but I have this.',
    sendAnother: 'Write another',
    errorGeneric: 'That did not send. Try again in a moment?',
    errorRateLimited: 'That is a lot at once. Give it a few minutes.',
    errorTurnstile: 'The human check did not pass. Reload the page and try again.',
    errorBody: 'Write something — a couple of characters at least.',
    errorName: 'Leave a name. Any name.',
    errorEmail: 'That address does not look right.',
  },
};
