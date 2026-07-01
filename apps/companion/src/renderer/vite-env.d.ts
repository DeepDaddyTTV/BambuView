/// <reference types="vite/client" />

import type { CompanionDesktopApi } from "@common/electron-api";

declare global {
  interface Window {
    companion: CompanionDesktopApi;
  }
}

export {};
