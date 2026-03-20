export type OfficeGuestAuthStatus = 'pending' | 'approved' | 'rejected' | 'offline';

export interface OfficeGuestAuthRecord {
  agentId: string;
  name: string;
  joinKey: string;
  authStatus: OfficeGuestAuthStatus;
  requestedAt: string;
  approvedAt: string | null;
  rejectedAt: string | null;
  expiresAt: string | null;
  authExpiresAt: string | null;
  lastPushAt: string | null;
  updatedAt: string;
}

export interface OfficeGuestAuthConfig {
  pendingTtlMs: number;
  approvedTtlMs: number;
  offlineAfterMs: number;
}

type OfficeGuestAuthRoomState = Map<string, OfficeGuestAuthRecord>;

declare global {
  var __officeGuestAuthState: Map<string, OfficeGuestAuthRoomState> | undefined;
}

function getState(): Map<string, OfficeGuestAuthRoomState> {
  if (!globalThis.__officeGuestAuthState) {
    globalThis.__officeGuestAuthState = new Map();
  }

  return globalThis.__officeGuestAuthState;
}

function getRoomState(roomId: string): OfficeGuestAuthRoomState {
  const state = getState();
  const existing = state.get(roomId);
  if (existing) {
    return existing;
  }

  const created = new Map<string, OfficeGuestAuthRecord>();
  state.set(roomId, created);
  return created;
}

function isoFromNow(ms: number): string {
  return new Date(Date.now() + ms).toISOString();
}

function withUpdatedAt(record: OfficeGuestAuthRecord, patch: Partial<OfficeGuestAuthRecord>): OfficeGuestAuthRecord {
  return {
    ...record,
    ...patch,
    updatedAt: new Date().toISOString(),
  };
}

export function getOfficeGuestAuthRecord(roomId: string, agentId: string): OfficeGuestAuthRecord | null {
  return getRoomState(roomId).get(agentId) || null;
}

export function listOfficeGuestAuthRecords(roomId: string): OfficeGuestAuthRecord[] {
  return [...getRoomState(roomId).values()];
}

export function upsertPendingOfficeGuestAuth(
  roomId: string,
  input: {
    agentId: string;
    name: string;
    joinKey: string;
  },
  config: OfficeGuestAuthConfig,
): OfficeGuestAuthRecord {
  const roomState = getRoomState(roomId);
  const existing = roomState.get(input.agentId);

  const next: OfficeGuestAuthRecord = existing
    ? withUpdatedAt(existing, {
        name: input.name,
        joinKey: input.joinKey,
        authStatus: 'pending',
        rejectedAt: null,
        approvedAt: null,
        expiresAt: isoFromNow(config.pendingTtlMs),
        authExpiresAt: null,
      })
    : {
        agentId: input.agentId,
        name: input.name,
        joinKey: input.joinKey,
        authStatus: 'pending',
        requestedAt: new Date().toISOString(),
        approvedAt: null,
        rejectedAt: null,
        expiresAt: isoFromNow(config.pendingTtlMs),
        authExpiresAt: null,
        lastPushAt: null,
        updatedAt: new Date().toISOString(),
      };

  roomState.set(input.agentId, next);
  return next;
}

export function approveOfficeGuestAuth(
  roomId: string,
  agentId: string,
  config: OfficeGuestAuthConfig,
): OfficeGuestAuthRecord | null {
  const roomState = getRoomState(roomId);
  const existing = roomState.get(agentId);
  if (!existing) {
    return null;
  }

  const approvedAt = new Date().toISOString();
  const next = withUpdatedAt(existing, {
    authStatus: 'approved',
    approvedAt,
    rejectedAt: null,
    expiresAt: null,
    authExpiresAt: isoFromNow(config.approvedTtlMs),
  });
  roomState.set(agentId, next);
  return next;
}

export function rejectOfficeGuestAuth(roomId: string, agentId: string): OfficeGuestAuthRecord | null {
  const roomState = getRoomState(roomId);
  const existing = roomState.get(agentId);
  if (!existing) {
    return null;
  }

  const next = withUpdatedAt(existing, {
    authStatus: 'rejected',
    rejectedAt: new Date().toISOString(),
    expiresAt: null,
    authExpiresAt: null,
  });
  roomState.set(agentId, next);
  return next;
}

export function removeOfficeGuestAuth(roomId: string, agentId: string): void {
  getRoomState(roomId).delete(agentId);
}

export function markOfficeGuestPush(
  roomId: string,
  agentId: string,
  config: OfficeGuestAuthConfig,
): OfficeGuestAuthRecord | null {
  const roomState = getRoomState(roomId);
  const existing = roomState.get(agentId);
  if (!existing) {
    return null;
  }

  const pushedAt = new Date().toISOString();
  const next = withUpdatedAt(existing, {
    authStatus: 'approved',
    lastPushAt: pushedAt,
    authExpiresAt: isoFromNow(config.approvedTtlMs),
  });
  roomState.set(agentId, next);
  return next;
}

export function resolveOfficeGuestAuth(
  record: OfficeGuestAuthRecord | null,
  config: OfficeGuestAuthConfig,
  now = Date.now(),
): OfficeGuestAuthRecord | null {
  if (!record) {
    return null;
  }

  let next = record;
  const expiresAt = record.expiresAt ? new Date(record.expiresAt).getTime() : 0;
  const authExpiresAt = record.authExpiresAt ? new Date(record.authExpiresAt).getTime() : 0;
  const lastPushAt = record.lastPushAt ? new Date(record.lastPushAt).getTime() : 0;

  if (record.authStatus === 'pending' && expiresAt && expiresAt <= now) {
    next = withUpdatedAt(record, {
      authStatus: 'rejected',
      rejectedAt: record.rejectedAt || new Date(now).toISOString(),
      expiresAt: null,
    });
  } else if (record.authStatus === 'approved') {
    if ((authExpiresAt && authExpiresAt <= now) || (lastPushAt && now - lastPushAt > config.offlineAfterMs)) {
      next = withUpdatedAt(record, {
        authStatus: 'offline',
      });
    }
  } else if (record.authStatus === 'offline') {
    if (authExpiresAt && authExpiresAt <= now) {
      next = withUpdatedAt(record, {
        authStatus: 'rejected',
        rejectedAt: record.rejectedAt || new Date(now).toISOString(),
        authExpiresAt: null,
      });
    }
  }

  if (next !== record) {
    getRoomState('__placeholder__');
  }

  return next;
}

export function syncOfficeGuestAuthRecord(
  roomId: string,
  record: OfficeGuestAuthRecord | null,
  config: OfficeGuestAuthConfig,
  now = Date.now(),
): OfficeGuestAuthRecord | null {
  const resolved = resolveOfficeGuestAuth(record, config, now);
  if (!resolved) {
    return null;
  }

  getRoomState(roomId).set(resolved.agentId, resolved);
  return resolved;
}

export function resetOfficeGuestAuthState(): void {
  globalThis.__officeGuestAuthState = new Map();
}
