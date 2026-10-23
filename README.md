# ShadowPass

**给 AI Agent 的隐私预付卡。** 用 Face ID 给你的任何 Agent（Claude、OpenClaw……）发一张卡：有额度、有用途限制、随时冻结。Agent 每一笔消费都瞒不了你，而商家和钱包商都不知道这张卡属于谁。

> 黑客松原型，基于 ZK-HADA 研究中的 ZK-DAC v9.2 委托电路。未经生产审计，可信设置仅为本地单次贡献，只用于测试网演示。

## 为什么

主流 Agent 钱包（Coinbase Agentic Wallets、Privy、Turnkey）让 Agent 不碰私钥，但：
- **钱包商看得到一切**：你授权了哪些 Agent、每一笔花在哪里；
- **商家和链上看得到付款人**：钱从你的地址付出，消费可以被串起来。

ShadowPass 保留同样的四方结构（用户、Agent、钱包商、商家）和同样的体验，但：

| | 主流方案 | ShadowPass |
|---|---|---|
| 商家 / 链上看到 | 你的地址 | 资金池里某个已授权的 Agent |
| 钱包商看到 | 全部授权和花费 | 只有入金金额 |
| 谁能对账 | 钱包商 | 只有你，用自己的查看钥，Agent 瞒不了 |
| 多级 Agent | 公开或不支持 | 零知识委托链，能力和有效期逐级收窄 |
| 吊销 | 钱包商侧 | 链上，不需要 Agent 配合 |

## Demo：采购 + 理财

```
Alice（7 天，100 USDC）
 └─ 管家（Alice 钱包里的分配钥） {PAY, TREASURY}   分配预算、签发和吊销 Agent
     ├─ 采购 Agent {PAY}             通过 x402 买报告、订阅新闻
     └─ 理财 Agent {TREASURY}        把闲置预算存入白名单金库，只能回到预先承诺的票据
```

被提示注入攻破的采购 Agent 碰不到理财资金；理财 Agent 付不了款。两支的每一笔都只有 Alice 能解密查看；出问题只吊销那一支。

## 架构

```mermaid
flowchart LR
  subgraph phone["用户钱包 · 手机 PWA"]
    PK["Passkey + PRF"] --> KEYS["签名钥 / 查看钥"]
  end
  subgraph agent["Agent 钱包 · 用户自己的电脑"]
    LLM["LLM"] -- MCP --> MCP["ShadowPass MCP server<br/>密钥 · 凭证 · 证明器"]
  end
  subgraph provider["钱包商（不持钥）"]
    FAC["x402 facilitator"]
    BOX["加密信箱"]
  end
  subgraph chain["Base Sepolia"]
    GATE["Gate + Groth16 verifier"]
    POOL["资金池 / 预算票据"]
    PAY["ShadowPayout / TreasuryAdapter"]
  end
  MER["商家 · x402 中间件"]
  KEYS -- 加密凭证 --> BOX --> MCP
  MCP -- "402 + 证明" --> MER -- verify/settle --> FAC --> GATE --> PAY --> MER
  GATE --> POOL
  GATE -- 主人密文事件 --> KEYS
```

## 仓库结构

| 路径 | 内容 | 状态 |
|---|---|---|
| `circuits/` | ShadowPass 电路（v9.2 + 主人查看钥 + 主人密文）、witness 生成器、测试、setup | ✅ |
| `contracts/` | Foundry：verifier、Gate、Registry、Payout、TreasuryAdapter | 🚧 |
| `packages/sdk/` | 链上状态同步、witness、证明、凭证包、信箱客户端（唯一实现，各方共用） | ⏳ |
| `packages/x402/` | `shadowpass` scheme 的 client / server / facilitator 类 | ⏳ |
| `packages/mcp/` | Agent 端 MCP server | ⏳ |
| `services/facilitator/` | x402 facilitator + 钱包交易代付 | ⏳ |
| `services/merchant-demo/` | 示例商家（官方 x402 中间件） | ⏳ |
| `services/mailbox/` | 加密信箱 | ⏳ |
| `apps/wallet/` | 用户钱包 PWA，部署到 shadowpass-wallet.vercel.app | ⏳ |
| `deployments/` | 各网络合约地址 | ⏳ |
| `spikes/` | 一次性实验及结论 | ✅ x402 自定义 scheme |
| `vendor/zk-hada-exp/` | 研究仓库的只读副本（来源见 `docs/PROVENANCE.md`） | 只读 |
| `docs/` | 产品方案、开发计划、接口规范、基线 | |

## 文档

- [产品方案](docs/PRODUCT.md)（含风险与边界）
- [开发计划与状态](docs/DEV_PLAN.md)
- [代码架构](docs/ARCHITECTURE.md)：monorepo 结构、依赖方向、SDK API、产物分发、CI
- [共享接口规范](docs/INTERFACES.md)：所有工单共同的约定
- [部署](docs/DEPLOY.md)：Vercel 项目配置、证明产物托管、常见报错
- [开发 Agent 工作约定](AGENTS.md)
- 工作拆分：见 Issues，总览在 tracking issue

## 当前数据（Apple M5 Pro，snarkjs 0.7.6）

| 电路 | 约束 | 公开输入 | 证明中位耗时 |
|---|---|---|---|
| D1（管家） | 60,801 | 15 | 0.89 s |
| D2（采购 / 理财） | 107,793 | 16 | 1.56 s |
| D3（下级 Agent） | 154,785 | 17 | 2.46 s |
| 注册 | 17,608 | 4 | 0.36 s |

D2 旧 A1 verifier 链上验证 291,606 gas；A2 verifier 的 gas 由合约工单复测。详见 `circuits/README.md`。

## 复现研究基线

```bash
cd vendor/zk-hada-exp/work/t4_contracts && npm ci && cd foundry && forge test --match-contract 'V92Test|V92PolicyTest'   # 45 tests
cd vendor/zk-hada-exp/work/t2_circuit_fix/zkdac_v7 && npm ci && cd ../zkdac_v9_2 && node scripts/smoke.mjs                 # needs build/, see docs/PROVENANCE.md
```

## 本地链

```bash
npm install
npm run dev:chain
```

脚本会启动 Anvil、部署全部合约、校验链上地址、从成功的广播产物写入 `deployments/anvil.json`，并给三个 Anvil 测试账户各发 `1000 spUSD`。`ANVIL_PORT` 同时决定启动端口和 RPC 地址；复用已有节点时会拒绝非 `31337` 的链。默认 Anvil 私钥只用于本地链。

重复运行会部署一套新合约并覆盖 `deployments/anvil.json`，不是幂等操作；不带 `--broadcast` 的模拟不会写部署文件。

需要测试网部署时，把 `DEPLOYER_PK`、`BASE_SEPOLIA_RPC` 放进本地 `.env`，然后运行：

```bash
set -a && source .env && set +a
export SHADOWPASS_NETWORK=base-sepolia
(cd contracts && forge script script/Deploy.s.sol:Deploy --rpc-url "$BASE_SEPOLIA_RPC" --broadcast) &&
  node scripts/record-deployment.mjs --rpc-url "$BASE_SEPOLIA_RPC"
```

部署脚本只接受 Anvil `31337` 和 Base Sepolia `84532`，其他链（包括主网）会直接拒绝。部署文件只在广播成功、所有回执成功且链上地址校验通过后生成。不要提交 `.env` 或任何测试网私钥。
