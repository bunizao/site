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
// Speech, not prose. An earlier pass was correct and complete and read like a
// notice taped to a door, because it punctuated every line and finished every
// clause. Chat does neither: no trailing full stop, and fragments where a
// fragment is what someone would actually type. Question marks stay -- those
// are still questions.

export interface MessageCopy {
  /** Document title and the page's visually hidden <h1>. Nothing draws it:
      the thread opens with speech. */
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

export const messageCopy: MessageCopy = {
  title: 'Write to me',
  opener: 'hey, got something to tell you',
  lede: 'Nothing here goes public. I am the only one who reads it.',
  intro: 'Go ahead. This one is private, it comes straight to me.',
  invite: 'Leave an email so I can write back.',
  nameLabel: 'Name',
  namePlaceholder: 'Name',
  emailLabel: 'Email',
  emailPlaceholder: 'Email',
  bodyLabel: 'What is on your mind',
  bodyPlaceholder: 'What is on your mind...',
  submit: 'Send',
  submitting: 'Sending',
  privacy: 'This note is never shown publicly.',
  sentReplyable: 'Got it. If it needs an answer I will mail the address you left',
  sentVerify: 'Got it. Sent a confirmation to your inbox, click the link and I can write back. Or skip it, no harm',
  sentAnonymous: 'Got it. The confirmation did not go out, so I probably cannot reply. Read this though',
  sendAnother: 'Write another',
  errorGeneric: 'That did not send, try again in a bit?',
  errorRateLimited: 'That is a lot at once, give it a few minutes',
  errorTurnstile: 'The human check did not pass, reload and try again',
  errorBody: 'Write something, a couple of characters at least',
  errorName: 'Leave a name, any name',
  errorEmailMissing: 'Leave an email, or I cannot answer',
  errorEmail: 'That address does not look right',
};
