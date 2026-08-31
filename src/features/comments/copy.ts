/* Every word the comments UI says, in both blog locales.

   The thread used to be written in whatever language each string was authored
   in: a Chinese receipt ("已发布") under an English button ("Post"), a Chinese
   claim line ("以 X 评论") beside an English placeholder ("Displayed name").
   On a zh page with a zh byline and a zh subscribe panel that read as a bug,
   because it was one.

   The locale is a property of the rendered page, not of the bundle, so the
   server stamps it on the thread root as `data-locale` and both renderers ask
   the DOM for it -- `CommentsSection.astro` and `client/comments-controller.ts`
   have to emit identical markup, and a single source they both read from is
   the only way that stays true. Nothing here imports `@/data/site` at runtime;
   the type import costs nothing in the client bundle. */

import type { BlogLocale } from '@/data/site';
import type { CommentErrorCode } from '@/features/comments/comment-error';

export interface CommentsCopy {
  /* --- Thread ------------------------------------------------------------ */
  title: string;
  empty: string;
  loadError: string;
  retry: string;
  /** The author closed the thread on this post -- an internal `#no-comments`
      tag in Ghost, read in blog/[slug].astro. Covers both cases with one
      string: a post that never opened comments, and one locked after the
      fact, which still renders whatever was already written below this. */
  closed: string;
  loadMore: string;
  loading: string;

  /* --- Compose ----------------------------------------------------------- */
  nameLabel: string;
  namePlaceholder: string;
  emailLabel: string;
  emailPlaceholder: string;
  /** The green recommendation beside the email field -- shown once per
      compose attempt, on the first press of Post, when an anonymous writer
      left it empty. Friendly, not a gate: it names the upside (reply
      notices, an avatar of your own) and says outright that skipping it is
      fine, because the second press of the same button posts either way. */
  emailRecommend: string;
  bodyLabel: string;
  /** The prompt, and the only place it appears. It used to be a line of its own
      between the heading and the box, which said the same thing one line early
      and put a sentence between "评论" and the thing it names. Inside the box
      it is in the reader's way at the moment it applies, and it leaves when
      they start writing. */
  bodyPlaceholder: string;
  replyBodyLabel: string;
  /** The travelling reply box points at whoever it landed under. */
  replyTo: (author: string) => string;
  hint: string;
  post: string;
  postAria: string;
  replyPost: string;
  replyPostAria: string;

  /** Verified reader: shown with their avatar under the box. */
  postingAs: (name: string) => string;
  /** Remembered-but-unverified reader. Names the scope on purpose: the old
      wording ("以 X 评论" / "Commenting as X") read as a claim about an
      account, and this grade is only a record in one browser -- which is
      exactly the thing sign-out undoes. */
  claimedAs: (name: string) => string;
  /** The identity strip's one action, offered in both phases: forget me on
      this browser. `signOutConfirm` is the same button after the first press,
      asking rather than telling. */
  signOut: string;
  signOutConfirm: string;

  /* --- A comment row ----------------------------------------------------- */
  authorBadge: string;
  edited: string;
  tombstone: string;
  /** Shown on a row the moderation pass held back, and only ever to its
      writer -- nobody else is served the row at all. Which is the one fact it
      has to carry: "这条评论正在审核中" named a verdict the reader did not
      ask about and left the obvious question unanswered -- if it is under
      review, why am I looking at it? Naming the audience answers that and
      drops the accusation in the same breath. */
  held: string;
  /** A row this browser has just posted while the moderation verdict is still
      in flight. It almost always clears within seconds, so it is a mark on the
      byline rather than the block note `held` carries -- announcing a review
      that is about to end is how a working thread reads as a stuck one. It
      says what is happening (the comment is going up), not what is being done
      to it. */
  verifying: string;
  reply: string;
  edit: string;
  editLabel: string;
  /** Shown on a `mine` row that carries neither `editableUntil` nor
      `deletable` -- a comment posted without an email, or one written before
      the address behind it was verified. Quiet, not an error: it names the
      one thing that would change the row (verifying the email later binds it
      to the reader row, per plans/blog-comments.md "Sessions and ownership")
      and never implies the row is broken or wrong. */
  verifyHint: string;
  save: string;
  cancel: string;
  /** Second press of Cancel on a touched edit field. */
  discard: string;
  remove: string;
  removeConfirm: string;
  likeLabel: (author: string) => string;
  /** `clock` is always `M:SS`; only the words around it move. */
  timeLeft: (clock: string) => string;
  /* Comment age. Deliberately hand-written rather than Intl.RelativeTimeFormat:
     `narrow` renders en as "5 min. ago", and the byline wants "5m". Chinese has
     no equally terse form that stays unambiguous, so it takes the plain one. */
  relativeDate: {
    now: string;
    minutes: (n: number) => string;
    hours: (n: number) => string;
    days: (n: number) => string;
    months: (n: number) => string;
    years: (n: number) => string;
  };

