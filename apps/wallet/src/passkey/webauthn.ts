import { base64UrlToBytes, bytesToBase64Url, randomBytes, toArrayBuffer } from "../lib/bytes";
import { PRF_SALT } from "../keystore/crypto";

export class PrfUnsupportedError extends Error {
  constructor(message = "This authenticator does not expose the WebAuthn PRF extension") {
    super(message);
    this.name = "PrfUnsupportedError";
  }
}

export interface PasskeyRecord {
  credentialId: string;
  userId: string;
  label: string;
  createdAt: string;
}

export interface PasskeyRegistration extends PasskeyRecord {
  prf: Uint8Array;
}

type PrfExtensionOutput = {
  enabled?: boolean;
  results?: { first?: ArrayBuffer };
};

type AuthenticatorResponseWithPrf = AuthenticatorResponse & {
  getClientExtensionResults?: () => { prf?: PrfExtensionOutput };
};

export function hasPlatformPasskeySupport(): boolean {
  return typeof window !== "undefined"
    && typeof PublicKeyCredential !== "undefined"
    && typeof navigator.credentials !== "undefined";
}

export async function isPlatformAuthenticatorAvailable(): Promise<boolean> {
  if (!hasPlatformPasskeySupport()) return false;
  if (typeof PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable !== "function") return false;
  try {
    return await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
  } catch {
    return false;
  }
}

function prfFromCredential(credential: PublicKeyCredential): Uint8Array | null {
  const response = credential.response as AuthenticatorResponseWithPrf;
  const prf = response.getClientExtensionResults?.().prf;
  if (!prf?.enabled) return null;
  const first = prf.results?.first;
  return first ? new Uint8Array(first) : null;
}

function creationOptions(label: string, userId?: string): PublicKeyCredentialCreationOptions {
  const userHandle = userId ? base64UrlToBytes(userId) : randomBytes(16);
  return {
    challenge: toArrayBuffer(randomBytes(32)),
    rp: { name: "ShadowPass Wallet", id: location.hostname === "localhost" ? "localhost" : "shadowpass-wallet.vercel.app" },
    user: {
      id: toArrayBuffer(userHandle),
      name: label,
      displayName: label,
    },
    pubKeyCredParams: [
      { type: "public-key", alg: -7 },
      { type: "public-key", alg: -257 },
    ],
    timeout: 60_000,
    attestation: "none",
    authenticatorSelection: {
      authenticatorAttachment: "platform",
      residentKey: "required",
      userVerification: "required",
    },
    extensions: { prf: { eval: { first: toArrayBuffer(PRF_SALT) } } } as AuthenticationExtensionsClientInputs,
  };
}

function requestOptions(credentialId: string): PublicKeyCredentialRequestOptions {
  return {
    challenge: toArrayBuffer(randomBytes(32)),
    rpId: location.hostname === "localhost" ? "localhost" : "shadowpass-wallet.vercel.app",
    allowCredentials: [{ type: "public-key", id: toArrayBuffer(base64UrlToBytes(credentialId)) }],
    userVerification: "required",
    timeout: 60_000,
    extensions: { prf: { eval: { first: toArrayBuffer(PRF_SALT) } } } as AuthenticationExtensionsClientInputs,
  };
}

export async function registerPasskey(label: string, userId?: string): Promise<PasskeyRegistration> {
  if (!hasPlatformPasskeySupport()) throw new Error("WebAuthn is not available in this browser");
  const userHandle = userId ? base64UrlToBytes(userId) : randomBytes(16);
  const credential = await navigator.credentials.create({ publicKey: creationOptions(label, userId) });
  if (!(credential instanceof PublicKeyCredential)) throw new Error("Passkey registration did not return a credential");
  let prf = prfFromCredential(credential);
  if (!prf) {
    const evaluated = await authenticatePasskey(bytesToBase64Url(new Uint8Array(credential.rawId)));
    prf = evaluated.prf;
  }
  return {
    credentialId: bytesToBase64Url(new Uint8Array(credential.rawId)),
    userId: bytesToBase64Url(userHandle),
    label,
    createdAt: new Date().toISOString(),
    prf,
  };
}

export async function authenticatePasskey(credentialId: string): Promise<{ credential: PublicKeyCredential; prf: Uint8Array }> {
  if (!hasPlatformPasskeySupport()) throw new Error("WebAuthn is not available in this browser");
  const credential = await navigator.credentials.get({ publicKey: requestOptions(credentialId) });
  if (!(credential instanceof PublicKeyCredential)) throw new Error("Passkey authentication did not return a credential");
  const prf = prfFromCredential(credential);
  if (!prf) throw new PrfUnsupportedError();
  return { credential, prf };
}
