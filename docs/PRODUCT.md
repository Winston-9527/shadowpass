# ShadowPass 产品方案

> 给 AI Agent 的隐私预付卡。用户用 Face ID 给自己的任何 Agent 发一张卡：有额度和用途限制、可随时冻结、Agent 每一笔消费都瞒不了主人，而商家和钱包商都不知道这张卡属于谁。

完整版（含竞品分析、图表）：`docs/product-plan.html`，在线版 https://claude.ai/artifact/9z7TQfc9Bh5v1NnbUbxxy6 。本文是仓库内的权威摘要，包含在线版之后确定的 **采购 + 理财双分支用例**。

## 1. 问题

- 主流 Agent 钱包（Coinbase Agentic Wallets、Privy、Turnkey）：私钥在钱包商的 TEE/MPC 里，策略引擎在钱包商服务器上，**钱包商看得到全部授权关系和花费**。
- 钱从用户地址付出，**商家和链上观察者能把用户的所有消费串起来**。

## 2. 承诺

| 承诺 | 机制 |
|---|---|
| 对外隐私 | 共享资金池付款，商家只知道“池子里某个已授权的 Agent” |
| 可控授权 | 额度、用途（能力位）、有效期、子 Agent 层级写在凭证里，由 ZK 证明和链上 Gate 强制 |
| 主人可审计 | 电路强制每笔交易附上只有主人查看钥能解开的委托链密文；账单来自链上，不来自 Agent 自述 |
| 无人持有后门 | 默认档位钱包商不持有任何解密钥 |
| 即插即用 | Agent 侧是 MCP 插件；商家侧是 x402 自定义 scheme + facilitator |

## 3. Demo 用例：采购 + 理财双分支

```
Alice（7 天，100 USDC）
 └─ 管家 Agent    {PAY, TREASURY}   分配预算，不上网
     ├─ 采购 Agent {PAY}             买报告、订阅新闻（x402）
     └─ 理财 Agent {TREASURY}        闲置预算存入白名单金库，只能回到预先承诺的票据
```

- 能力位沿链必须是子集（`zkdac_chain_v9.circom:188`），有效期不能变长（`:189`）：分权由电路强制。
- 最小权限：读网页、最易被提示注入的采购 Agent 碰不到理财资金；理财 Agent 不能付款给任何商家。
- 故障隔离：只吊销出问题的一支。主人统一对账：两支的每一笔都加密给 Alice。
- 诚实说明：100 美元一周的利息约 0.09 美元，与两笔 `execute` 的 gas 同量级。演示时换成团队级金库（如 1 万美元），重点是“Agent 碰得到钱但拿不走钱”。Uniswap LP 需要多币种票据（改电路），只讲不做。

## 4. 参与方（四方，无新增机构）

| 角色 | 持有 | 做什么 | 看得到 |
|---|---|---|---|
| 用户 | 手机 PWA：passkey 解锁的根种子 → 签名钥、查看钥 | 发卡、充值、看账单、吊销 | 自己整棵树的全部花费 |
| Agent | MCP server（用户控制的机器）：自己的 `holder_sk`、凭证、预算票据 | 授权范围内付款、向下委托 | 自己这一支 |
| 商家 | x402 中间件 + `payTo` | 报价、收款、交付 | “池子里某个已授权 Agent”付了多少 |
| 钱包商 | **不持钥** | 托管前端、运行 facilitator（代付 gas）、加密信箱、无内容推送 | 入金金额；商家的结算请求；信箱密文 |

## 5. 两个钱包、三条通道

- 用户钱包（手机）与 Agent 钱包（MCP server）互不持有对方的钥。
- ① 配对：MCP 终端显示二维码（Agent 公钥 + 信箱地址）→ 手机签发 → 凭证和预算票据加密放入信箱。
- ② 收据：MCP → 信箱 → 手机，不可信也无妨，以链上解密为准。
- ③ 链上：手机直接读事件并解密；**吊销不需要 Agent 配合**。
- Agent 钱包必须在用户控制的机器上：证明输入含整条委托链，托管在钱包商处会泄露 Alice。

## 6. 两把钥

| | 签名钥 | 查看钥 |
|---|---|---|
| 能力 | 签发/吊销、分配预算 | 解密“哪一笔是我哪个 Agent 花的” |
| 存放 | 不落盘，Face ID 时派生 | 本机 IndexedDB，供后台扫描 |
| 泄露后果 | 能动钱 | 只是被看到 |

```
seed     = 随机 256 bit
wrap_i   = AES-GCM(HKDF(PRF(passkey_i, "shadowpass-v1")), seed)   // 每个 passkey 一份，可加恢复码
sk_sign  = HKDF(seed, "sign") mod l, ≠ 0
sk_view  = HKDF(seed, "view") mod l, ≠ 0
```

## 7. 受理网络：x402 facilitator

- 标准 `exact` 依赖付款人签 EIP-3009，资金池合约签不了 → 新增 `shadowpass` scheme。
- 付款凭据 = `Gate.execute` 全部参数；`action.target = ShadowPayout`，`params = abi.encode(payTo, 要求哈希)`，被 `ctx_hash` 绑进证明。
- facilitator：`/supported`、`/verify`（金额、收款方、`eth_call` 模拟）、`/settle`（提交 `execute`、代付 gas）。兼任 relayer；看到的是商家 IP 而不是 Agent IP；偷不走钱，最多拒绝结算。
- 采用 upfront 流程（先结算再交付）。spike 已验证官方 SDK 2.28.0 支持（`spikes/x402-scheme/`）。
- 单笔约 50 万 gas，主网约几美分：零点几美分的按次调用不经济，规模化靠会话型 scheme（路线图）。

## 8. 工程决策

| 项 | 决定 |
|---|---|
| 用户端 | Web PWA，手机优先 |
| Agent 端 | MCP server，用户自己的电脑 |
| 登录 | Passkey + PRF 包裹随机种子 |
| 验证 | 链上 Gate 唯一有约束力；MCP 提交前预验证；facilitator `eth_call` 预检；公开复核页 |
| 部署 | 自有域名（passkey RP ID，定了不能换）；Vercel/Cloudflare Pages；facilitator 和信箱用 serverless |
| 网络 | Base Sepolia（84532），Anvil 兜底 |

## 9. 风险与边界

| 项 | 现状 |
|---|---|
| 电路正确性 | 研究电路多轮审计；主人密文是新改动，需重跑负例 |
| 可信设置 | 单次本地 phase-2，仅 demo |
| 吊销后预算冻结 | 被吊销凭证名下预算无人可花，父级无回收路径（`test_GB7_revocationFreezesBudget`） |
| 单笔成本与延迟 | 约 50 万 gas；证明 ~1.5 s（D=2）+ 一个区块 |
| 匿名集 | 黑客松时几乎为 1，demo 预置模拟存款并说明 |
| Agent 托管位置 | 必须用户控制，否则泄露委托链 |
| 元数据 | 商家看到 Agent IP；委托深度可从密文长度推出 |
| 吊销生效 | 状态根有宽限窗口，demo 设为几秒 |
| 剩余中心化点 | Gate `setMethod` 由管理员配置 |