  /* --- Reaction bar ------------------------------------------------------ */
  /** Liking a post needs no account, and cannot be taken back -- see
      ReactionBar.tsx. `reactDone` is what the control says once it has been
      spent, not an invitation to press it again. */
  reactAdd: string;
  reactDone: string;

  /* --- Receipt -----------------------------------------------------------
     Success says nothing: the comment itself arrives in the list under the box
     with the reader's name on it, which is better evidence than a label. Only
     the failure has to be spoken, and it is spoken in the same slot the
     validation complaints use (compose-validate.ts) rather than a second one
     below the box. */
  /** Keyed by what the reader can do next -- see comment-error.ts for how a
      status and a server slug pick one. Rendered beside its code.

      Register: say what happened, say the next move, and put the
      reassurance in a clause of its own where there is one to give. The
      earlier set was correct and clipped -- "网络断了，草稿还在。连上再试一
      次。" is three imperatives in eleven characters, which reads like a
      terminal, not like the rest of this page. Softer is not vaguer: every
      line still names the same next move it named before.

      `LONG` is also the client-side complaint when the box is over the cap
      (compose-validate.ts), so the reader meets the same sentence whether the
      browser or the server counted. One cap, one wording. */
  submitError: Record<CommentErrorCode, string>;
  /** Names the address, so a typo is catchable at the one moment it still
      matters -- a reader who mistyped their own email otherwise finds out by
      never hearing anything again. Takes the empty string where no address is
      on hand (the server-rendered demo state) and says the generic thing. */
  nudgeText: (email: string) => string;
  /** Label on the button that opens the page's subscribe panel. A verb, not
      a checkbox label: pressing it opens something. */
  nudgeSubscribe: string;
  dismiss: string;

  /* --- Validation (compose-validate.ts) ---------------------------------- */
  needBody: string;
  needName: string;
  /** Email has no "missing" message any more -- it is optional, so an empty
      field is never a validation failure. A malformed one still is: see
      badEmail. */
  badEmail: string;
}

const zh: CommentsCopy = {
  title: '评论',
  empty: '还没有人来过。第一个说点什么吧。',
  loadError: '评论好像迷路了。',
  retry: '重试',
  closed: '这篇的评论区打烊了。',
  loadMore: '更多评论',
  loading: '加载中',

  nameLabel: '昵称',
  namePlaceholder: '昵称',
  emailLabel: '邮箱',
  emailPlaceholder: '邮箱（选填）',
  emailRecommend: '留个邮箱，回复时能通知你，还能有自己的头像。不留也可以发。',
  bodyLabel: '写评论',
  bodyPlaceholder: '说点什么…',
  replyBodyLabel: '写回复',
  replyTo: (author) => `回复 ${author}…`,
  hint: '支持 Markdown',
  post: '发表',
  postAria: '发表评论',
  replyPost: '回复',
  replyPostAria: '发表回复',

  postingAs: (name) => `以 ${name} 的身份发表`,
  claimedAs: (name) => `这台设备记住了 ${name}`,
  signOut: '退出',
  signOutConfirm: '确定退出？',

  authorBadge: '作者',
  edited: '已编辑',
  tombstone: '这条评论已删除。',
  held: '这条评论已发出，暂时只有你能看到。',
  verifying: '发布中',
  reply: '回复',
  edit: '编辑',
  editLabel: '编辑你的评论',
  verifyHint: '验证邮箱后可编辑或删除这条评论。',
  save: '保存',
  cancel: '取消',
  discard: '不保存？',
  remove: '删除',
  removeConfirm: '删除这条评论？',
  likeLabel: (author) => `给 ${author} 的评论点赞`,
  timeLeft: (clock) => `还剩${clock}`,
  relativeDate: {
    now: '刚刚',
    minutes: (n) => `${n}分钟前`,
    hours: (n) => `${n}小时前`,
    days: (n) => `${n}天前`,
    months: (n) => `${n}个月前`,
    years: (n) => `${n}年前`,
  },

  reactAdd: '喜欢这篇',
  reactDone: '已喜欢',

  submitError: {
    NET: '好像断网了，等网络回来再发一次吧。草稿都还在。',
    RATE: '发得有点太快啦，歇一分钟再来。草稿还在。',
    BOT: '人机验证过期了，刷新一下页面就好。',
    GONE: '这篇文章的评论区暂时用不了。',
    THREAD: '要回复的那条评论已经不在了，刷新一下看看？',
    CLOSED: '过了可以修改的时间，这条改不了啦。',
    NAME: '这个名字用不了，换一个试试？',
    EMAIL: '这个邮箱地址用不了，换一个试试？',
    LONG: '字数有点超啦（上限 2000 字），精简一下再发吧。',
    STALE: '页面停留太久失效了，刷新一下再发吧。别担心，草稿已保存。',
    INPUT: '这条没能发出去，刷新页面再试一次吧。草稿已经保存了。',
    SERVER: '服务器打了个盹，等会儿再试试。草稿已保存，别担心。',
  },
  nudgeText: (email) => (email
    ? `确认信已经发到 ${email} 了，点一下就能管理评论、接收回复提醒。`
    : '确认邮箱后，就能管理评论、接收回复提醒。'),
  nudgeSubscribe: '订阅新文章',
  dismiss: '关闭',

  needBody: '还空着呢，写点什么再发吧。',
  needName: '参与讨论的人，值得一个好名字。',
  badEmail: '这个邮箱看起来不太对，检查一下？',
};

