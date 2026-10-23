# ShadowPass merchant demo

Official `@x402/express` middleware with the `shadowpass` server scheme.

```bash
npm install
npm run start -w @shadowpass/merchant-demo
npm run e2e -w @shadowpass/merchant-demo
```

The demo protects `GET /report` at 2 USDC and `GET /news` at 0.5 USDC. `merchantPayTo` is the real
merchant receiving address; `ShadowPayout` is only the authorized target and must not receive the merchant payment.

Standalone startup reads `FACILITATOR_URL`, `MERCHANT_PAY_TO`, `SHADOWPASS_TOKEN`,
`SHADOWPASS_NETWORK` and `PORT`.
