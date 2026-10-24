/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_MAILBOX_URL?: string;
  readonly VITE_FACILITATOR_URL?: string;
  readonly VITE_SHADOWPASS_ARTIFACTS?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