const en: CommentsCopy = {
  title: 'Comments',
  empty: 'Nothing here yet. Be the first to say something.',
  loadError: "The comments didn't make it.",
  retry: 'Retry',
  closed: 'Comments are closed on this post.',
  loadMore: 'Load more',
  loading: 'Loading',

  nameLabel: 'Name',
  namePlaceholder: 'Name',
  emailLabel: 'Email',
  emailPlaceholder: 'Email (optional)',
  emailRecommend: 'Add an email to get notified on replies and have your own avatar. Or post without one.',
  bodyLabel: 'Write a comment',
  bodyPlaceholder: 'Say something…',
  replyBodyLabel: 'Write a reply',
  replyTo: (author) => `Reply to ${author}…`,
  hint: 'Markdown supported',
  post: 'Post',
  postAria: 'Post comment',
  replyPost: 'Reply',
  replyPostAria: 'Post reply',

  postingAs: (name) => `Posting as ${name}`,
  claimedAs: (name) => `Remembered here as ${name}`,
  signOut: 'Sign out',
  signOutConfirm: 'Sign out?',

  authorBadge: 'Author',
  edited: 'edited',
  tombstone: 'This comment was deleted.',
  held: 'Posted — for now, only you can see it.',
  verifying: 'Publishing',
  reply: 'Reply',
  edit: 'Edit',
  editLabel: 'Edit your comment',
  verifyHint: 'Verify your email to edit or delete this comment.',
  save: 'Save',
  cancel: 'Cancel',
  discard: 'Discard?',
  remove: 'Delete',
  removeConfirm: 'Delete this comment?',
  likeLabel: (author) => `Like ${author}'s comment`,
  timeLeft: (clock) => `${clock} left`,
  relativeDate: {
    now: 'now',
    minutes: (n) => `${n}m`,
    hours: (n) => `${n}h`,
    days: (n) => `${n}d`,
    months: (n) => `${n}mo`,
    years: (n) => `${n}y`,
  },

  reactAdd: 'Like this post',
  reactDone: 'Liked',

  submitError: {
    NET: "Looks like you're offline. Post again once you're back — your draft's safe.",
    RATE: "Whoa, that's a lot at once. Give it a minute — your draft's safe.",
    BOT: 'The bot check timed out. Refresh the page and it should be fine.',
    GONE: "Comments on this post aren't available right now.",
    THREAD: "The comment you're replying to is gone. Refresh to see the thread?",
    CLOSED: "The edit window has closed — this one can't be changed now.",
    NAME: "That name won't work here. Try another?",
    EMAIL: "That email address won't work. Try another?",
    LONG: "That's a bit long (2000 characters max). Trim it and post again.",
    STALE: 'This page sat open long enough to go stale. Refresh and post again — your draft is saved.',
    INPUT: "That didn't go through. Refresh the page and try again — your draft is saved.",
    SERVER: 'Something dozed off on our end. Try again shortly — your draft is saved.',
  },
  nudgeText: (email) => (email
    ? `A confirmation is on its way to ${email} — one click and you can manage your comments and get reply notices.`
    : 'Confirm your email to manage your comments and get reply notices.'),
  nudgeSubscribe: 'Subscribe to new posts',
  dismiss: 'Dismiss',

  needBody: 'Nothing there yet — write something first.',
  needName: 'Everyone in a conversation deserves a name.',
  badEmail: "That email doesn't look right. Mind checking it?",
};

export const commentsCopy = { zh, en } satisfies Record<BlogLocale, CommentsCopy>;

/** Anything that is not `en` is the blog's own locale — see `blog.locale.blog`. */
export function resolveCommentsCopy(locale: string | null | undefined): CommentsCopy {
  return locale === 'en' ? en : zh;
}

/** For scripts that hold a node rather than a locale: the thread root carries
    `data-locale`, so any descendant can find its own language. */
export function copyFor(node: Element | null): CommentsCopy {
  return resolveCommentsCopy(node?.closest('[data-locale]')?.getAttribute('data-locale'));
}
