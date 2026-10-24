# ShadowPass MVP Troubleshooting

Load this file only after a bundled MVP CLI command fails.

## `missingCommands`

One of `node`, `npm`, `anvil`, `cast`, `forge`, `circom`, `jq`, or `git` is absent. Report the exact list. Do not install global toolchains without asking.

## `ptau.exists: false`

Set `SHADOWPASS_PTAU=/absolute/path/to/powersOfTau28_hez_final_18.ptau`, or place the official file at `artifacts/ptau/powersOfTau28_hez_final_18.ptau`.

## `busyPorts`

Stop the process using the listed port or start with alternate `MVP_*_PORT` variables. E2E and interactive mode cannot run together on the same ports.

## `zkey hash mismatch`

Use the bundled CLI, which sets the explicit local artifact trust flags only for local files. Do not set remote artifact URLs as trusted manifests.

## Pairing URL opens production

Use the runtime manifest or `pairs` command. The local form is `http://localhost:4173/pair#...`. The production `shadowpass-wallet.vercel.app` origin cannot reach local services.

## Claude MCP tools do not appear

Run `node .claude/skills/shadowpass-mvp/scripts/mvp.mjs configure --dry-run`
to confirm the three agent files are present. Launch the user-facing session with
`npm run claude:mvp`, not `claude mcp add`. The buyer and treasury MCP servers
are scoped to their subagents. If a previous Claude session is still open, exit
it before launching the orchestrator so newly created agent files are loaded.

## Process exits during startup

Run `logs` and inspect the last 200 lines. Common causes are PTAU mismatch, a port race, contract deployment failure, or an interrupted local setup cache. If the log identifies a corrupted runtime cache, ask before deleting `scripts/mvp/.runtime/`.

## Test passes but Touch ID is unavailable

The headless test is not a hardware passkey test. Use Chrome with Google Password Manager, open `http://localhost:4173`, and perform a separate supervised recording.
