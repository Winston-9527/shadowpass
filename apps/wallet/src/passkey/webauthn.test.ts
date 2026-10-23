import { beforeEach, describe, expect, it, vi } from "vitest";
import { bytesToBase64Url } from "../lib/bytes";
import { PasskeyRegistrationRecoveryError, PrfUnsupportedError, authenticatePasskey, registerPasskey } from "./webauthn";

class MockPublicKeyCredential {
  readonly id = "credential-id";
  readonly rawId = new Uint8Array(16).fill(1).buffer;
  readonly type = "public-key";
  readonly getClientExtensionResults: () => { prf: { enabled: boolean; results?: { first: ArrayBuffer } } };
  readonly response: { getClientExtensionResults?: () => never };

  constructor(
    private readonly resultEnabled: boolean,
    private readonly resultFirst: ArrayBuffer | undefined,
    private readonly responseTrap: (() => never) | undefined = undefined,
  ) {
    this.getClientExtensionResults = () => ({
      prf: {
        enabled: this.resultEnabled,
        ...(this.resultFirst ? { results: { first: this.resultFirst } } : {}),
      },
    });
    this.response = this.responseTrap ? { getClientExtensionResults: this.responseTrap } : {};
  }
}

describe("WebAuthn PRF semantics", () => {
  const get = vi.fn();
  const create = vi.fn();

  beforeEach(() => {
    get.mockReset();
    create.mockReset();
    Object.defineProperty(globalThis, "window", { configurable: true, value: globalThis });
    Object.defineProperty(globalThis, "location", { configurable: true, value: { hostname: "localhost" } });
    Object.defineProperty(globalThis, "PublicKeyCredential", { configurable: true, value: MockPublicKeyCredential });
    Object.defineProperty(globalThis, "navigator", {
      configurable: true,
      value: { credentials: { create, get } },
    });
  });

  it("rejects registration without PRF enabled without prompting a second time", async () => {
    create.mockResolvedValue(new MockPublicKeyCredential(false, undefined));

    await expect(registerPasskey("test")).rejects.toBeInstanceOf(PrfUnsupportedError);
    expect(get).not.toHaveBeenCalled();
  });

  it("never reads getClientExtensionResults from the authenticator response", async () => {
    const responseTrap = vi.fn(() => { throw new Error("response getter must not be called"); });
    create.mockResolvedValue(new MockPublicKeyCredential(false, undefined, responseTrap));

    await expect(registerPasskey("test")).rejects.toBeInstanceOf(PrfUnsupportedError);
    expect(responseTrap).not.toHaveBeenCalled();
  });

  it("accepts authentication results that only contain prf.results.first", async () => {
    get.mockResolvedValue(new MockPublicKeyCredential(false, new Uint8Array(32).fill(7).buffer));

    const credentialId = bytesToBase64Url(new Uint8Array(16).fill(1));
    await expect(authenticatePasskey(credentialId)).resolves.toMatchObject({ prf: new Uint8Array(32).fill(7) });
  });

  it("performs one targeted login when registration returns enabled without a PRF result", async () => {
    create.mockResolvedValue(new MockPublicKeyCredential(true, undefined));
    get.mockResolvedValue(new MockPublicKeyCredential(false, new Uint8Array(32).fill(7).buffer));

    await expect(registerPasskey("iCloud keychain")).resolves.toMatchObject({
      credentialId: bytesToBase64Url(new Uint8Array(16).fill(1)),
      prf: new Uint8Array(32).fill(7),
    });
    expect(get).toHaveBeenCalledTimes(1);
    expect(get.mock.calls[0]?.[0]?.publicKey?.allowCredentials).toHaveLength(1);
  });

  it("reports an orphaned passkey when the targeted PRF confirmation is cancelled", async () => {
    create.mockResolvedValue(new MockPublicKeyCredential(true, undefined));
    get.mockRejectedValue(new DOMException("cancelled", "NotAllowedError"));

    await expect(registerPasskey("cancelled")).rejects.toBeInstanceOf(PasskeyRegistrationRecoveryError);
  });

  it("uses a fresh user handle and excludes existing credentials for additional passkeys", async () => {
    const result = new Uint8Array(32).fill(7).buffer;
    create.mockResolvedValue(new MockPublicKeyCredential(true, result));

    const firstRegistration = await registerPasskey("first");
    await registerPasskey("second", ["AQID"]);
    const first = create.mock.calls[0]?.[0]?.publicKey;
    const second = create.mock.calls[1]?.[0]?.publicKey;

    expect(first?.authenticatorSelection?.authenticatorAttachment).toBeUndefined();
    expect(first?.excludeCredentials).toHaveLength(0);
    expect(second?.excludeCredentials).toHaveLength(1);
    expect(firstRegistration.userId).toBe(bytesToBase64Url(new Uint8Array(first?.user.id as ArrayBuffer)));
    expect(Array.from(new Uint8Array(first?.user.id as ArrayBuffer))).not.toEqual(
      Array.from(new Uint8Array(second?.user.id as ArrayBuffer)),
    );
  });
});
