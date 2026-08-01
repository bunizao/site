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
}

declare module 'prismjs-components-importer/cjs/*';
declare module '*.md?raw' {
  const content: string;
  export default content;
}

export {};
