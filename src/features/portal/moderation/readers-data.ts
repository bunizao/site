import * as React from 'react';
import { queryOptions, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import type { AdminBannedReader, AdminBannedReaderListResult, AdminReaderRestoreResult } from '@bunizao/contracts';
import { toastManager } from '@/components/coss/toast';
import { ApiError, apiGet, apiSend, describeError } from '../app/api';
import { shareRowsById } from '../app/share-rows';

/* Readers a ban signed out for good, and the one-way restore. Keyed under
   `['bans']`, so a ban that revokes a reader (BanDialog invalidates that
   prefix) refreshes this list too. Nothing can revoke a reader again on
   its own, so a restore has no undo; the screen asks first. */

export const readerKeys = {
  revoked: ['bans', 'readers', 'revoked'] as const,
};

const revokedOptions = queryOptions({
  queryKey: readerKeys.revoked,
  queryFn: ({ signal }) => apiGet<AdminBannedReaderListResult>('admin/readers/revoked', undefined, signal),
  select: (data) => data.readers,
  structuralSharing: shareRowsById<AdminBannedReader>('readers', (reader) => reader.readerId),
});

export function useRevokedReaders() {
  return useQuery(revokedOptions);
}

/** Warms the list; a cached one is enough. A backend without the route is
    the screen's to explain, so the warm-up never rejects. */
export function prefetchRevokedReaders(client: QueryClient): Promise<unknown> {
  return client.query({ ...revokedOptions, staleTime: 'static' }).catch(() => null);
}

/** Restores one reader. The row is marked the moment it is confirmed; a
    failure unmarks it. A 409 means it was already restored elsewhere,
    which is the outcome asked for. */
export function useRestoreReader(mark: (readerId: string, restored: boolean) => void) {
  const client = useQueryClient();
  return React.useCallback(
    async (reader: AdminBannedReader): Promise<void> => {
      const name = reader.displayName ?? reader.email;
      mark(reader.readerId, true);
      try {
        await apiSend<AdminReaderRestoreResult>('POST', `admin/readers/${encodeURIComponent(reader.readerId)}/restore`);
        toastManager.add({ type: 'success', title: `Restored ${name}`, description: 'They are signed in again on their next visit.', timeout: 4000 });
      } catch (error) {
        if (error instanceof ApiError && error.status === 409) {
          toastManager.add({ title: `${name} was already restored`, description: 'Probably from another tab. Nothing else changed.', timeout: 4000 });
          return;
        }
        mark(reader.readerId, false);
        toastManager.add({ type: 'error', title: `${name} was not restored`, description: describeError(error) });
      } finally {
        // The row stays on screen as restored; the next visit reads the list fresh.
        void client.invalidateQueries({ queryKey: readerKeys.revoked, refetchType: 'none' });
      }
    },
    [client, mark],
  );
}
