interface VsCodeApiLike {
  postMessage(msg: unknown): void;
}

declare global {
  interface Window {
    acquireVsCodeApi?: () => VsCodeApiLike;
  }
}

const fallbackVsCodeApi: VsCodeApiLike = {
  postMessage(msg: unknown) {
    if (typeof window === 'undefined') {
      return;
    }

    window.dispatchEvent(
      new CustomEvent('pixel-agents:postmessage', {
        detail: msg,
      }),
    );
  },
};

export const vscode =
  typeof window !== 'undefined' && typeof window.acquireVsCodeApi === 'function'
    ? window.acquireVsCodeApi()
    : fallbackVsCodeApi;
