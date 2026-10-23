import type { Cert, CertificateBundle, Identity } from "@shadowpass/sdk";

function identity(x: string, y: string): Identity {
  return { prv: new Uint8Array(32), Ax: BigInt(x), Ay: BigInt(y), sk: 0n };
}

export function serializeCert(cert: Cert): CertificateBundle["chain"][number] {
  return {
    hop: cert.hop,
    issuer: { x: cert.issuer.Ax.toString(), y: cert.issuer.Ay.toString() },
    holder: { x: cert.holder.Ax.toString(), y: cert.holder.Ay.toString() },
    cap: cert.cap.toString(),
    expiry: cert.expiry.toString(),
    sig: {
      S: cert.sig.S.toString(),
      R8x: cert.sig.R8x.toString(),
      R8y: cert.sig.R8y.toString(),
    },
    ...(cert.vpk ? { vpk: { x: cert.vpk.x.toString(), y: cert.vpk.y.toString() } } : {}),
    ...(cert.ownW ? { ownW: { x: cert.ownW.x.toString(), y: cert.ownW.y.toString() } } : {}),
    hash: cert.hash.toString(),
  };
}

export function deserializeCert(cert: CertificateBundle["chain"][number]): Cert {
  return {
    hop: cert.hop,
    issuer: identity(cert.issuer.x, cert.issuer.y),
    holder: identity(cert.holder.x, cert.holder.y),
    cap: BigInt(cert.cap),
    expiry: BigInt(cert.expiry),
    sig: { S: BigInt(cert.sig.S), R8x: BigInt(cert.sig.R8x), R8y: BigInt(cert.sig.R8y) },
    ...(cert.vpk ? { vpk: { x: BigInt(cert.vpk.x), y: BigInt(cert.vpk.y) } } : {}),
    ...(cert.ownW ? { ownW: { x: BigInt(cert.ownW.x), y: BigInt(cert.ownW.y) } } : {}),
    hash: BigInt(cert.hash),
  };
}
