import { ChainState, MailboxClient } from "@shadowpass/sdk";
import type { BoxKeyPair } from "@shadowpass/sdk";
import { decodeCredentialValue, isRetryableCredentialError, validateCredentialBundle } from "./credentials.js";
import { AgentStore, CredentialStoreError } from "./store.js";

export interface CredentialInboxResult {
  accepted: number;
  rejected: number;
  cursor: number;
  errors: string[];
  deferred: boolean;
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
    const startingCursor = this.options.store.mailboxCursor;
    if (!this.options.state) {
      return { accepted: 0, rejected: 0, cursor: startingCursor, errors: [], deferred: true };
    }
    const keyPair: BoxKeyPair = {
      privateKey: this.options.store.boxPrivateKey,
      publicKey: this.options.store.boxPublicKey,
    };
    let cursor = startingCursor;
    let persistedCursor = startingCursor;
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
          persistedCursor = cursor;
          continue;
        }

        let envelope;
        try {
          envelope = decodeCredentialValue(entry.value);
        } catch {
          // The mailbox is unauthenticated; unrelated messages are not credentials.
          persistedCursor = cursor;
          continue;
        }

        const ownership = this.options.store.credentialOwnership(envelope.bundle);
        if (ownership === "untrusted") {
          rejected += 1;
          persistedCursor = cursor;
          continue;
        }
        if (ownership === "unpaired" && !this.options.store.matchesPairingSecret(envelope.pair)) {
          rejected += 1;
          persistedCursor = cursor;
          continue;
        }

        const validation = validateCredentialBundle(envelope.bundle, {
          store: this.options.store,
          state: this.options.state,
          deploymentName: this.options.deploymentName,
          chainId: this.options.chainId,
        });
        if (!validation.valid) {
          rejected += 1;
          const code = validation.errors[0] ?? "invalid_credential";
          errors.push(code);
          await this.options.store.setCredentialError(code);
          if (validation.errors.every(isRetryableCredentialError)) {
            await this.options.store.setMailboxCursor(persistedCursor);
            return { accepted, rejected, cursor: persistedCursor, errors, deferred: true };
          }
          persistedCursor = cursor;
          continue;
        }

        try {
          await this.options.store.saveBundle(envelope.bundle, { pair: envelope.pair });
        } catch (error) {
          if (!(error instanceof CredentialStoreError)) throw error;
          rejected += 1;
          errors.push(error.code);
          await this.options.store.setCredentialError(error.code);
          persistedCursor = cursor;
          continue;
        }
        await this.options.store.setCredentialError(undefined);
        accepted += 1;
        persistedCursor = cursor;
      }
      await this.options.store.setMailboxCursor(persistedCursor);
      if (entries.length < 200) break;
    }
    return { accepted, rejected, cursor: persistedCursor, errors, deferred: false };
  }
}
