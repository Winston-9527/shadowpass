# Spike: custom `shadowpass` scheme on the stock x402 v2 SDK

Question: can a ZK-proof payment run through the official x402 v2 packages (`@x402/express` middleware, `HTTPFacilitatorClient`, `@x402/fetch`) without forking them, and settle before the merchant handler runs?

Result (2026-10-21, `@x402/*` 2.28.0): **yes**.

```
1. unpaid request        -> 402, PAYMENT-REQUIRED header
2. paid request          -> client builds payload -> facilitator /settle -> handler runs -> 200 + PAYMENT-RESPONSE
3. tampered binding      -> 402, handler not run
```

What we learned:
- The SDK has pluggable `SchemeNetworkClient` / `SchemeNetworkServer` / `SchemeNetworkFacilitator` interfaces. Registering our scheme is enough; middleware and fetch wrapper are unchanged.
- `paymentFlows: { default: { supported: ["upfront"], default: "upfront" } }` gives settle-before-handler, which we need so a budget note cannot be double-used against a merchant that already delivered.
- The client's default spend controls reject non-default assets. The spike disables them (`spendControls: false`); the MCP server must instead set `allowedAssets` to our token and a per-payment cap.
- The facilitator HTTP service is three routes (`GET /supported`, `POST /verify`, `POST /settle`) around `x402Facilitator`.

Faked here: the proof, `eth_call` simulation and the `Gate.execute` transaction. The binding check (network, asset, amount, payTo, resource) is real and stands in for `ctx_hash`.

Run: `npm ci && node spike.mjs`
