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
  /** The line under the heading. It is the prompt, so the compose box below it
      carries no placeholder of its own -- the two sat one above the other. */
  invite: string;
  empty: string;
  loadError: string;
  retry: string;
  loadMore: string;
  loading: string;

  /* --- Compose ----------------------------------------------------------- */
  nameLabel: string;
  namePlaceholder: string;
  emailLabel: string;
  emailPlaceholder: string;
  bodyLabel: string;
  /** Empty on purpose: `invite`, one line above the box, already says it. */
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
      who is the only person the row is served to. It says what happened, not
      who is looking: "held for review, and until it clears only you can see
      it" made the reader the subject of a sentence about their own comment. */
  held: string;
  reply: string;
  edit: string;
  editLabel: string;
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
  needEmail: string;
  badEmail: string;
}

const zh: CommentsCopy = {
  title: '评论',
  invite: '说点什么…',
  empty: '还没有人来过。第一个说点什么吧。',
  loadError: '评论没能加载。',
  retry: '重试',
  loadMore: '更多评论',
  loading: '加载中',

  nameLabel: '昵称',
  namePlaceholder: '昵称',
  emailLabel: '邮箱',
  emailPlaceholder: '邮箱（私密）',
  bodyLabel: '写评论',
  bodyPlaceholder: '',
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
  tombstone: '此评论已删除',
  held: '这条评论先搁一下。',
  reply: '回复',
  edit: '编辑',
  editLabel: '编辑你的评论',
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
  receiptHeld: '收到了，先搁一下',
  receiptError: '没能发出去，草稿还在。再试一次。',
  nudgeText: '确认邮箱后可管理评论、接收回复通知',
  nudgeSubscribe: '订阅新文章邮件',
  dismiss: '关闭',

  needBody: '评论一定要有文字。',
  needName: '参与讨论的人，值得一个好名字。',
  needEmail: '需要邮箱来显示头像、接收回复通知。',
  badEmail: '这个邮箱看起来不太对。',
};

const en: CommentsCopy = {
  title: 'Comments',
  invite: 'Say something…',
  empty: 'Nothing here yet. Be the first to say something.',
  loadError: "Couldn't load comments.",
  retry: 'Retry',
  loadMore: 'Load more',
  loading: 'Loading',

  nameLabel: 'Display name',
  namePlaceholder: 'Displayed name',
  emailLabel: 'Email',
  emailPlaceholder: 'Email (never shown)',
  bodyLabel: 'Write a comment',
  bodyPlaceholder: '',
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
  receiptHeld: 'Got it — on hold for a moment',
  receiptError: "Couldn't post that — your draft is still here. Try again.",
  nudgeText: 'Confirm your email to manage your comments and get reply notices',
  nudgeSubscribe: 'Also email me new posts',
  dismiss: 'Dismiss',

  needBody: 'A comment needs words.',
  needName: 'Everyone in a conversation deserves a name.',
  needEmail: 'An email is needed for your avatar and reply notices.',
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
