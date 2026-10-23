/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_MAILBOX_URL?: string;
  readonly VITE_NETWORK?: string;
  readonly VITE_RPC_URL?: string;
  readonly VITE_FACILITATOR_URL?: string;
  readonly VITE_ARTIFACTS_URL?: string;
  readonly VITE_DEPLOYMENT_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
