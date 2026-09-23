import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/coss';
import type { AdminCommentQuality } from '@bunizao/contracts';

function share(value: number | null, denominator: number): string {
  return value === null || denominator === 0 ? 'No denominator' : `${(value * 100).toFixed(1)}%`;
}

export default function CommentQuality({ quality }: { quality?: AdminCommentQuality }) {
  if (!quality) return <p className="portal-list-meta">Quality measurements are not available yet.</p>;
  const { moderation, requests, clientReports, available } = quality;
  return <div className="portal-grid" data-columns="wide">
    <Card><CardHeader>
      <CardTitle className="portal-card-title">Held comments later approved</CardTitle>
      <CardDescription>The first owner decision on automatically held comments. Approval is a review outcome, not proof that the original decision was an error.</CardDescription>
    </CardHeader><CardContent>
      {available.moderation ? <ul className="portal-spread">
        <li><span>Approved after review</span><strong>{moderation.released} / {moderation.reviewed} reviewed</strong></li>
        <li><span>Share of reviewed comments</span><strong>{share(moderation.releasedShare, moderation.reviewed)}</strong></li>
        <li><span>Automatically held in this cohort</span><strong>{moderation.held}</strong></li>
      </ul> : <p>Moderation outcomes have not been collected.</p>}
    </CardContent></Card>
    <Card><CardHeader>
      <CardTitle className="portal-card-title">Submission outcomes</CardTitle>
      <CardDescription>Server-observed requests, including retries. A signed-in account is not necessarily a legitimate request.</CardDescription>
    </CardHeader><CardContent>
      {available.requests ? <>
        <ul className="portal-spread">
          <li><span>Failed requests</span><strong>{requests.failures} / {requests.attempts} attempts</strong></li>
          <li><span>Failure share</span><strong>{share(requests.failureShare, requests.attempts)}</strong></li>
          <li><span>Authenticated failures</span><strong>{requests.authenticatedFailures} / {requests.authenticatedAttempts} attempts</strong></li>
          <li><span>Authenticated failure share</span><strong>{share(requests.authenticatedFailureShare, requests.authenticatedAttempts)}</strong></li>
        </ul>
        {requests.outcomes.length > 0 && <details><summary>Request outcomes</summary><ul className="portal-spread">
          {requests.outcomes.map((row) => <li key={`${row.kind}:${row.outcome}`}><span>{row.kind} · {row.outcome}</span><strong>{row.count}</strong></li>)}
        </ul></details>}
      </> : <p>Request outcomes have not been collected.</p>}
    </CardContent></Card>
    <Card><CardHeader>
      <CardTitle className="portal-card-title">Browser-reported friction</CardTitle>
      <CardDescription>Incomplete, unverified reports. Network failures can prevent reports from arriving; these counts are not identity evidence.</CardDescription>
    </CardHeader><CardContent>
      {available.clientReports ? <ul className="portal-spread">
        <li><span>Failure reports</span><strong>{clientReports.failures} / {clientReports.reports} reports</strong></li>
        <li><span>Network failure reports</span><strong>{clientReports.networkFailures} / {clientReports.reports} reports</strong></li>
        <li><span>Challenged attempts</span><strong>{clientReports.challengedAttempts} / {clientReports.reports} reports</strong></li>
        <li><span>Repeated challenges</span><strong>{clientReports.repeatedChallenges} / {clientReports.challengedAttempts} challenged attempts</strong></li>
      </ul> : <p>Browser reports have not been collected.</p>}
    </CardContent></Card>
    <p className="portal-list-meta portal-span-full">Window starts {new Date(quality.since).toLocaleDateString()}.
      {' '}{quality.collectedSince ? `Collection started ${new Date(quality.collectedSince).toLocaleDateString()}.` : 'The collection start time is not available.'}
      {' '}Counts describe recorded activity, not all visitors.
    </p>
  </div>;
}
