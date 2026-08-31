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
  /** Remembered-but-unverified reader, with an escape hatch beside it. */
  claimedAs: (name: string) => string;
  switchIdentity: string;

  /* --- A comment row ----------------------------------------------------- */
  authorBadge: string;
  edited: string;
  tombstone: string;
  /** Shown on a row the moderation pass held back -- and only to its writer,
      who is the only person the row is served to. Plain status, in the register
      every other platform uses for this: "held for review, and until it clears
      only you can see it" said the same thing in a clause about the reader
      rather than about the comment. */
  held: string;
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
  editError: string;
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
  /** Liking a post needs no account, so these are the only two states. */
  reactAdd: string;
  reactRemove: string;

  /* --- Receipt ----------------------------------------------------------- */
  receiptPosted: string;
  receiptHeld: string;
  receiptError: string;
  nudgeText: string;
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
  claimedAs: (name) => `以 ${name} 评论`,
  switchIdentity: '换一个',

  authorBadge: '作者',
  edited: '已编辑',
  tombstone: '这条评论已删除。',
  held: '这条评论正在审核中。',
  reply: '回复',
  edit: '编辑',
  editLabel: '编辑你的评论',
  verifyHint: '验证邮箱后可编辑或删除这条评论。',
  save: '保存',
  cancel: '取消',
  discard: '不保存？',
  remove: '删除',
  removeConfirm: '删除这条评论？',
  editError: '这次修改没能保存。',
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
  reactRemove: '取消喜欢',

  receiptPosted: '已发布',
  receiptHeld: '已提交，正在审核',
  receiptError: '没能发出去，草稿还在。再试一次。',
  nudgeText: '确认邮箱后可管理评论、接收回复通知',
  nudgeSubscribe: '订阅新文章邮件',
  dismiss: '关闭',

  needBody: '评论一定要有文字。',
  needName: '参与讨论的人，值得一个好名字。',
  badEmail: '这个邮箱看起来不太对。',
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
  claimedAs: (name) => `Commenting as ${name}`,
  switchIdentity: 'Use another',

  authorBadge: 'Author',
  edited: 'edited',
  tombstone: 'This comment was deleted.',
  held: 'This comment is on hold.',
  reply: 'Reply',
  edit: 'Edit',
  editLabel: 'Edit your comment',
  verifyHint: 'Verify your email to edit or delete this comment.',
  save: 'Save',
  cancel: 'Cancel',
  discard: 'Discard?',
  remove: 'Delete',
  removeConfirm: 'Delete this comment?',
  editError: "Couldn't save that edit.",
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
  reactRemove: 'Remove your reaction',

  receiptPosted: 'Posted',
  receiptHeld: 'Submitted — waiting for review',
  receiptError: "Couldn't post that — your draft is still here. Try again.",
  nudgeText: 'Confirm your email to manage your comments and get reply notices',
  nudgeSubscribe: 'Also email me new posts',
  dismiss: 'Dismiss',

  needBody: 'A comment needs words.',
  needName: 'Everyone in a conversation deserves a name.',
  badEmail: "That email doesn't look right.",
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
