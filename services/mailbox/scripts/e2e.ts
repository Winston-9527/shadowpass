import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  MailboxClient,
} from "@shadowpass/sdk/mailbox";
import sodium from "libsodium-wrappers";

async function freePort(): Promise<number> {
  return await new Promise((resolve, reject) => {
    const server = createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port = typeof address === "object" && address !== null ? address.port : 0;
      server.close(() => resolve(port));
    });
  });
}

async function waitForHealth(baseUrl: string): Promise<void> {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    try {
      if ((await fetch(`${baseUrl}/health`)).ok) return;
    } catch {
      // The server process is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error("mailbox server did not become ready");
}

const dir = await mkdtemp(join(tmpdir(), "shadowpass-mailbox-"));
const database = join(dir, "mailbox.sqlite");
const port = await freePort();
const baseUrl = `http://127.0.0.1:${port}`;
const serviceDir = new URL("..", import.meta.url).pathname;
const tsx = new URL("../../../node_modules/.bin/tsx", import.meta.url).pathname;
const child = spawn(tsx, ["src/main.ts"], {
  cwd: serviceDir,
  env: {
    ...process.env,
    MAILBOX_DB_PATH: database,
    MAILBOX_PORT: String(port),
    MAILBOX_HOST: "127.0.0.1",
    MAILBOX_RATE_LIMIT_POST: "5",
    MAILBOX_LOG_REQUESTS: "1",
  },
  stdio: ["ignore", "pipe", "pipe"],
});
let stdout = "";
let stderr = "";
child.stdout.on("data", (chunk) => {
  stdout += String(chunk);
});
child.stderr.on("data", (chunk) => {
  stderr += String(chunk);
});

try {
  await waitForHealth(baseUrl);
  await sodium.ready;
  const generated = sodium.crypto_box_keypair();
  const pair = {
    publicKey: Uint8Array.from(generated.publicKey),
    privateKey: Uint8Array.from(generated.privateKey),
  };
  const recipient = Buffer.from(pair.publicKey).toString("hex");
  const client = new MailboxClient(baseUrl);
  const secret = "credential-plaintext-must-not-hit-disk";
  const first = await client.send(pair.publicKey, `${secret}-1`);
  await fetch(`${baseUrl}/box/${recipient}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ ct: Buffer.alloc(64).toString("base64") }),
  }).then((response) => {
    if (response.status !== 201) throw new Error(`expected garbage insert 201, got ${response.status}`);
  });
  const second = await client.send(pair.publicKey, `${secret}-2`);
  const slot = "12".repeat(32);
  const envelope = Buffer.alloc(81);
  envelope.write("SPW1", "ascii");
  envelope[4] = 0;
  for (let index = 0; index < 2; index += 1) {
    const response = await fetch(`${baseUrl}/slot/${slot}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ct: envelope.toString("base64") }),
    });
    if (response.status !== 201) throw new Error(`slot insert failed with ${response.status}`);
  }
  const slots = await fetch(`${baseUrl}/slot/${slot}?after=0`).then((response) => response.json());
  if (!Array.isArray(slots) || slots.length !== 2) throw new Error("slot read failed");
  await fetch(`${baseUrl}/box/${recipient}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ ct: "a".repeat(64) }),
  }).then((response) => {
    if (response.status !== 429) throw new Error(`expected 429, got ${response.status}`);
  });

  const messages = await client.poll(pair, 0);
  if (messages.length !== 3) throw new Error(`expected 3 messages, got ${messages.length}`);
  if (messages[1]?.decoded !== false) throw new Error("garbage ciphertext should be retained but undecoded");
  const decoded = messages.filter((message) => message.decoded).map((message) => String(message.value));
  if (!decoded.includes(`${secret}-1`) || !decoded.includes(`${secret}-2`)) {
    throw new Error("decrypted messages did not round-trip");
  }
  const after = await client.poll(pair, first);
  if (after.length !== 2 || after[0]?.id !== first + 1 || after[1]?.id !== second) {
    throw new Error("incremental polling failed");
  }

  const files = (await readdir(dir)).filter((name) => name.startsWith("mailbox.sqlite"));
  const disk = Buffer.concat(await Promise.all(files.map((name) => readFile(join(dir, name)))));
  if (disk.includes(secret)) throw new Error("plaintext was written to SQLite");
  if ((stdout + stderr).includes(secret)) throw new Error("plaintext appeared in service logs");
  console.log(JSON.stringify({
    ok: true,
    storage: "sqlite",
    messages: messages.length,
    incremental: after.length,
    rate_limit_status: 429,
    slot_entries: slots.length,
    plaintext_on_disk: false,
    plaintext_in_logs: false,
  }, null, 2));
} finally {
  child.kill("SIGTERM");
  await new Promise<void>((resolve) => child.once("exit", () => resolve()));
  await rm(dir, { recursive: true, force: true });
}
