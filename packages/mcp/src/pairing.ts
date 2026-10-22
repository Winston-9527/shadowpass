import { z } from "zod";
import type { AgentStore } from "./store.js";

export const WALLET_PAIR_URL = "https://shadowpass-wallet.vercel.app/pair";

const PairingPayloadSchema = z.object({
  v: z.literal(1),
  name: z.string().min(1).max(64),
  agentPk: z.object({
    x: z.string().regex(/^(0|[1-9][0-9]*)$/),
    y: z.string().regex(/^(0|[1-9][0-9]*)$/),
  }),
  boxPk: z.string().regex(/^(0x)?[0-9a-fA-F]{64}$/),
});

export type PairingPayload = z.infer<typeof PairingPayloadSchema>;

function base64UrlEncode(value: string): string {
  return Buffer.from(value, "utf8").toString("base64url");
}

function base64UrlDecode(value: string): string {
  return Buffer.from(value, "base64url").toString("utf8");
}

export function buildPairing(store: AgentStore): { payload: PairingPayload; code: string; url: string } {
  const payload = PairingPayloadSchema.parse({
    v: 1,
    name: store.name,
    agentPk: { x: store.holder.Ax.toString(), y: store.holder.Ay.toString() },
    boxPk: Buffer.from(store.boxPublicKey).toString("hex"),
  });
  const code = base64UrlEncode(JSON.stringify(payload));
  return { payload, code, url: `${WALLET_PAIR_URL}#${code}` };
}

export function decodePairingCode(code: string): PairingPayload {
  return PairingPayloadSchema.parse(JSON.parse(base64UrlDecode(code)));
}
