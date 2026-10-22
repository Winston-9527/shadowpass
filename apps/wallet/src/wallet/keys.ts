import { deriveKeys, type KeySet, type Point } from "../sdk";
import { bytesToHex } from "../lib/bytes";

export type WalletKeyKind = "sign" | "steward" | "view" | "box";

export async function deriveWalletKeys(seed: Uint8Array): Promise<KeySet> {
  return deriveKeys(seed);
}

function pointText(point: Point): string {
  return `0x${point.x.toString(16).padStart(64, "0")}${point.y.toString(16).padStart(64, "0")}`;
}

export function publicKeyText(bundle: KeySet, kind: WalletKeyKind): string {
  if (kind === "sign") return pointText({ x: bundle.sign.Ax, y: bundle.sign.Ay });
  if (kind === "steward") return pointText({ x: bundle.steward.Ax, y: bundle.steward.Ay });
  if (kind === "view") return pointText(bundle.view.vpk);
  return bytesToHex(bundle.box.publicKey);
}

export function clearKeyBundle(bundle: KeySet | null): void {
  if (!bundle) return;
  bundle.seed.fill(0);
  bundle.sign.prv.fill(0);
  bundle.steward.prv.fill(0);
  bundle.box.privateKey.fill(0);
  bundle.sign.sk = 0n;
  bundle.steward.sk = 0n;
  bundle.view.vsk = 0n;
}
