import { ChainState, MailboxClient } from "@shadowpass/sdk";
import type { BoxKeyPair } from "@shadowpass/sdk";
import { decodeCredentialValue, validateCredentialBundle } from "./credentials.js";
import type { AgentStore } from "./store.js";

export interface CredentialInboxResult {
  accepted: number;
  rejected: number;
  cursor: number;
  errors: string[];
}

export interface CredentialInboxOptions {
  mailbox: MailboxClient;
  store: AgentStore;
  state: ChainState | undefined;
  deploymentName: string;
  chainId: number;
  maxBatches?: number;
}

export class CredentialInbox {
  private readonly maxBatches: number;

  constructor(private readonly options: CredentialInboxOptions) {
    this.maxBatches = options.maxBatches ?? 10;
    if (this.maxBatches < 1) throw new Error("maxBatches must be positive");
  }

  async sync(): Promise<CredentialInboxResult> {
    const keyPair: BoxKeyPair = {
      privateKey: this.options.store.boxPrivateKey,
      publicKey: this.options.store.boxPublicKey,
    };
    let cursor = this.options.store.mailboxCursor;
    let accepted = 0;
    let rejected = 0;
    const errors: string[] = [];

    for (let batch = 0; batch < this.maxBatches; batch += 1) {
      const entries = await this.options.mailbox.poll(keyPair, cursor);
      if (entries.length === 0) break;
      for (const entry of entries) {
        cursor = Math.max(cursor, entry.id);
        if (!entry.decoded) {
          rejected += 1;
          if (entry.error) errors.push(`entry ${entry.id}: ${entry.error}`);
          continue;
        }
        let bundle;
        try {
          bundle = decodeCredentialValue(entry.value);
        } catch {
          // The mailbox is unauthenticated; unrelated messages are not credentials.
          continue;
        }
        const validation = validateCredentialBundle(bundle, {
          store: this.options.store,
          state: this.options.state,
          deploymentName: this.options.deploymentName,
          chainId: this.options.chainId,
        });
        if (!validation.valid) {
          rejected += 1;
          const error = validation.errors.join("; ");
          errors.push(`entry ${entry.id}: ${error}`);
          await this.options.store.setCredentialError(error);
          continue;
        }
        await this.options.store.saveBundle(bundle);
        await this.options.store.setCredentialError(undefined);
        accepted += 1;
      }
      await this.options.store.setMailboxCursor(cursor);
      if (entries.length < 200) break;
    }
    return { accepted, rejected, cursor, errors };
  }
}
