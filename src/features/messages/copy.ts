// Copy for the /message thread. English only.
//
// The page used to carry both site locales and pick one from the blog's
// setting, which meant a Chinese blog served a Chinese form to every visitor
// regardless of what they had been reading. This is not blog content: the
// address is root-level, the masthead only links here, and the person who
// reads what gets written is one bilingual owner. One language, chosen once,
// costs nothing that matters -- the label on the masthead trigger stays with
// the blog's own copy, because that word sits in the blog's sentence.
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
//
// Speech, not prose: contractions everywhere, fragments where a fragment is
// what someone would actually type, and the occasional lowercase opener. The
// emoji are punctuation, not decoration -- one per line at most, only where a
// person would reach for one, and never carrying meaning of their own, since a
// screen reader announces the whole name of every one of them.

export interface MessageCopy {
  /** Document title and the page's visually hidden <h1>. Nothing draws it:
      the thread opens with speech. */
  title: string;
  /** The reader's line, and the first bubble. Written in their voice, not the
      owner's -- it is the reason someone opened this page, said out loud, and
      the two bubbles under it are the answer to it. */
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

export const messageCopy: MessageCopy = {
  title: 'Write to me',
  opener: 'Hey 👋 wanted to reach out!',
  lede: "Nothing here goes public. I'm the only one who reads it.",
  intro: "Go for it! It's totally private and comes straight to me.",
  invite: 'plz drop an email so I can get back to you 📮',
  nameLabel: 'Name',
  namePlaceholder: 'Name',
  emailLabel: 'Email',
  emailPlaceholder: 'Email',
  bodyLabel: "What's up?",
  bodyPlaceholder: "What's up?",
  submit: 'Send',
  submitting: 'Sending',
  privacy: 'Just between you and me.',
  sentReplyable: "Got it ✅ if it needs an answer I'll mail the address you left",
  sentVerify: 'Got it ✅ Sent a confirmation to your inbox, click the link and I can write back. Or skip it, no harm',
  sentAnonymous: "Got it, though the confirmation didn't go out, so I probably can't reply. Reading it anyway",
  sendAnother: 'Write another',
  errorGeneric: "That didn't send, try again in a bit?",
  errorRateLimited: "That's a lot at once, give it a few minutes",
  errorTurnstile: "The human check didn't pass, reload and try again",
  errorBody: 'Write something, a couple of characters at least',
  errorName: 'Leave a name, any name',
  errorEmailMissing: "Leave an email, or I can't answer",
  errorEmail: "That address doesn't look right",
};
