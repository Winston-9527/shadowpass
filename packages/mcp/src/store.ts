import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { chmod, lstat, mkdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";
import { decodeBundle, encodeBundle, identityFromPrv } from "@shadowpass/sdk";
import type { CertificateBundle, Identity } from "@shadowpass/sdk";
import sodium from "libsodium-wrappers";
import { z } from "zod";
import type { AgentConfig, AgentSecrets, StoredReceipt } from "./types.js";

const scalar = z.string().regex(/^(0|[1-9][0-9]*)$/);
const privateErrorCode = z.string().regex(/^[a-z][a-z0-9_]{0,63}$/);
const AgentConfigSchema: z.ZodType<AgentConfig> = z.object({
  v: z.literal(1),
  name: z.string().min(1).max(64),
  createdAt: z.string(),
  network: z.string().min(1),
  deployment: z.string().min(1),
  holderPk: z.object({ x: scalar, y: scalar }),
  boxPk: z.string().regex(/^(0x)?[0-9a-fA-F]{64}$/),
  ownerBoxPk: z.string().regex(/^(0x)?[0-9a-fA-F]{64}$/).optional(),
  pinnedRootHash: scalar.optional(),
  pairingHash: z.string().regex(/^[0-9a-f]{64}$/).optional(),
  acceptedCredentials: z.array(z.string().regex(/^[0-9a-f]{64}$/)).max(2_048).optional(),
  mailboxCursor: z.number().int().nonnegative(),
  lastCredentialError: privateErrorCode.optional(),
});

const AgentSecretsSchema: z.ZodType<AgentSecrets> = z.object({
  v: z.literal(1),
  holderPrv: z.string().regex(/^[0-9a-fA-F]{64}$/),
  boxSk: z.string().regex(/^[0-9a-fA-F]{64}$/),
  pair: z.string().regex(/^[0-9a-f]{32}$/).optional(),
});

const StoredNoteSchema = z.object({
  own: z.tuple([scalar, scalar]),
  q: scalar,
  lin: z.tuple([scalar, scalar, scalar, scalar]),
  rho: scalar,
});

const StoredReceiptSchema: z.ZodType<StoredReceipt> = z.object({
  budgetNf: scalar,
  tx: z.string(),
  resource: z.string(),
  amount: scalar,
  createdAt: z.string(),
  reported: z.boolean(),
});

export interface AgentStoreOptions {
  name: string;
  root?: string;
  network?: string;
  deployment?: string;
}

export class CredentialStoreError extends Error {
  constructor(readonly code: string) {
    super(code);
    this.name = "CredentialStoreError";
  }
}

function normalizeHex(value: string): string {
  return value.startsWith("0x") ? value.slice(2).toLowerCase() : value.toLowerCase();
}

export function credentialFingerprint(bundle: CertificateBundle): string {
  return createHash("sha256").update(encodeBundle(bundle)).digest("hex");
}

function pairingFingerprint(pair: string): string {
  return createHash("sha256").update(pair).digest("hex");
}

async function readJson(file: string): Promise<unknown | undefined> {
  try {
    return JSON.parse(await readFile(file, "utf8")) as unknown;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw error;
  }
}

async function ensurePrivateFile(file: string): Promise<boolean> {
  try {
    const info = await lstat(file);
    if (!info.isFile() || info.isSymbolicLink()) throw new Error(`private store path is not a regular file: ${path.basename(file)}`);
    if ((info.mode & 0o077) !== 0) await chmod(file, 0o600);
    const secured = await stat(file);
    if ((secured.mode & 0o077) !== 0) throw new Error(`private store file is not private: ${path.basename(file)}`);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
    throw error;
  }
}

async function writeJson(file: string, value: unknown): Promise<void> {
  const directory = path.dirname(file);
  await mkdir(directory, { recursive: true, mode: 0o700 });
  await chmod(directory, 0o700);
  const temporary = `${file}.${process.pid}.${randomBytes(6).toString("hex")}.tmp`;
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
  await chmod(temporary, 0o600);
  await rename(temporary, file);
  await chmod(file, 0o600);
}

async function configFromSecrets(options: AgentStoreOptions, secrets: AgentSecrets): Promise<AgentConfig> {
  await sodium.ready;
  const holder = identityFromPrv(Buffer.from(secrets.holderPrv, "hex"));
  const boxPublicKey = sodium.crypto_scalarmult_base(Buffer.from(secrets.boxSk, "hex"));
  return {
    v: 1,
    name: options.name,
    createdAt: new Date().toISOString(),
    network: options.network ?? "anvil",
    deployment: options.deployment ?? "anvil",
    holderPk: { x: holder.Ax.toString(), y: holder.Ay.toString() },
    boxPk: normalizeHex(Buffer.from(boxPublicKey).toString("hex")),
    mailboxCursor: 0,
  };
}

export class AgentStore {
  readonly holder: Identity;
  readonly boxPublicKey: Uint8Array;
  readonly boxPrivateKey: Uint8Array;
  readonly paths: {
    directory: string;
    config: string;
    secrets: string;
    credentials: string;
    notes: string;
    receipts: string;
  };

  private config: AgentConfig;
  private secrets: AgentSecrets;

  private constructor(
    directory: string,
    config: AgentConfig,
    secrets: AgentSecrets,
    holder: Identity,
    boxPublicKey: Uint8Array,
    boxPrivateKey: Uint8Array,
  ) {
    this.config = config;
    this.secrets = secrets;
    this.holder = holder;
    this.boxPublicKey = boxPublicKey;
    this.boxPrivateKey = boxPrivateKey;
    this.paths = {
      directory,
      config: path.join(directory, "agent.json"),
      secrets: path.join(directory, "secrets.json"),
      credentials: path.join(directory, "credentials.json"),
      notes: path.join(directory, "notes.json"),
      receipts: path.join(directory, "receipts.json"),
    };
  }

  static async open(options: AgentStoreOptions): Promise<AgentStore> {
    if (!/^[A-Za-z0-9._-]{1,64}$/.test(options.name)) {
      throw new Error("agent name must contain only letters, digits, dot, underscore or hyphen");
    }
    const root = options.root ?? process.env.SHADOWPASS_HOME ?? path.join(homedir(), ".shadowpass", "agents");
    const directory = path.join(root, options.name);
    await mkdir(directory, { recursive: true, mode: 0o700 });
    await chmod(directory, 0o700);

    const configPath = path.join(directory, "agent.json");
    const secretsPath = path.join(directory, "secrets.json");
    const [hasConfig, hasSecrets] = await Promise.all([
      ensurePrivateFile(configPath),
      ensurePrivateFile(secretsPath),
      ensurePrivateFile(path.join(directory, "credentials.json")),
      ensurePrivateFile(path.join(directory, "notes.json")),
      ensurePrivateFile(path.join(directory, "receipts.json")),
    ]);
    const [rawConfig, rawSecrets] = await Promise.all([readJson(configPath), readJson(secretsPath)]);

    let config: AgentConfig;
    let secrets: AgentSecrets;
    if (!hasConfig && !hasSecrets) {
      await sodium.ready;
      secrets = {
        v: 1,
        holderPrv: randomBytes(32).toString("hex"),
        boxSk: randomBytes(32).toString("hex"),
        pair: randomBytes(16).toString("hex"),
      };
      config = await configFromSecrets(options, secrets);
      await writeJson(secretsPath, secrets);
      await writeJson(configPath, config);
    } else if (!hasConfig && hasSecrets) {
      secrets = AgentSecretsSchema.parse(rawSecrets);
      if (!secrets.pair) {
        secrets.pair = randomBytes(16).toString("hex");
        await writeJson(secretsPath, secrets);
      }
      config = await configFromSecrets(options, secrets);
      await writeJson(configPath, config);
    } else if (hasConfig && !hasSecrets) {
      throw new Error("agent secrets are missing; restore secrets.json before starting this agent");
    } else {
      config = AgentConfigSchema.parse(rawConfig);
      secrets = AgentSecretsSchema.parse(rawSecrets);
      if (!secrets.pair) {
        secrets.pair = randomBytes(16).toString("hex");
        await writeJson(secretsPath, secrets);
      }
    }

    const holder = identityFromPrv(Buffer.from(secrets.holderPrv, "hex"));
    if (holder.Ax.toString() !== config.holderPk.x || holder.Ay.toString() !== config.holderPk.y) {
      throw new Error("agent holder key does not match agent.json");
    }
    await sodium.ready;
    const boxPrivateKey = Buffer.from(secrets.boxSk, "hex");
    const boxPublicKey = Uint8Array.from(sodium.crypto_scalarmult_base(boxPrivateKey));
    if (Buffer.from(boxPublicKey).toString("hex") !== normalizeHex(config.boxPk)) {
      throw new Error("agent mailbox key does not match agent.json");
    }
    const store = new AgentStore(directory, config, secrets, holder, boxPublicKey, Uint8Array.from(boxPrivateKey));
    await store.reconcileCredentialMetadata();
    return store;
  }

  get name(): string {
    return this.config.name;
  }

  get network(): string {
    return this.config.network;
  }

  get deployment(): string {
    return this.config.deployment;
  }

  get ownerBoxPk(): string | undefined {
    return this.config.ownerBoxPk;
  }

  get pinnedRootHash(): string | undefined {
    return this.config.pinnedRootHash;
  }

  get acceptedCredentials(): string[] {
    return [...(this.config.acceptedCredentials ?? [])];
  }

  get pairingSecret(): string {
    return this.secrets.pair!;
  }

  get mailboxCursor(): number {
    return this.config.mailboxCursor;
  }

  get lastCredentialError(): string | undefined {
    return this.config.lastCredentialError;
  }

  matchesPairingSecret(candidate: string | undefined): boolean {
    if (!candidate || !/^[0-9a-f]{32}$/.test(candidate)) return false;
    return timingSafeEqual(Buffer.from(candidate, "hex"), Buffer.from(this.pairingSecret, "hex"));
  }

  credentialOwnership(bundle: CertificateBundle): "unpaired" | "trusted" | "untrusted" {
    if (!this.config.pinnedRootHash || !this.config.ownerBoxPk || this.config.pairingHash !== pairingFingerprint(this.pairingSecret)) {
      return "unpaired";
    }
    const rootMatches = bundle.chain[0]?.hash === this.config.pinnedRootHash;
    const ownerMatches = normalizeHex(bundle.owner.box) === normalizeHex(this.config.ownerBoxPk);
    return rootMatches && ownerMatches ? "trusted" : "untrusted";
  }

  async setMailboxCursor(cursor: number): Promise<void> {
    if (!Number.isSafeInteger(cursor) || cursor < 0) throw new Error("invalid mailbox cursor");
    this.config.mailboxCursor = Math.max(this.config.mailboxCursor, cursor);
    await writeJson(this.paths.config, this.config);
  }

  async setCredentialError(error: string | undefined): Promise<void> {
    if (error !== undefined && !privateErrorCode.safeParse(error).success) throw new Error("invalid credential error code");
    this.config.lastCredentialError = error;
    await writeJson(this.paths.config, this.config);
  }

  async loadBundle(): Promise<CertificateBundle | undefined> {
    const value = await readJson(this.paths.credentials);
    return value === undefined ? undefined : decodeBundle(encodeBundle(value as CertificateBundle));
  }

  async saveBundle(bundle: CertificateBundle, options: { pair?: string } = {}): Promise<void> {
    const validated = decodeBundle(encodeBundle(bundle));
    const first = validated.chain[0];
    if (!first) throw new CredentialStoreError("empty_chain");
    const ownership = this.credentialOwnership(validated);
    if (ownership === "unpaired" && !this.matchesPairingSecret(options.pair)) {
      throw new CredentialStoreError("pair_mismatch");
    }
    if (ownership === "untrusted") throw new CredentialStoreError("owner_mismatch");

    const fingerprint = credentialFingerprint(validated);
    const current = await this.loadBundle();
    if (current && credentialFingerprint(current) === fingerprint) throw new CredentialStoreError("credential_replay");
    if (this.config.acceptedCredentials?.includes(fingerprint)) throw new CredentialStoreError("credential_replay");

    await writeJson(this.paths.credentials, validated);
    this.config.pinnedRootHash = first.hash;
    this.config.pairingHash = pairingFingerprint(this.pairingSecret);
    this.config.ownerBoxPk = normalizeHex(validated.owner.box);
    const accepted = [...(this.config.acceptedCredentials ?? []), fingerprint];
    this.config.acceptedCredentials = accepted.slice(-2_048);
    this.config.lastCredentialError = undefined;
    await writeJson(this.paths.config, this.config);
    await this.addNote(validated.note);
  }

  async rotatePairing(): Promise<void> {
    this.secrets = { ...this.secrets, pair: randomBytes(16).toString("hex") };
    await writeJson(this.paths.secrets, this.secrets);
    await rm(this.paths.credentials, { force: true });
    this.config.pinnedRootHash = undefined;
    this.config.pairingHash = undefined;
    this.config.ownerBoxPk = undefined;
    this.config.acceptedCredentials = undefined;
    this.config.lastCredentialError = undefined;
    await writeJson(this.paths.config, this.config);
  }

  async notes(): Promise<Array<CertificateBundle["note"]>> {
    const raw = await readJson(this.paths.notes);
    return raw === undefined ? [] : z.array(StoredNoteSchema).parse(raw) as Array<CertificateBundle["note"]>;
  }

  async addNote(note: CertificateBundle["note"]): Promise<void> {
    const notes = await this.notes();
    const key = `${note.own[0]}:${note.own[1]}:${note.q}:${note.lin.join(":")}:${note.rho}`;
    if (!notes.some((candidate) => `${candidate.own[0]}:${candidate.own[1]}:${candidate.q}:${candidate.lin.join(":")}:${candidate.rho}` === key)) {
      notes.push(note);
      await writeJson(this.paths.notes, notes);
    }
  }

  async receipts(): Promise<StoredReceipt[]> {
    const raw = await readJson(this.paths.receipts);
    return raw === undefined ? [] : z.array(StoredReceiptSchema).parse(raw);
  }

  async addReceipt(receipt: StoredReceipt): Promise<void> {
    const receipts = await this.receipts();
    const existing = receipts.findIndex((candidate) => candidate.budgetNf === receipt.budgetNf && candidate.tx === receipt.tx);
    if (existing >= 0) receipts[existing] = receipt;
    else receipts.push(receipt);
    await writeJson(this.paths.receipts, receipts);
  }

  private async reconcileCredentialMetadata(): Promise<void> {
    const bundle = await this.loadBundle();
    const currentPairingHash = pairingFingerprint(this.pairingSecret);
    if (this.config.pairingHash && this.config.pairingHash !== currentPairingHash) {
      this.config.pinnedRootHash = undefined;
      this.config.pairingHash = undefined;
      this.config.ownerBoxPk = undefined;
      this.config.acceptedCredentials = undefined;
      this.config.lastCredentialError = undefined;
      await writeJson(this.paths.config, this.config);
      await rm(this.paths.credentials, { force: true });
      return;
    }
    if (!bundle) {
      if ((this.config.pinnedRootHash || this.config.ownerBoxPk) && !this.config.pairingHash) {
        this.config.pairingHash = currentPairingHash;
        await writeJson(this.paths.config, this.config);
      }
      return;
    }
    const first = bundle.chain[0];
    if (!first) throw new Error("stored credential has an empty chain");
    if (this.config.pinnedRootHash && this.config.pinnedRootHash !== first.hash) {
      throw new Error("stored credential does not match the pinned owner root");
    }
    if (this.config.ownerBoxPk && normalizeHex(this.config.ownerBoxPk) !== normalizeHex(bundle.owner.box)) {
      throw new Error("stored credential does not match the pinned owner mailbox");
    }
    const fingerprint = credentialFingerprint(bundle);
    const accepted = [...(this.config.acceptedCredentials ?? [])];
    let changed = false;
    if (this.config.pinnedRootHash !== first.hash) {
      this.config.pinnedRootHash = first.hash;
      changed = true;
    }
    if (this.config.pairingHash !== currentPairingHash) {
      this.config.pairingHash = currentPairingHash;
      changed = true;
    }
    if (normalizeHex(this.config.ownerBoxPk ?? "") !== normalizeHex(bundle.owner.box)) {
      this.config.ownerBoxPk = normalizeHex(bundle.owner.box);
      changed = true;
    }
    if (!accepted.includes(fingerprint)) {
      this.config.acceptedCredentials = [...accepted, fingerprint].slice(-2_048);
      changed = true;
    }
    if (changed) await writeJson(this.paths.config, this.config);
  }
}
