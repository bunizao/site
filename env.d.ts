/// <reference types="astro/client" />
/// <reference types="node" />
/// <reference types="bun-types" />

declare global {
  namespace App {
    interface Locals {
      runtime?: {
        env?: Record<string, unknown>;
      };
      env?: Record<string, unknown>;
    }
  }

  interface Window {
    headerBtnAnimations?: {
      register: (button: HTMLElement) => void;
    };
  }
}

declare module 'prismjs-components-importer/cjs/*';

export {};
