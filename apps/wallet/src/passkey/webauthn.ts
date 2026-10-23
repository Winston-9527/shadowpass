import { base64UrlToBytes, bytesToBase64Url, randomBytes, toArrayBuffer, utf8 } from "../lib/bytes";

const PRF_SALT = utf8("shadowpass-v1");

export class PrfUnsupportedError extends Error {
  constructor(message = "This authenticator does not expose the WebAuthn PRF extension") {
    super(message);
    this.name = "PrfUnsupportedError";
  }
}

export class PasskeyRegistrationRecoveryError extends Error {
  constructor(cause?: unknown) {
    super(
      "Passkey was created but the second PRF confirmation failed. Remove the new passkey in System Settings → Passwords and try again.",
      { cause },
    );
    this.name = "PasskeyRegistrationRecoveryError";
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
  const prf = (credential.getClientExtensionResults() as { prf?: PrfExtensionOutput }).prf;
  const first = prf?.results?.first;
  return first ? new Uint8Array(first) : null;
}

function prfEnabled(credential: PublicKeyCredential): boolean {
  return (credential.getClientExtensionResults() as { prf?: PrfExtensionOutput }).prf?.enabled === true;
}

function creationOptions(label: string, userHandle: Uint8Array, excludeCredentialIds: string[]): PublicKeyCredentialCreationOptions {
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
      residentKey: "required",
      userVerification: "required",
    },
    excludeCredentials: excludeCredentialIds.map((credentialId) => ({
      type: "public-key",
      id: toArrayBuffer(base64UrlToBytes(credentialId)),
    })),
    extensions: { prf: { eval: { first: toArrayBuffer(PRF_SALT) } } } as AuthenticationExtensionsClientInputs,
  };
}

function requestOptions(credentialId?: string): PublicKeyCredentialRequestOptions {
  return {
    challenge: toArrayBuffer(randomBytes(32)),
    rpId: location.hostname === "localhost" ? "localhost" : "shadowpass-wallet.vercel.app",
    allowCredentials: credentialId ? [{ type: "public-key", id: toArrayBuffer(base64UrlToBytes(credentialId)) }] : [],
    userVerification: "required",
    timeout: 60_000,
    extensions: { prf: { eval: { first: toArrayBuffer(PRF_SALT) } } } as AuthenticationExtensionsClientInputs,
  };
}

export async function registerPasskey(label: string, excludeCredentialIds: string[] = []): Promise<PasskeyRegistration> {
  if (!hasPlatformPasskeySupport()) throw new Error("WebAuthn is not available in this browser");
  const userHandle = randomBytes(16);
  const credential = await navigator.credentials.create({ publicKey: creationOptions(label, userHandle, excludeCredentialIds) });
  if (!(credential instanceof PublicKeyCredential)) throw new Error("Passkey registration did not return a credential");
  if (!prfEnabled(credential)) throw new PrfUnsupportedError();
  const credentialId = bytesToBase64Url(new Uint8Array(credential.rawId));
  let prf = prfFromCredential(credential);
  if (!prf) {
    try {
      prf = (await authenticatePasskey(credentialId)).prf;
    } catch (error) {
      throw new PasskeyRegistrationRecoveryError(error);
    }
  }
  return {
    credentialId,
    userId: bytesToBase64Url(userHandle),
    label,
    createdAt: new Date().toISOString(),
    prf,
  };
}

export async function authenticatePasskey(credentialId?: string): Promise<{ credential: PublicKeyCredential; prf: Uint8Array }> {
  if (!hasPlatformPasskeySupport()) throw new Error("WebAuthn is not available in this browser");
  const credential = await navigator.credentials.get({ publicKey: requestOptions(credentialId) });
  if (!(credential instanceof PublicKeyCredential)) throw new Error("Passkey authentication did not return a credential");
  const prf = prfFromCredential(credential);
  if (!prf) throw new PrfUnsupportedError();
  return { credential, prf };
}
