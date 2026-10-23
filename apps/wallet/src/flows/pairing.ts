import type { PairingPayload } from "./types";

function base64UrlDecode(value: string): string {
  const normalized = value.replaceAll("-", "+").replaceAll("_", "/");
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
  return new TextDecoder().decode(Uint8Array.from(atob(padded), (character) => character.charCodeAt(0)));
}

function scalar(value: unknown, name: string): bigint {
  if (typeof value !== "string" || !/^(0|[1-9][0-9]*)$/.test(value)) throw new Error(`invalid ${name}`);
  const parsed = BigInt(value);
  if (parsed === 0n) throw new Error(`invalid ${name}`);
  return parsed;
}

export function parsePairingCode(code: string): PairingPayload {
  const trimmed = code.trim();
  if (!trimmed || trimmed.length > 4096) throw new Error("pairing code is empty or too long");
  let parsed: unknown;
  try {
    parsed = JSON.parse(base64UrlDecode(trimmed));
  } catch {
    throw new Error("pairing code is not valid base64url JSON");
  }
  if (!parsed || typeof parsed !== "object") throw new Error("pairing payload must be an object");
  const payload = parsed as Record<string, unknown>;
  if (payload.v !== 1) throw new Error("unsupported pairing version");
  if (typeof payload.name !== "string" || !payload.name.trim() || payload.name.length > 64) throw new Error("invalid Agent name");
  if (!payload.agentPk || typeof payload.agentPk !== "object") throw new Error("pairing payload is missing agentPk");
  const agentPk = payload.agentPk as Record<string, unknown>;
  if (typeof payload.boxPk !== "string" || !/^(0x)?[0-9a-fA-F]{64}$/.test(payload.boxPk)) throw new Error("invalid mailbox public key");
  if (typeof payload.pair !== "string" || !/^[0-9a-f]{32}$/.test(payload.pair)) throw new Error("invalid one-time pairing secret");
  return {
    v: 1,
    name: payload.name.trim(),
    agentPk: { x: scalar(agentPk.x, "agent signing key"), y: scalar(agentPk.y, "agent signing key") },
    boxPk: payload.boxPk.replace(/^0x/, "").toLowerCase(),
    pair: payload.pair.toLowerCase(),
  };
}

export function pairingCodeFromLocation(location: Pick<Location, "pathname" | "hash">): string {
  if (!location.pathname.endsWith("/pair") && location.pathname !== "/pair") return "";
  return location.hash.replace(/^#/, "");
}
