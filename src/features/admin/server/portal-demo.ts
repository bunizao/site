import type { PortalOverview } from './portal-client';

// Local-dev fixture. When the site-api service binding is unavailable (running
// `bun dev` without `bun dev:api`), the overview would otherwise render all
// zeros and a red error banner — useless for design work. The page swaps in
// this fixture behind `import.meta.env.DEV`, so it never reaches production.
const now = Date.now();
const minsAgo = (m: number): string => new Date(now - m * 60_000).toISOString();
const hoursAgo = (h: number): string => new Date(now - h * 3_600_000).toISOString();

export const DEMO_OVERVIEW: PortalOverview = {
  subscriberStats: {
    total: 1284,
    activeCount: 1147,
    pendingCount: 38,
    unsubscribedCount: 99,
  },
  auditEvents: [
    { id: 812, eventType: 'subscription_confirmed', email: 'lena.ortiz@fastmail.com', emailHash: 'd1', source: 'web', createdAt: minsAgo(4) },
    { id: 811, eventType: 'subscribe_requested', email: 'devon@hey.com', emailHash: 'd2', source: 'web', createdAt: minsAgo(21) },
    { id: 810, eventType: 'broadcast_sent', email: 'system', emailHash: 'd3', source: 'admin', createdAt: minsAgo(55) },
    { id: 809, eventType: 'unsubscribed', email: 'm.tanaka@gmail.com', emailHash: 'd4', source: 'link', createdAt: hoursAgo(3) },
    { id: 808, eventType: 'admin_update', email: 'priya@outlook.com', emailHash: 'd5', source: 'admin', createdAt: hoursAgo(6) },
    { id: 807, eventType: 'subscription_confirmed', email: 'noah.kim@proton.me', emailHash: 'd6', source: 'web', createdAt: hoursAgo(9) },
  ],
  broadcasts: [
    { id: 'bc_0f2a', subject: 'July dispatch — new writing and a mood recap', bodyHtml: '', bodyText: null, audience: { status: 'active', channels: ['announcement'] }, recipientCount: 1147, sentCount: 1147, failedCount: 0, status: 'sent', createdAt: hoursAgo(1), sentAt: minsAgo(55), sentBy: 'admin' },
    { id: 'bc_0e91', subject: 'A quiet note about what I shipped this month', bodyHtml: '', bodyText: null, audience: { status: 'active', channels: ['blog'] }, recipientCount: 1103, sentCount: 1098, failedCount: 5, status: 'sent', createdAt: hoursAgo(74), sentAt: hoursAgo(72), sentBy: 'admin' },
    { id: 'bc_0d77', subject: 'Privacy policy update', bodyHtml: '', bodyText: null, audience: { status: 'active', channels: ['privacy'] }, recipientCount: 1284, sentCount: 1284, failedCount: 0, status: 'sent', createdAt: hoursAgo(220), sentAt: hoursAgo(218), sentBy: 'admin' },
  ],
};
