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
and `RELAY_FAUCET_PER_DAY` control the in-memory IP limits. A failed faucet simulation does not consume the
daily allowance. `FACILITATOR_CORS_ORIGINS` adds comma-separated origins beyond the wallet production origin
and localhost. Never commit `.env` or a private key.

The default bind address is `127.0.0.1`; set `FACILITATOR_HOST=0.0.0.0` only for a deployed service.
`SETTLEMENT_LOCK_TTL_MS` defaults to 300,000 ms. `GET /metrics` returns 404 unless
`FACILITATOR_METRICS_TOKEN` is configured, and then requires `Authorization: Bearer <token>`.

Start the real HTTP service with:

```bash
npm run start -w @shadowpass/facilitator
```

The package test suite includes a process-level startup smoke test that verifies the command reaches
`/health` and propagates `RELAY_FAUCET_PER_DAY` and CORS configuration.

## Endpoints

See `docs/INTERFACES.md` §14. `POST /relay/:action` supports `join`, `register`, `faucetDeposit`, `issue`,
`transferBudget`, `revoke` and `registerState`. Every call is simulated again inside the serialized nonce
queue immediately before local signing, rate-limited by IP, and returns only sanitized error codes.
`faucetDeposit` uses the configured `RELAY_FAUCET_PER_DAY` quota and only commits it after execution succeeds.
Receipt polling uses a 300 ms interval. If broadcast succeeds but receipt polling fails, the nullifier remains
pending with its transaction hash rather than becoming retryable.

This demo must run as a **single long-lived Node 24 process**. Do not deploy the facilitator to a
multi-instance or serverless target until the lock, rate limits and nonce queue move to shared storage.

## Demo limits

The nullifier lock, replay set and rate limiter are in memory, so this implementation assumes one active
facilitator process. A multi-instance or serverless deployment needs an atomic shared store (Redis/Postgres)
for nullifiers and merchant rate limits before production use.
