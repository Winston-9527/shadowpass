# ShadowPass facilitator

`@shadowpass/facilitator` runs the x402 `shadowpass` scheme and the wallet gas relay.

## Local

Copy the root `.env.example` to `.env`, set `FACILITATOR_PK`, then build/run from the repository root:

```bash
npm install
npm run start -w @shadowpass/facilitator
```

`SHADOWPASS_NETWORK` selects `deployments/<network>.json`; `PORT`, `ANVIL_RPC_URL`, `BASE_SEPOLIA_RPC`
and `FACILITATOR_RATE_LIMIT` are read from the environment. Never commit `.env` or a private key.

## Endpoints

See `docs/INTERFACES.md` §14. The service returns x402 verify/settle JSON plus relay transaction hashes,
and records latency breakdowns at `GET /metrics`.

For Vercel, expose `createFacilitatorApp()` from a serverless entrypoint and bind the same environment
variables in the project settings. The demo can also run on any Node 24 host.

## Demo limits

The nullifier lock, replay set and rate limiter are in memory, so this implementation assumes one active
facilitator process. A multi-instance or serverless deployment needs an atomic shared store (Redis/Postgres)
for nullifiers and merchant rate limits before production use.
