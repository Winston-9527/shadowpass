/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_MAILBOX_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
