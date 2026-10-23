import { getWalletState, saveWalletState } from "../keystore/db";
import { emptyLedger, type WalletLedger } from "./types";

export function ledgerKey(chainId: number, deployment: string, ownerAx: bigint): string {
  return `ledger:${chainId}:${deployment}:${ownerAx}`;
}

export async function loadLedger(chainId: number, deployment: string, ownerAx: bigint): Promise<WalletLedger> {
  return await getWalletState<WalletLedger>(ledgerKey(chainId, deployment, ownerAx))
    ?? emptyLedger(chainId, deployment, ownerAx);
}

export async function saveLedger(ledger: WalletLedger): Promise<void> {
  await saveWalletState(ledgerKey(ledger.chainId, ledger.deployment, BigInt(ledger.ownerAx)), ledger);
}
