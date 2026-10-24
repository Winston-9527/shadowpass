# 开发计划

三人分工，48 小时。检查点在第 4 小时和第 24 小时。状态随进展更新。

**工作已拆成 GitHub Issues #2–#13，总览和依赖图见 #14。** 下面的排期是原始计划，以 Issues 为准。

## 状态

| 项 | 状态 |
|---|---|
| 新仓库、vendor 研究资产、基线（45/45 forge、冒烟、证明耗时） | ✅ `caf89e0`，见 `docs/BASELINE.md` |
| x402 自定义 scheme spike（第 4 小时检查点） | ✅ 通过，`568452b`，不启用回退 |
| A1 电路：主人密文 + 根凭证绑定查看公钥 | ✅ 26/26 负例、D2 105,606 约束、证明 1.57 s、verifier 291,606 gas，见 `circuits/README.md` |
| A2 电路：签发树 LeanIMT + 吊销适配 + D3/预算电路 | ✅ #2，44/44 witness、7 电路各 5/5 真实证明且全部公开输入扰动拒绝，见 `circuits/README.md` |
| B1 SDK：五棵树同步、witness、证明、票据备忘、凭证包 | ✅ #6，20/20 单元测试通过；Anvil 集成跳过（依赖 #3/#5）；Chrome D2 真实证明约 1.6 s |
| C1 钱包骨架：PWA、passkey + PRF、SDK key 派生、`/slot` 恢复 | 🚧 #10，等待真实 Chrome/Google 密码管理器与 Vercel 证据 |
| C2 钱包开通与发卡：群组、注册证明、充值、配对发卡、授权树、恢复 | 🚧 #11，第三轮 review 修复已完成；真实链与双标签页自动化通过；真机 MetaMask/Touch ID/扫码与 Base Sepolia 待补 |
| C3 钱包账单与吊销：主人密文解密、收据对账、异常提醒、Agent/整树吊销 | 🚧 #12，55/55 单元测试；增量同步、信箱游标、委托归属、30 秒防误报、页面关闭后补报、双标签页两次 Chrome 链测试、吊销竞争重试和真实 D2 付款通过；真机录屏待补 |
| B2 MCP：stdio、本地密钥、配对、凭证同步、x402 付款与状态 | 🚧 #54：46/46 测试；理财 `supply/status/withdraw` 已接 quote、真实 D2、relay、找零/仓位落盘和链上票据恢复；anvil 并发存入、到期赎回与主人三跳解密通过；`delegate` 待后续 |
| B4 加密信箱：消息箱与独立备份槽、SQLite/Upstash、限流、serverless 入口 | 🚧 #9，审查修复与服务端测试通过；固定线上地址和真实 Upstash 待验收 |
| A3 核心合约：Gate、Group、Registry、Revocations | ✅ #3，真实证明 30/30；gas 中位数：register 346,668、issue 98,604、deposit 360,961、transferBudget 479,017、execute D2 549,916、revoke 254,361 |
| A4 应用合约：Payout、TreasuryAdapter、MockVault、ShadowToken | ✅ #4，Foundry 46/46；真实 Gate `TREASURY_SUPPLY → withdraw → NoteMemo` 集成通过 |
| A5 部署：Anvil 一键环境 | 🚧 #5，Anvil MVP 实际部署和测试币发放通过，见 #37；Base Sepolia 与 D2 真实证明待做 |
| 工单拆分（#2–#13，总览 #14）、README、`docs/INTERFACES.md`、`AGENTS.md` | ✅ |
| 演示前加固 #46（必做）：facilitator 启动、领币限流、CORS、合约 faucet 与产物托管说明 | ✅ 启动冒烟、失败不扣额度、每日可配置、CORS 预检、10,000/100 spUSD 边界和外部产物托管文档完成 |
| #46 后续加固：本地签名、回执 pending、队列上限、metrics、MCP 状态 TTL 与配对生命周期 | ✅ 全仓 typecheck/test、merchant E2E 与钱包构建通过；Anvil 空闲区块实际从 36 增至 41，CI 见后续 PR |
| MVP 产品演示 #55：钱包 PWA + 单主 Agent/双 subagent + facilitator + 信箱 + 商家 | 🚧 真实 Claude 单会话调度两个工具面隔离的 subagent 已通过；20 人代付匿名集和 MCP stdio E2E 通过（69.6 秒）；Chrome/Touch ID 真机讲解录屏待人工完成 |
| Agent 链上交互浏览器：限额、执行交易、nullifier、主人密文和匿名集 | ✅ 支持快照、watch 和 JSON 输出；只读公开链字段与 Agent 公开状态 |
| 协议层演示 #13：一键编排、票据层匿名集、采购/理财双分支、隐私剖面、对照面板、剧本与备用录屏 | ✅ 20 笔 5–100 spUSD 模拟入金全走 relay；三次采购密文唯一、真实能力拒绝、理财赎回 E2E 通过；桌面/移动端隐私剖面与交易回执验收通过；24.24 秒录屏见 `docs/demo/` |
| 域名（passkey RP ID） | ✅ `shadowpass-wallet.vercel.app` |
| monorepo 骨架、`docs/ARCHITECTURE.md`、CI | ✅ |
| 演示形态：不做原生 App；**Chrome + Google 密码管理器 + Touch ID**（PRF 已实测可用）；Safari 备用（未测）；Web Push 选做 | ✅ 2026-10-23 |
| Aave 在 Base Sepolia 是否可用 | ✅ 不是 ERC-4626，改用 MockVault（#23） |

