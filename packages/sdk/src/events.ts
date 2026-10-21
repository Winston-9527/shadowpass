import { decodeEventLog, parseAbi, toBytes, keccak256 } from "viem";
import type { Hex } from "./types.js";

export const shadowEvents = parseAbi([
  "event Executed(uint256 budgetNf,address target,bytes4 method,uint256 amount)",
  "event OwnerCiphertext(uint256 budgetNf,uint256[] ct)",
  "event NoteInserted(uint256 cm,uint256 index,uint256 newRoot)",
  "event NoteMemo(uint256 indexed cm,bytes memo)",
  "event Issued(uint256 certHash,uint256 index,uint256 newRoot)",
  "event Registered(uint256 nf,uint256 leaf0,uint256 root)",
  "event Replaced(uint256 nf,uint256 leaf0,uint256 root)",
  "event Revoked(uint256 entry,uint256 index,uint256 oldRoot,uint256 newRoot)",
  "event Joined(uint256 commitment,uint256 index,uint256 root)",
  "event BudgetSpent(uint256 nullifier)",
]);

export type ShadowEventName =
  | "Executed"
  | "OwnerCiphertext"
  | "NoteInserted"
  | "NoteMemo"
  | "Issued"
  | "Registered"
  | "Replaced"
  | "Revoked"
  | "Joined"
  | "BudgetSpent";

export interface DecodedShadowEvent {
  name: ShadowEventName;
  args: Record<string, unknown>;
  log: any;
}

const signatures = [
  "Executed(uint256,address,bytes4,uint256)",
  "OwnerCiphertext(uint256,uint256[])",
  "NoteInserted(uint256,uint256,uint256)",
  "NoteMemo(uint256,bytes)",
  "Issued(uint256,uint256,uint256)",
  "Registered(uint256,uint256,uint256)",
  "Replaced(uint256,uint256,uint256)",
  "Revoked(uint256,uint256,uint256,uint256)",
  "Joined(uint256,uint256,uint256)",
  "BudgetSpent(uint256)",
] as const;

const names = ["Executed", "OwnerCiphertext", "NoteInserted", "NoteMemo", "Issued", "Registered", "Replaced", "Revoked", "Joined", "BudgetSpent"] as const;
const topicToName = new Map<string, ShadowEventName>(
  signatures.map((signature, index) => [keccak256(toBytes(signature)).toLowerCase(), names[index]!]),
);

export function decodeShadowEvent(log: any): DecodedShadowEvent | null {
  if (log?.eventName && log?.args) return { name: log.eventName, args: log.args, log };
  const topic = log?.topics?.[0];
  if (typeof topic !== "string") return null;
  const name = topicToName.get(topic.toLowerCase());
  if (!name) return null;
  try {
    const decoded = decodeEventLog({ abi: shadowEvents, data: log.data, topics: log.topics, strict: false });
    return { name: decoded.eventName as ShadowEventName, args: decoded.args as Record<string, unknown>, log };
  } catch {
    return null;
  }
}

export function topicFor(name: ShadowEventName): Hex {
  const index = names.indexOf(name);
  if (index < 0) throw new Error(`unknown event ${name}`);
  return keccak256(toBytes(signatures[index]!));
}
