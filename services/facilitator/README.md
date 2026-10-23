# ShadowPass facilitator

`@shadowpass/facilitator` runs the x402 `shadowpass` scheme and the wallet gas relay.

## Local

Copy the root `.env.example` to `.env`, set `FACILITATOR_PK`, then build/run from the repository root:

```bash
npm install
npm run start -w @shadowpass/facilitator
```

`SHADOWPASS_NETWORK` selects `deployments/<network>.json`; `PORT`, `ANVIL_RPC_URL`, `BASE_SEPOLIA_RPC`
and `FACILITATOR_RATE_LIMIT` are read from the environment. `PAYMENT_RATE_LIMIT`, `RELAY_RATE_LIMIT`
and `RELAY_FAUCET_PER_DAY` control the in-memory IP limits. Never commit `.env` or a private key.

## Endpoints

See `docs/INTERFACES.md` §14. `POST /relay/:action` supports `join`, `register`, `faucetDeposit`, `issue`,
`transferBudget`, `revoke` and `registerState`. Every call is simulated first, serialized for nonce safety,
rate-limited by IP, and returns only sanitized error codes. `faucetDeposit` is limited to once per IP per day.
Latency breakdowns are available at `GET /metrics`.

This demo must run as a **single long-lived Node 24 process**. Do not deploy the facilitator to a
multi-instance or serverless target until the lock, rate limits and nonce queue move to shared storage.

## Demo limits

The nullifier lock, replay set and rate limiter are in memory, so this implementation assumes one active
facilitator process. A multi-instance or serverless deployment needs an atomic shared store (Redis/Postgres)
for nullifiers and merchant rate limits before production use.
