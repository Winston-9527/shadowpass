# ShadowPass merchant demo

Official `@x402/express` middleware with the `shadowpass` server scheme.

```bash
npm install
npm run start -w @shadowpass/merchant-demo
npm run e2e -w @shadowpass/merchant-demo
```

The demo protects `GET /report` at 2 USDC and `GET /news` at 0.5 USDC. Configure the facilitator URL,
token, Gate and payout addresses in `createMerchantApp()` or through the deployment adapter.

Standalone startup reads `FACILITATOR_URL`, `SHADOWPASS_TOKEN`, `SHADOWPASS_GATE`, `SHADOWPASS_PAYOUT`
and `PORT`.