## 排期

| 时段 | A：电路与合约 | B：Agent Kit 与 facilitator | C：用户钱包 PWA |
|---|---|---|---|
| 0–4h | ✅ 新仓库、基线 | ✅ x402 spike；抽出 `prover.ts` | PWA 骨架、域名和 RP ID、passkey |
| 4–12h | ✅ 电路：主人密文、根凭证绑定查看公钥；编译、setup、实测约束 | MCP server 骨架：`wallet_status`、`pay`；witness | 种子包裹、两把钥派生、circomlibjs 签名 |
| 12–24h | 合约：`deposit`、签发树开放、Registry 开放、`ShadowPayout`、`TreasuryAdapter` + 模拟金库；部署脚本 | facilitator `/verify` `/settle`；**里程碑：Claude 里一句话经真实 x402 中间件完成链上付款** | 配对链接发卡、信箱下发凭证 |
| 24–36h | 负例：篡改主人密文、加密给他人；吊销流程 | `delegate`、理财工具、收据推送、恶意模式 | 账单扫描与解密、授权树视图、异常规则、页面内提醒（Web Push 选做） |
| 36–44h | 部署 Base Sepolia、Anvil 兜底 | 录备用视频 | 对照面板、理财仓位展示、文案 |
| 44–48h | 一起排练三遍 | | |

回退：第 24 小时端到端未通 → 用不改电路的 v9.2 原版，只演示发卡、付款、吊销，主人对账改为讲解。

## A1 电路改动规格

位置：`circuits/`（我们自己的 fork，从 `vendor/.../zkdac_v9_2/circuits` 复制），不改 `vendor/`。

1. **根凭证绑定查看公钥**：`cert[0]` 的哈希从 `Poseidon(7)` 变为 `Poseidon(9)`，追加 `vpk.x, vpk.y`。只改 hop 0；其他 hop 不变。新增私有输入 `own_w[2]`，`vpk = 8 * own_w`（落在素数阶子群），`own_w` 在曲线上，`vpk ≠ 单位元`。注册电路的 `leaf0` 同步改为 Poseidon(9)，否则别人可以拿走注册证明换成自己的 vpk。
2. **主人密文**：复用 `AccHybridCompressed(NA)`，公钥为 `vpk`，加密 `ent[0..D]`；新增公开输出组 `own_c1x, own_c1y, own_c2x, own_c2y, own_e[NA], own_esign`。
3. **去掉全局 `tpk` 密文**：删除 `accC` 和 `tpk`、`acc_*` 公开输入（个人版）。
4. 验收：
   - 编译，记录约束数和公开输入数（对比 v9.2：D2 105,434 约束、18 个公开输入）。实测：D2 105,606 约束、16 个公开输入。
   - 冒烟：诚实实例接受；主人用 `sk_view` 解出 `ent[0..D]`。
   - 负例：主人密文任一字 +1 → 拒绝；用别的公钥加密 → 拒绝；`vpk` 与 `cert[0]` 不一致 → 拒绝；`vpk` 不在曲线上 → 拒绝。
   - 新 setup（D=1,2），证明耗时，导出 verifier，记录哈希。
