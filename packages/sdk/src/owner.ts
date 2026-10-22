import { L, P } from "./constants.js";
import { BASE8, F, add, bytesToBigInt, mod, mul, poseidon, randomBytes } from "./crypto.js";
import { decodeShadowEvent } from "./events.js";
import type { BillEntry, OwnerCiphertext, Point } from "./types.js";

function scalarBelow(bytes: Uint8Array): bigint {
  let value = bytesToBigInt(bytes) % L;
  while (value === 0n) value = bytesToBigInt(randomBytes(32)) % L;
  return value;
}

export function encryptChain(
  entities: Point[],
  viewPublicKey: Point,
  random: (length: number) => Uint8Array = randomBytes,
): OwnerCiphertext {
  const r = scalarBelow(random(32));
  const k = scalarBelow(random(32));
  const ephemeral = mul(BASE8, k);
  const c1 = mul(BASE8, r);
  const c2 = add(ephemeral, mul(viewPublicKey, r));
  let packed = 0n;
  const e = entities.map((entity, index) => {
    packed += (entity.x & 1n) << BigInt(index);
    return mod(entity.y + poseidon[3]([ephemeral.x, ephemeral.y, BigInt(index)]));
  });
  return {
    c1,
    c2,
    e,
    esign: mod(packed + poseidon[3]([ephemeral.x, ephemeral.y, BigInt(entities.length)])),
    r,
    ephemeral,
  };
}

function xFromY(y: bigint, parity: bigint): bigint | null {
  const yy = F.square(F.e(y));
  const numerator = F.sub(F.one, yy);
  const denominator = F.sub(F.e(168700n), F.mul(F.e(168696n), yy));
  if (F.isZero(denominator)) return null;
  const value = F.toObject(F.div(numerator, denominator));
  if (value !== 0n && powMod(value, (P - 1n) / 2n) !== 1n) return null;
  let x = BigInt(F.toObject(F.sqrt(F.e(value))));
  if ((x & 1n) !== parity) x = mod(-x);
  return x;
}

function powMod(base: bigint, exponent: bigint): bigint {
  let result = 1n;
  let current = mod(base);
  let power = exponent;
  while (power > 0n) {
    if (power & 1n) result = (result * current) % P;
    current = (current * current) % P;
    power >>= 1n;
  }
  return result;
}

export function openChain(ciphertext: OwnerCiphertext, viewSecret: bigint): Point[] | null {
  const shared = mul(ciphertext.c1, viewSecret);
  const ephemeral = add(ciphertext.c2, { x: mod(-shared.x), y: shared.y });
  const bits = mod(ciphertext.esign - poseidon[3]([ephemeral.x, ephemeral.y, BigInt(ciphertext.e.length)]));
  if (bits >= 1n << BigInt(ciphertext.e.length)) return null;
  const output: Point[] = [];
  for (let index = 0; index < ciphertext.e.length; index += 1) {
    const y = mod(ciphertext.e[index]! - poseidon[3]([ephemeral.x, ephemeral.y, BigInt(index)]));
    const x = xFromY(y, (bits >> BigInt(index)) & 1n);
    if (x === null) return null;
    output.push({ x, y });
  }
  return output;
}

function ownerCiphertextFromArgs(args: Record<string, unknown>): OwnerCiphertext {
  const values = (args.ct as unknown[]).map((value) => BigInt(value as any));
  if (values.length < 6) throw new Error("owner ciphertext too short");
  return {
    c1: { x: values[0]!, y: values[1]! },
    c2: { x: values[2]!, y: values[3]! },
    e: values.slice(4, -1),
    esign: values[values.length - 1]!,
  };
}

export function scanBill(state: any, logs: any[], viewSecret: bigint): BillEntry[] {
  const decoded = logs.map((log) => decodeShadowEvent(log)).filter(Boolean) as ReturnType<typeof decodeShadowEvent>[];
  const executions = new Map<string, any>();
  for (const event of decoded) {
    if (event?.name === "Executed") executions.set(String(event.args.budgetNf), event);
  }
  const bills: BillEntry[] = [];
  for (const event of decoded) {
    if (event?.name !== "OwnerCiphertext") continue;
    const budgetNf = BigInt(event.args.budgetNf as any);
    const ciphertext = ownerCiphertextFromArgs(event.args);
    const execution = executions.get(budgetNf.toString());
    bills.push({
      budgetNf,
      txHash: event.log?.transactionHash,
      blockNumber: event.log?.blockNumber === undefined ? undefined : BigInt(event.log.blockNumber),
      target: execution?.args.target,
      method: execution?.args.method,
      amount: execution?.args.amount === undefined ? undefined : BigInt(execution.args.amount),
      chain: openChain(ciphertext, viewSecret),
    });
  }
  void state;
  return bills;
}

export const ownerCtOfInput = (input: Record<string, any>): OwnerCiphertext => ({
  c1: { x: BigInt(input.own_c1x), y: BigInt(input.own_c1y) },
  c2: { x: BigInt(input.own_c2x), y: BigInt(input.own_c2y) },
  e: (input.own_e as any[]).map(BigInt),
  esign: BigInt(input.own_esign),
});
