# 开发计划

三人分工，48 小时。检查点在第 4 小时和第 24 小时。状态随进展更新。

**工作已拆成 GitHub Issues #2–#13，总览和依赖图见 #14。** 下面的排期是原始计划，以 Issues 为准。

## 状态

| 项 | 状态 |
|---|---|
| 新仓库、vendor 研究资产、基线（45/45 forge、冒烟、证明耗时） | ✅ `caf89e0`，见 `docs/BASELINE.md` |
| x402 自定义 scheme spike（第 4 小时检查点） | ✅ 通过，`568452b`，不启用回退 |
| A1 电路：主人密文 + 根凭证绑定查看公钥 | ✅ 26/26 负例、D2 105,606 约束、证明 1.57 s、verifier 291,606 gas，见 `circuits/README.md` |
| 工单拆分（#2–#13，总览 #14）、README、`docs/INTERFACES.md`、`AGENTS.md` | ✅ |
| 域名（passkey RP ID） | ⏳ 待定（可用 `<项目名>.vercel.app`） |
| Aave 在 Base Sepolia 是否可用 | ⏳ 待确认，否则用模拟 ERC-4626 金库 |

## 排期

| 时段 | A：电路与合约 | B：Agent Kit 与 facilitator | C：用户钱包 PWA |
|---|---|---|---|
| 0–4h | ✅ 新仓库、基线 | ✅ x402 spike；抽出 `prover.ts` | PWA 骨架、域名和 RP ID、passkey |
| 4–12h | ✅ 电路：主人密文、根凭证绑定查看公钥；编译、setup、实测约束 | MCP server 骨架：`wallet_status`、`pay`；witness | 种子包裹、两把钥派生、circomlibjs 签名 |
| 12–24h | 合约：`deposit`、签发树开放、Registry 开放、`ShadowPayout`、`TreasuryAdapter` + 模拟金库；部署脚本 | facilitator `/verify` `/settle`；**里程碑：Claude 里一句话经真实 x402 中间件完成链上付款** | 扫码发卡、信箱下发凭证 |
| 24–36h | 负例：篡改主人密文、加密给他人；吊销流程 | `delegate`、理财工具、收据推送、恶意模式 | 账单扫描与解密、授权树视图、异常规则、Web Push |
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
