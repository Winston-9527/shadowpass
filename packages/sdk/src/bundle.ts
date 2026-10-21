import { z } from "zod";
import type { CertificateBundle, MailboxMessage } from "./types.js";

const scalar = z.string().regex(/^(0|[1-9][0-9]*)$/);
const point = z.object({ x: scalar, y: scalar });
const chainCert = z.object({
  hop: z.number().int().nonnegative(),
  issuer: point,
  holder: point,
  cap: scalar,
  expiry: scalar,
  sig: z.object({ S: scalar, R8x: scalar, R8y: scalar }),
  vpk: point.optional(),
  ownW: point.optional(),
  hash: scalar,
});
const CertificateBundleSchema = z.object({
  v: z.literal(1),
  chainId: z.number().int().positive(),
  deployment: z.string(),
  chain: z.array(chainCert).min(1),
  note: z.object({
    own: z.tuple([scalar, scalar]),
    q: scalar,
    lin: z.tuple([scalar, scalar, scalar, scalar]),
    rho: scalar,
  }),
  owner: z.object({ box: z.string().regex(/^(0x)?[0-9a-fA-F]{64}$/) }),
});

const ReceiptMessageSchema = z.object({
  type: z.literal("receipt"),
  budgetNf: scalar,
  tx: z.string(),
  resource: z.string(),
  amount: scalar,
});

const DelegatedMessageSchema = z.object({
  type: z.literal("delegated"),
  parent: scalar,
  cert: chainCert,
});

const MailboxMessageSchema = z.discriminatedUnion("type", [ReceiptMessageSchema, DelegatedMessageSchema]);

const encoder = new TextEncoder();
const decoder = new TextDecoder();

function base64UrlEncode(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
}

function base64UrlDecode(value: string): Uint8Array {
  const padded = value.replaceAll("-", "+").replaceAll("_", "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  const binary = atob(padded);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

export function encodeBundle(bundle: CertificateBundle): string {
  return base64UrlEncode(encoder.encode(JSON.stringify(CertificateBundleSchema.parse(bundle))));
}

export function decodeBundle(encoded: string): CertificateBundle {
  return CertificateBundleSchema.parse(JSON.parse(decoder.decode(base64UrlDecode(encoded)))) as CertificateBundle;
}

export function encodeMessage(message: MailboxMessage): string {
  return base64UrlEncode(encoder.encode(JSON.stringify(MailboxMessageSchema.parse(message))));
}

export function decodeMessage(encoded: string): MailboxMessage {
  return MailboxMessageSchema.parse(JSON.parse(decoder.decode(base64UrlDecode(encoded)))) as MailboxMessage;
}
