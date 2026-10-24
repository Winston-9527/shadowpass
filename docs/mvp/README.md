# ShadowPass MVP 产品演示

这条演示完全使用产品组件：钱包 PWA、两个 MCP stdio server、facilitator、信箱、x402 商家和本地 Anvil。协议层对照面板仍保留在 `docs/demo/`，可作为兜底演示。

## 一键启动

前置条件与根 README 相同：Node 24、Foundry、Circom 2.2.3、`jq`、Playwright Chrome。准备好约 2 GB 磁盘空间和 PTAU。

```bash
npm install
npx playwright install chrome
SHADOWPASS_PTAU=/absolute/path/to/powersOfTau28_hez_final_18.ptau \
  npm run demo:mvp
```

也可以直接运行 `bash scripts/mvp/up.sh`。命令会：

1. 编译并 setup `main_d2`、`main_reg`、`main_revoke`、`budget_transfer`、`budget_mint`。
2. 启动 `anvil --block-time 1`，部署合约，并由 facilitator 预置 20 个金额 8–99 spUSD 的匿名集存款。
3. 启动 facilitator、SQLite 信箱、x402 商家和钱包 preview。
4. 创建 buyer/treasury 两个本地 MCP store，输出 Claude Code 命令、Claude Desktop JSON 和两个配对链接。

默认地址：

| 组件 | 地址 |
|---|---|
| 钱包 | `http://localhost:4173` |
| Anvil RPC | `http://127.0.0.1:8545` |
| facilitator | `http://127.0.0.1:4022` |
| 信箱 | `http://127.0.0.1:8787` |
| 商家 | `http://127.0.0.1:4021` |

端口可用 `MVP_WALLET_PORT`、`MVP_ANVIL_PORT`、`MVP_FACILITATOR_PORT`、`MVP_MAILBOX_PORT`、`MVP_MERCHANT_PORT` 覆盖。

## 本地产物信任

MVP 在自己的 `.runtime/` 中缓存本轮 setup 生成的 WASM、zkey、vk 和 manifest。本地 setup 每次 phase-2 都会产生不同 zkey，因此编排会显式设置：

```text
SHADOWPASS_TRUST_LOCAL_ARTIFACTS=1
VITE_TRUST_LOCAL_ARTIFACTS=1
```

这只适用于用户自己生成的本地目录。生产环境继续保持默认的 SDK 内置哈希校验，不能信任远端返回的 manifest。

## 接 Claude

保持 `demo:mvp` 进程运行，复制终端打印的 `claude mcp add shadowpass-buyer ...` 和 `claude mcp add shadowpass-treasury ...` 命令。配置已经包含：

- `SHADOWPASS_RPC_URL`
- `SHADOWPASS_MAILBOX`
- `SHADOWPASS_FACILITATOR`
- `SHADOWPASS_ARTIFACTS`
- `SHADOWPASS_MAX_PAYMENT`

在钱包中分别使用输出的 buyer、treasury 配对链接或配对码发卡。详细逐步操作见 [SCRIPT.md](SCRIPT.md)。

## 无界面 E2E

```bash
SHADOWPASS_PTAU=/absolute/path/to/powersOfTau28_hez_final_18.ptau \
  npm run test:mvp
```

它会驱动真实钱包 PWA、两个 MCP stdio 进程、真实 x402 付款、理财存取、账单提醒、吊销和隔离检查。最近一次实测总耗时 69.7 秒，并逐笔核对 20 个模拟入金均由 facilitator 代付；所有交易哈希会写入结果 JSON。

## 数据与清理

- 运行数据：`scripts/mvp/.runtime/`，已忽略。
- 每次启动会清空 `.runtime/agents/` 和本地 SQLite 信箱，但保留电路 setup 缓存。
- `Ctrl-C` 会关闭钱包 preview、信箱、facilitator、商家和本轮启动的 Anvil。
- `deployments/anvil.json` 与临时 verifier 覆盖会在启动器内保存并恢复。

## 人工录屏

真机 Chrome + Google 密码管理器 + Touch ID 的讲解录屏需要人工完成，检查表见 [RECORDING.md](RECORDING.md)。自动 E2E 使用 Playwright passkey 替身，不能替代真机录屏。
