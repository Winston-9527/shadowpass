import { decodeEventLog, parseAbi, toBytes, keccak256 } from "viem";
import type { Hex } from "./types.js";

export const shadowEvents = parseAbi([
  "event Executed(uint256 indexed budgetNf,address indexed target,bytes4 method,uint256 amount)",
  "event OwnerCiphertext(uint256 indexed budgetNf,uint256[] ct)",
  "event NullifierSpent(uint256 indexed nullifier)",
  "event NoteInserted(uint256 indexed cm,uint256 index,uint256 root)",
  "event NoteMemo(uint256 indexed cm,bytes memo)",
  "event Issued(uint256 indexed certHash,uint256 index,uint256 root)",
  "event StateRegistered(uint256 issued,uint256 revoked,uint256 root,uint256 stateRoot)",
  "event Registered(uint256 indexed nf,uint256 leaf0,uint256 index,uint256 root)",
  "event Replaced(uint256 indexed nf,uint256 oldLeaf0,uint256 newLeaf0,uint256 index,uint256 root)",
  "event Revoked(uint256 indexed entry,uint256 index,uint256 oldRoot,uint256 newRoot)",
  "event Joined(uint256 indexed commitment,uint256 index,uint256 root)",
]);

export type ShadowEventName =
  | "Executed"
  | "OwnerCiphertext"
  | "NullifierSpent"
  | "NoteInserted"
  | "NoteMemo"
  | "Issued"
  | "StateRegistered"
  | "Registered"
  | "Replaced"
  | "Revoked"
  | "Joined";

export interface DecodedShadowEvent {
  name: ShadowEventName;
  args: Record<string, unknown>;
  log: any;
}

const signatures = [
  "Executed(uint256,address,bytes4,uint256)",
  "OwnerCiphertext(uint256,uint256[])",
  "NullifierSpent(uint256)",
  "NoteInserted(uint256,uint256,uint256)",
  "NoteMemo(uint256,bytes)",
  "Issued(uint256,uint256,uint256)",
  "StateRegistered(uint256,uint256,uint256,uint256)",
  "Registered(uint256,uint256,uint256,uint256)",
  "Replaced(uint256,uint256,uint256,uint256,uint256)",
  "Revoked(uint256,uint256,uint256,uint256)",
  "Joined(uint256,uint256,uint256)",
] as const;

const names = [
  "Executed",
  "OwnerCiphertext",
  "NullifierSpent",
  "NoteInserted",
  "NoteMemo",
  "Issued",
  "StateRegistered",
  "Registered",
  "Replaced",
  "Revoked",
  "Joined",
] as const;
const topicToName = new Map<string, ShadowEventName>(
  signatures.map((signature, index) => [keccak256(toBytes(signature)).toLowerCase(), names[index]!]),
);
export const shadowEventTopics: readonly Hex[] = [...topicToName.keys()] as Hex[];

export function isKnownShadowEventLog(log: any): boolean {
  if (log?.eventName) return names.includes(log.eventName);
  const topic = log?.topics?.[0];
  return typeof topic === "string" && topicToName.has(topic.toLowerCase());
}

export function decodeShadowEvent(log: any, strict = false): DecodedShadowEvent | null {
  if (log?.eventName && log?.args) {
    if (!names.includes(log.eventName)) {
      if (strict) throw new Error(`unknown ShadowPass event: ${String(log.eventName)}`);
      return null;
    }
    if (!log.args || typeof log.args !== "object") {
      if (strict) throw new Error(`failed to decode ${String(log.eventName)}: missing args`);
      return null;
    }
    return { name: log.eventName, args: log.args, log };
  }
  const topic = log?.topics?.[0];
  if (typeof topic !== "string") {
    if (strict) throw new Error("event log is missing topics[0]");
    return null;
  }
  const name = topicToName.get(topic.toLowerCase());
  if (!name) {
    if (strict) throw new Error(`unknown event topic: ${topic}`);
    return null;
  }
  try {
    const decoded = decodeEventLog({ abi: shadowEvents, data: log.data, topics: log.topics, strict: false });
    if (!decoded.args || typeof decoded.args !== "object") {
      if (strict) throw new Error(`failed to decode ${name}: missing args`);
      return null;
    }
    return { name: decoded.eventName as ShadowEventName, args: decoded.args as Record<string, unknown>, log };
  } catch (error) {
    if (strict) throw new Error(`failed to decode ${name}: ${String(error)}`);
    return null;
  }
}

export function topicFor(name: ShadowEventName): Hex {
  const index = names.indexOf(name);
  if (index < 0) throw new Error(`unknown event ${name}`);
  return keccak256(toBytes(signatures[index]!));
}
