export interface MailboxEnvelope {
  id: number;
  ct: string;
  ts: number;
}

export interface RateLimitResult {
  allowed: boolean;
  retryAfterMs: number;
}

export interface MailboxStore {
  append(recipient: string, ct: string, ts: number): Promise<number>;
  list(recipient: string, after: number, limit: number): Promise<MailboxEnvelope[]>;
  appendSlot(slot: string, ct: string, ts: number): Promise<number | null>;
  listSlot(slot: string, after: number, limit: number): Promise<MailboxEnvelope[]>;
  hitRateLimit(bucket: string, limit: number, windowMs: number, now: number): Promise<RateLimitResult>;
  close?(): void;
}
