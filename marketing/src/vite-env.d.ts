/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Base URL of the Oguaa API. Empty means same-origin. */
  readonly VITE_API_URL?: string;
  /** Base URL of the client portal (the web app Cape Coasters use). */
  readonly VITE_PORTAL_URL?: string;
  /** App Store listing URL (iOS). */
  readonly VITE_IOS_URL?: string;
  /** Play Store listing URL (Android). */
  readonly VITE_ANDROID_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
