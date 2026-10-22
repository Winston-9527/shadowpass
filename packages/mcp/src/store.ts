import { randomBytes } from "node:crypto";
import { chmod, mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";
import { decodeBundle, encodeBundle, identityFromPrv } from "@shadowpass/sdk";
import type { CertificateBundle, Identity } from "@shadowpass/sdk";
import sodium from "libsodium-wrappers";
import { z } from "zod";
import type { AgentConfig, AgentSecrets, StoredReceipt } from "./types.js";

const scalar = z.string().regex(/^(0|[1-9][0-9]*)$/);
const AgentConfigSchema: z.ZodType<AgentConfig> = z.object({
  v: z.literal(1),
  name: z.string().min(1).max(64),
  createdAt: z.string(),
  network: z.string().min(1),
  deployment: z.string().min(1),
  holderPk: z.object({ x: scalar, y: scalar }),
  boxPk: z.string().regex(/^(0x)?[0-9a-fA-F]{64}$/),
  ownerBoxPk: z.string().regex(/^(0x)?[0-9a-fA-F]{64}$/).optional(),
  mailboxCursor: z.number().int().nonnegative(),
  lastCredentialError: z.string().optional(),
});

const AgentSecretsSchema: z.ZodType<AgentSecrets> = z.object({
  v: z.literal(1),
  holderPrv: z.string().regex(/^[0-9a-fA-F]{64}$/),
  boxSk: z.string().regex(/^[0-9a-fA-F]{64}$/),
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

function normalizeHex(value: string): string {
  return value.startsWith("0x") ? value.slice(2).toLowerCase() : value.toLowerCase();
}

async function readJson(file: string): Promise<unknown | undefined> {
  try {
    return JSON.parse(await readFile(file, "utf8")) as unknown;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
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
  private readonly secrets: AgentSecrets;

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
    const rawConfig = await readJson(configPath);
    const rawSecrets = await readJson(secretsPath);

    let config: AgentConfig;
    let secrets: AgentSecrets;
    if (rawConfig === undefined || rawSecrets === undefined) {
      if (rawConfig !== undefined || rawSecrets !== undefined) {
        throw new Error(`agent store is incomplete at ${directory}`);
      }
      const holderPrv = randomBytes(32);
      const boxSk = randomBytes(32);
      await sodium.ready;
      const holder = identityFromPrv(holderPrv);
      config = {
        v: 1,
        name: options.name,
        createdAt: new Date().toISOString(),
        network: options.network ?? "anvil",
        deployment: options.deployment ?? "anvil",
        holderPk: { x: holder.Ax.toString(), y: holder.Ay.toString() },
        boxPk: normalizeHex(Buffer.from(sodium.crypto_scalarmult_base(boxSk)).toString("hex")),
        mailboxCursor: 0,
      };
      secrets = {
        v: 1,
        holderPrv: holderPrv.toString("hex"),
        boxSk: boxSk.toString("hex"),
      };
      await writeJson(secretsPath, secrets);
      await writeJson(configPath, config);
    } else {
      config = AgentConfigSchema.parse(rawConfig);
      secrets = AgentSecretsSchema.parse(rawSecrets);
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
    return new AgentStore(directory, config, secrets, holder, boxPublicKey, Uint8Array.from(boxPrivateKey));
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

  get mailboxCursor(): number {
    return this.config.mailboxCursor;
  }

  get lastCredentialError(): string | undefined {
    return this.config.lastCredentialError;
  }

  async setMailboxCursor(cursor: number): Promise<void> {
    if (!Number.isSafeInteger(cursor) || cursor < 0) throw new Error("invalid mailbox cursor");
    this.config.mailboxCursor = Math.max(this.config.mailboxCursor, cursor);
    await writeJson(this.paths.config, this.config);
  }

  async setCredentialError(error: string | undefined): Promise<void> {
    this.config.lastCredentialError = error;
    await writeJson(this.paths.config, this.config);
  }

  async loadBundle(): Promise<CertificateBundle | undefined> {
    const value = await readJson(this.paths.credentials);
    return value === undefined ? undefined : decodeBundle(encodeBundle(value as CertificateBundle));
  }

  async saveBundle(bundle: CertificateBundle): Promise<void> {
    const validated = decodeBundle(encodeBundle(bundle));
    await writeJson(this.paths.credentials, validated);
    this.config.ownerBoxPk = normalizeHex(bundle.owner.box);
    await writeJson(this.paths.config, this.config);
    await this.addNote(validated.note);
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
}
