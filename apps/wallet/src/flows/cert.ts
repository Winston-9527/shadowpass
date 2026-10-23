import type { Cert, CertificateBundle } from "@shadowpass/sdk";

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
