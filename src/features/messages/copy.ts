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
  /** Document title, masthead trigger's destination name, and the page's
      visually hidden <h1>. Nothing draws it: the thread opens with speech. */
  title: string;
  /** The reader's line, and the first bubble. Written in their voice, not the
      owner's -- it is the reason someone opened this page, said out loud, and
      the two bubbles under it are the answer to it. No full stop, unlike every
      other line here: nobody punctuates the first thing they type into a chat,
      and a period on a four-word opener reads as bad news coming. */
  opener: string;
  /** Meta description only -- the thread says this across two bubbles. */
  lede: string;
  /** The owner's answer, first line: what happens to what you write. */
  intro: string;
  /** The owner's answer, second line: what the form needs, and permission to
      take your time. */
  invite: string;
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
  errorEmailMissing: string;
  errorEmail: string;
}

export const messagesCopy: Record<'zh' | 'en', MessageCopy> = {
  zh: {
    trigger: '留言',
    title: '给我留言',
    opener: '诶，想跟你说个事',
    lede: '这里写的东西不会公开，只有我看得到。想说什么都行。',
    intro: '这里写的东西不会公开，只有我看得到。',
    invite: '留个邮箱，不然我没办法回你。想说什么都行，慢慢写。',
    nameLabel: '怎么称呼你',
    namePlaceholder: '怎么称呼你',
    emailLabel: '邮箱',
    emailPlaceholder: '邮箱',
    bodyLabel: '想说的话',
    bodyPlaceholder: '想说的话…',
    submit: '发送',
    submitting: '发送中',
    privacy: '不会出现在网站的任何地方',
    sentReplyable: '收到了。要是需要回复，会发到你留的邮箱。',
    sentVerify: '收到了。我往你留的邮箱发了一封确认信，点一下里面的链接我才能回你。不点也没关系。',
    sentAnonymous: '收到了。确认信这次没发出去，所以我大概回不了你——但这条我看到了。',
    sendAnother: '再写一条',
    errorGeneric: '没发出去。过一会儿再试试？',
    errorRateLimited: '发得有点快，歇一会儿再来。',
    errorTurnstile: '人机验证没过，刷新页面重试一下。',
    errorBody: '写点东西吧，至少两个字。',
    errorName: '留个称呼，怎么写都行。',
    errorEmailMissing: '留个邮箱吧，不然我回不了你。',
    errorEmail: '这个邮箱地址看起来不太对。',
  },
  en: {
    trigger: 'Message',
    title: 'Write to me',
    opener: 'hey, got something to tell you',
    lede: 'Nothing here goes public. I am the only one who reads it.',
    intro: 'Nothing here goes public. I am the only one who reads it.',
    invite: 'Leave an address, or I have no way to answer. Say anything. Take your time.',
    nameLabel: 'What to call you',
    namePlaceholder: 'What to call you',
    emailLabel: 'Email',
    emailPlaceholder: 'Email',
    bodyLabel: 'Your message',
    bodyPlaceholder: 'Your message…',
    submit: 'Send',
    submitting: 'Sending',
    privacy: 'Appears nowhere on the site',
    sentReplyable: 'Got it. If it needs an answer, it goes to the address you left.',
    sentVerify: 'Got it. I sent a confirmation to your address — click the link in it and I can write back. Skip it if you like.',
    sentAnonymous: 'Got it. The confirmation did not go out this time, so I probably cannot write back — but I have this.',
    sendAnother: 'Write another',
    errorGeneric: 'That did not send. Try again in a moment?',
    errorRateLimited: 'That is a lot at once. Give it a few minutes.',
    errorTurnstile: 'The human check did not pass. Reload the page and try again.',
    errorBody: 'Write something — a couple of characters at least.',
    errorName: 'Leave a name. Any name.',
    errorEmailMissing: 'Leave an address, or I cannot answer.',
    errorEmail: 'That address does not look right.',
  },
};
