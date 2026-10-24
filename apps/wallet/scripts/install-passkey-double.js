(() => {
  let counter = 0;
  const prfFor = (rawId) => new Uint8Array(32).fill(5 + new Uint8Array(rawId)[0]);

  class MockPublicKeyCredential {
    constructor(rawId) {
      this.rawId = rawId;
      this.id = Array.from(new Uint8Array(rawId), (byte) => byte.toString(16).padStart(2, "0")).join("");
      this.type = "public-key";
      this.response = {};
      this.getClientExtensionResults = () => ({ prf: { enabled: true, results: { first: prfFor(rawId).buffer } } });
    }
  }

  Object.defineProperty(window, "PublicKeyCredential", { configurable: true, value: MockPublicKeyCredential });
  Object.defineProperty(MockPublicKeyCredential, "isUserVerifyingPlatformAuthenticatorAvailable", {
    configurable: true,
    value: async () => true,
  });
  Object.defineProperty(navigator, "credentials", {
    configurable: true,
    value: {
      create: async () => new MockPublicKeyCredential(new Uint8Array(16).fill(++counter).buffer),
      get: async (options) => {
        const requested = options?.publicKey?.allowCredentials?.[0]?.id;
        const rawId = requested instanceof ArrayBuffer ? requested : new Uint8Array(16).fill(1).buffer;
        return new MockPublicKeyCredential(rawId);
      },
    },
  });
})();
