import {
  MailboxClient,
} from "@shadowpass/sdk/mailbox";
import sodium from "libsodium-wrappers";
import { randomBytes } from "node:crypto";

const baseUrl = process.env.MAILBOX_E2E_BASE_URL;
if (!baseUrl) throw new Error("MAILBOX_E2E_BASE_URL is required");

await sodium.ready;
const generated = sodium.crypto_box_keypair();
const pair = {
  publicKey: Uint8Array.from(generated.publicKey),
  privateKey: Uint8Array.from(generated.privateKey),
};
const client = new MailboxClient(baseUrl);
const secret = `online-mailbox-e2e-${Date.now()}`;
const sent = await client.send(pair.publicKey, secret);
const messages = await client.poll(pair, sent - 1);
const received = messages.find((message) => message.id === sent);
if (received === undefined) throw new Error("online mailbox did not return the new message");
if (String(received.value) !== secret) {
  throw new Error("online mailbox payload did not round-trip");
}

const slot = randomBytes(32).toString("hex");
const envelope = Buffer.alloc(81);
envelope.write("SPW1", "ascii");
envelope[4] = 0;
const slotWrite = await fetch(`${baseUrl.replace(/\/$/, "")}/slot/${slot}`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ ct: envelope.toString("base64") }),
});
if (slotWrite.status !== 201) throw new Error(`online slot write failed: ${slotWrite.status}`);
const slotEntries = await fetch(`${baseUrl.replace(/\/$/, "")}/slot/${slot}?after=0`).then((response) => response.json());
if (!Array.isArray(slotEntries) || slotEntries.length !== 1) throw new Error("online slot read failed");

console.log(JSON.stringify({ ok: true, baseUrl, id: sent, decrypted: true, slot_entries: 1 }, null, 2));
