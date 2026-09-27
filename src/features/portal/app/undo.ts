import { toastManager } from '@/components/coss/toast';

/* The most recent undoable action, so `z` can do what the toast's Undo
   button does without reaching for the mouse. */

let last: { toastId: string; run: () => void } | null = null;

export function registerUndo(toastId: string, run: () => void): void {
  last = { toastId, run };
}

export function forgetUndo(toastId: string): void {
  if (last?.toastId === toastId) last = null;
}

export function undoLast(): void {
  if (!last) {
    toastManager.add({ title: 'Nothing to undo', timeout: 1500 });
    return;
  }
  const { toastId, run } = last;
  last = null;
  run();
  toastManager.close(toastId);
}
