import * as React from 'react';
import type { ReaderClaimCandidate, ReaderClaimsResult, ReaderClaimResult } from '@bunizao/contracts/comments';

const COPY = {
  en: {
    title: 'Review your earlier comments',
    intro: 'These comments used your email address before this account was confirmed. Select only comments you wrote; matching an email address alone does not prove authorship.',
    loading: 'Loading comments…',
    signIn: 'Confirm your email on this device to review earlier comments.',
    signInLink: 'Confirm email',
    empty: 'No earlier comments need your review.',
    more: 'You can review older comments without linking any of these.',
    previous: 'Previous comments',
    next: 'Older comments',
    page: 'Page',
    submit: 'Link selected comments',
    saving: 'Linking…',
    retry: 'Try again',
    error: 'Comments could not be loaded. Please try again.',
    saveError: 'Your selection could not be linked. Please try again.',
    done: (count: number) => `${count} comment${count === 1 ? '' : 's'} linked to your account.`,
    changed: 'Some comments were no longer available. The list has been refreshed.',
    select: 'I wrote this comment',
    settings: 'Comment settings',
  },
  zh: {
    title: '确认你以前的评论',
    intro: '这些评论在账户验证前填写了你的邮箱。请仅选择你本人写下的评论；邮箱相同并不能证明作者相同。',
    loading: '正在加载评论…',
    signIn: '请先在此设备上验证邮箱，再确认以前的评论。',
    signInLink: '验证邮箱',
    empty: '没有需要你确认的历史评论。',
    more: '无需关联当前评论，也可以继续查看更早的评论。',
    previous: '上一页',
    next: '更早的评论',
    page: '页码',
    submit: '关联所选评论',
    saving: '正在关联…',
    retry: '重试',
    error: '评论加载失败，请重试。',
    saveError: '所选评论关联失败，请重试。',
    done: (count: number) => `已将 ${count} 条评论关联到你的账户。`,
    changed: '部分评论已不可关联，列表已刷新。',
    select: '这条评论是我写的',
    settings: '评论设置',
  },
};

export default function ReaderClaims({ locale = 'en' }: { locale?: 'en' | 'zh' }) {
  const t = COPY[locale];
  const [comments, setComments] = React.useState<ReaderClaimCandidate[]>([]);
  const [selected, setSelected] = React.useState<Set<string>>(new Set());
  const [hasMore, setHasMore] = React.useState(false);
  const [state, setState] = React.useState<'loading' | 'ready' | 'unauthorized' | 'error'>('loading');
  const [busy, setBusy] = React.useState(false);
  const [notice, setNotice] = React.useState('');
  const [offset, setOffset] = React.useState(0);

  async function load(pageOffset = offset, signal?: AbortSignal): Promise<void> {
    setOffset(pageOffset);
    try {
      const response = await fetch(`/api/v2/reader/claims${pageOffset ? `?offset=${pageOffset}` : ''}`, { signal });
      if (response.status === 401) {
        setState('unauthorized');
        return;
      }
      if (!response.ok) throw new Error('claims_unavailable');
      const result = await response.json() as ReaderClaimsResult;
      if (signal?.aborted) return;
      setComments(result.comments);
      setHasMore(result.hasMore);
      setSelected(new Set());
      setState('ready');
    } catch {
      if (!signal?.aborted) setState('error');
    }
  }

  React.useEffect(() => {
    const controller = new AbortController();
    void load(0, controller.signal);
    return () => controller.abort();
  }, []);

  async function claim(event: React.FormEvent): Promise<void> {
    event.preventDefault();
    if (busy || selected.size === 0) return;
    const ids = Array.from(selected);
    setBusy(true);
    setNotice('');
    try {
      const response = await fetch('/api/v2/reader/claims', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ commentIds: ids }),
      });
      if (response.status === 401) {
        setState('unauthorized');
        return;
      }
      if (!response.ok) throw new Error('claim_failed');
      const result = await response.json() as ReaderClaimResult;
      setNotice(`${t.done(result.claimedIds.length)}${result.claimedIds.length < ids.length ? ` ${t.changed}` : ''}`);
      await load(0);
    } catch {
      setNotice(t.saveError);
    } finally {
      setBusy(false);
    }
  }

  return <section className="reader-claims" aria-labelledby="reader-claims-title">
    <h1 id="reader-claims-title">{t.title}</h1>
    <p>{t.intro}</p>
    {state === 'loading' && <p role="status">{t.loading}</p>}
    {state === 'unauthorized' && <p>{t.signIn} <a href={`/reader/confirm?lang=${locale}`}>{t.signInLink}</a></p>}
    {state === 'error' && <p role="alert">{t.error} <button type="button" onClick={() => { setState('loading'); void load(); }}>{t.retry}</button></p>}
    {notice && <p role="status">{notice}</p>}
    {state === 'ready' && <form onSubmit={(event) => void claim(event)}>
      {comments.length === 0 && <p>{t.empty}</p>}
      <ul className="reader-claims__list">
        {comments.map((comment) => <li key={comment.id}>
          <label>
            <input type="checkbox" checked={selected.has(comment.id)} disabled={busy}
              onChange={(event) => setSelected((current) => {
                const next = new Set(current);
                if (event.target.checked) next.add(comment.id);
                else next.delete(comment.id);
                return next;
              })} />
            <span>{t.select}</span>
          </label>
          <p className="reader-claims__meta">{comment.authorName} · <time dateTime={comment.createdAt}>{new Date(comment.createdAt).toLocaleDateString(locale)}</time></p>
          <p className="reader-claims__body">{comment.body}</p>
        </li>)}
      </ul>
      {hasMore && <p>{t.more}</p>}
      {(hasMore || offset > 0) && <nav className="reader-claims__pages" aria-label={t.page}>
        <button type="button" disabled={busy || offset === 0} onClick={() => {
          setSelected(new Set()); setState('loading'); void load(Math.max(0, offset - 50));
        }}>{t.previous}</button>
        <span>{t.page} {offset / 50 + 1}</span>
        <button type="button" disabled={busy || !hasMore || offset >= 10_000} onClick={() => {
          setSelected(new Set()); setState('loading'); void load(offset + 50);
        }}>{t.next}</button>
      </nav>}
      {comments.length > 0 && <button className="reader-confirm__go" type="submit" disabled={busy || selected.size === 0}>
        {busy ? t.saving : `${t.submit} (${selected.size})`}
      </button>}
    </form>}
    <a className="reader-confirm__back" href={`/reader/confirm?lang=${locale}`}>{t.settings}</a>
  </section>;
}
