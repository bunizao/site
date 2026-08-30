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
      status and a server slug pick one. Rendered beside its code. */
  submitError: Record<CommentErrorCode, string>;
  /** Names the address, so a typo is catchable at the one moment it still
      matters -- a reader who mistyped their own email otherwise finds out by
      never hearing anything again. Takes the empty string where no address is
      on hand (the server-rendered demo state) and says the generic thing. */
  nudgeText: (email: string) => string;
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
  empty: '还没有人来过。第一个说点什么吧。',
  loadError: '评论好像迷路了。',
  retry: '重试',
  closed: '这篇的评论区打烊了。',
  loadMore: '更多评论',
  loading: '加载中',

  nameLabel: '昵称',
  namePlaceholder: '昵称',
  emailLabel: '邮箱',
  /* Deliberately not a translation of the English, which names the reason
     (for avatar); 私密 names the guarantee, and that is the half that reads
     better in Chinese. */
  emailPlaceholder: '邮箱（私密）',
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
  held: '这条评论已发出，暂时只有你能看到。',
  verifying: '发布中',
  reply: '回复',
  edit: '编辑',
  editLabel: '编辑你的评论',
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
    NET: '网络断了，草稿还在。连上再试一次。',
    RATE: '发得有点快，歇一分钟再来。草稿还在。',
    BOT: '人机验证过期了，刷新页面再试一次。',
    GONE: '这篇的评论区暂时用不了。',
    THREAD: '要回复的那条评论不在了，刷新一下看看。',
    CLOSED: '这条已经不能改了。',
    INPUT: '这条没能通过，换个说法再试试。',
    SERVER: '服务器出了点问题，草稿还在。等会儿再试。',
  },
  nudgeText: (email) => (email
    ? `去 ${email} 收确认信，之后就能管理评论、接收回复提醒。`
    : '确认邮箱后，就能管理评论、接收回复提醒。'),
  nudgeSubscribe: '订阅新文章邮件',
  dismiss: '关闭',

  needBody: '评论一定要有文字。',
  needName: '参与讨论的人，值得一个好名字。',
  needEmail: '需要邮箱来显示头像、接收回复通知。',
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
  emailPlaceholder: 'Email (for avatar)',
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
  held: 'Posted — for now, only you can see it.',
  verifying: 'Publishing',
  reply: 'Reply',
  edit: 'Edit',
  editLabel: 'Edit your comment',
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
    NET: "You're offline — your draft is safe. Try again once you're back.",
    RATE: "That's a lot at once. Wait a minute — your draft is safe.",
    BOT: 'The bot check expired. Refresh the page and try again.',
    GONE: "Comments on this post aren't available right now.",
    THREAD: "The comment you're replying to is gone. Refresh to see the thread.",
    CLOSED: "That can't be changed any more.",
    INPUT: "That didn't go through. Try rewording it.",
    SERVER: 'Something broke on our end — your draft is safe. Try again shortly.',
  },
  nudgeText: (email) => (email
    ? `Check ${email} to confirm — then you can manage your comments and get reply notices.`
    : 'Confirm your email to manage your comments and get reply notices.'),
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
