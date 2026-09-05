// Copy for the /message thread, in both site locales.
//
// The voice is the point here. This form asks a stranger to write something
// only one person will ever read, which is a different act from leaving a
// comment and should not be dressed as one. So: no "get in touch", no
// "we value your feedback", no plural we. It says who reads it, whether an
// answer can reach them, and nothing else.
//
// The page reads as a conversation, so these lines are written as speech --
// short, one thought each, in the order someone would actually say them. That
// is also why they are separate fields rather than one paragraph: each one is
// a bubble, and a bubble holding two thoughts reads as a wall.

export interface MessageCopy {
  /** Masthead trigger label. Sits beside 订阅 / 联系, so it matches their
      weight -- a noun, not a sentence. */
  trigger: string;
  /** First bubble, and the page's <h1>. */
  title: string;
  /** Meta description only -- the thread says this across two bubbles. */
  lede: string;
  /** Bubble two: what happens to what you write. */
  intro: string;
  /** Bubble three: permission to take your time. */
  invite: string;
  /** Sits above the fields, inside the form bubble. The trade, stated plainly. */
  emailNote: string;
  /** Labels are visually hidden -- the placeholder carries them on screen, and
      these keep the fields named for anyone not looking at it. */
  nameLabel: string;
  namePlaceholder: string;
  emailLabel: string;
  emailPlaceholder: string;
  bodyLabel: string;
  bodyPlaceholder: string;
  submit: string;
  submitting: string;
  privacy: string;
  /** Receipt bubbles, by what can actually happen next. */
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
    intro: '这里写的东西不会公开，只有我看得到。',
    invite: '想说什么都行，慢慢写。',
    emailNote: '留了邮箱我才有办法回你。不留也能发。',
    nameLabel: '怎么称呼你',
    namePlaceholder: '怎么称呼你',
    emailLabel: '邮箱（选填）',
    emailPlaceholder: '邮箱，选填',
    bodyLabel: '想说的话',
    bodyPlaceholder: '想说的话…',
    submit: '发送',
    submitting: '发送中',
    privacy: '不会出现在网站的任何地方',
    sentReplyable: '收到了。要是需要回复，会发到你留的邮箱。',
    sentVerify: '收到了。我往你留的邮箱发了一封确认信，点一下里面的链接我才能回你。不点也没关系。',
    sentAnonymous: '收到了。你没有留邮箱，所以我没办法回你。但这条我看到了。',
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
    intro: 'Nothing here goes public. I am the only one who reads it.',
    invite: 'Say anything. Take your time.',
    emailNote: 'An address is the only way I can write back. Without one this still sends.',
    nameLabel: 'What to call you',
    namePlaceholder: 'What to call you',
    emailLabel: 'Email (optional)',
    emailPlaceholder: 'Email, optional',
    bodyLabel: 'Your message',
    bodyPlaceholder: 'Your message…',
    submit: 'Send',
    submitting: 'Sending',
    privacy: 'Appears nowhere on the site',
    sentReplyable: 'Got it. If it needs an answer, it goes to the address you left.',
    sentVerify: 'Got it. I sent a confirmation to your address — click the link in it and I can write back. Skip it if you like.',
    sentAnonymous: 'Got it. You left no address, so I cannot write back — but I have this.',
    sendAnother: 'Write another',
    errorGeneric: 'That did not send. Try again in a moment?',
    errorRateLimited: 'That is a lot at once. Give it a few minutes.',
    errorTurnstile: 'The human check did not pass. Reload the page and try again.',
    errorBody: 'Write something — a couple of characters at least.',
    errorName: 'Leave a name. Any name.',
    errorEmail: 'That address does not look right.',
  },
};
