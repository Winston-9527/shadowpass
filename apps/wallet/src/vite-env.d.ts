/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_MAILBOX_URL?: string;
  readonly VITE_NETWORK?: string;
  readonly VITE_RPC_URL?: string;
  readonly VITE_FACILITATOR_URL?: string;
  readonly VITE_ARTIFACTS_URL?: string;
  readonly VITE_DEPLOYMENT_URL?: string;
  readonly VITE_FACILITATOR_URL?: string;
  readonly VITE_SHADOWPASS_ARTIFACTS?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
