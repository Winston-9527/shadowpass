import { KEY_TAG } from "./constants.js";
import { poseidon, sign } from "./crypto.js";
import type { Cert, Identity, Point, Signature } from "./types.js";

export function certHash0(issuer: Identity, holder: Identity, cap: bigint, expiry: bigint, vpk: Point): bigint {
  return poseidon[9]([0n, issuer.Ax, issuer.Ay, holder.Ax, holder.Ay, cap, expiry, vpk.x, vpk.y]);
}

export function certHash(hop: number, issuer: Identity, holder: Identity, cap: bigint, expiry: bigint): bigint {
  return poseidon[7]([BigInt(hop), issuer.Ax, issuer.Ay, holder.Ax, holder.Ay, cap, expiry]);
}

export function keyEntry(identity: Pick<Identity, "Ax" | "Ay">): bigint {
  return poseidon[3]([KEY_TAG, identity.Ax, identity.Ay]);
}

export function issueRoot(
  issuer: Identity,
  holder: Identity,
  cap: bigint,
  expiry: bigint,
  vpk: Point,
  ownW?: Point,
): Cert {
  const hash = certHash0(issuer, holder, cap, expiry, vpk);
  return {
    hop: 0,
    issuer,
    holder,
    cap,
    expiry,
    sig: sign(issuer, hash),
    vpk,
    ownW,
    hash,
  };
}

export function issue(parent: Cert, holder: Identity, cap: bigint, expiry: bigint): Cert {
  if (parent.hop < 0) throw new Error("invalid parent hop");
  const hop = parent.hop + 1;
  const hash = certHash(hop, parent.holder, holder, cap, expiry);
  return {
    hop,
    issuer: parent.holder,
    holder,
    cap,
    expiry,
    sig: sign(parent.holder, hash),
    hash,
  };
}

export function signatureToJson(signature: Signature): { S: string; R8x: string; R8y: string } {
  return { S: signature.S.toString(), R8x: signature.R8x.toString(), R8y: signature.R8y.toString() };
}
