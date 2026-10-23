# ShadowPass Wallet

用户端 PWA（#10–#12）。主演示环境为 Mac Chrome + Google 密码管理器 + Touch ID，Safari 为备用；链上流程已在 Anvil 验收，Base Sepolia 部署接线待后续工单。

## 开发

先启动本地链、facilitator 和信箱，再启动钱包。`dev-chain` 会部署合约并更新 `deployments/anvil.json`。

```bash
npm install

# terminal 1
npm run dev:chain

# terminal 2，测试环境放宽 faucet 次数；生产保持默认限流
FACILITATOR_PK="<从本地 .env 读取，不要提交>" \
SHADOWPASS_NETWORK=anvil \
ANVIL_RPC_URL=http://127.0.0.1:8545 \
RELAY_FAUCET_PER_DAY=100 \
RELAY_RATE_LIMIT=1000 \
node --import tsx services/facilitator/src/main.ts

# terminal 3
npm run dev:mailbox -w @shadowpass/wallet

# terminal 4
VITE_MAILBOX_URL=http://127.0.0.1:8787 npm run dev -w @shadowpass/wallet
```

本地访问 `http://localhost:5173`。Vercel 正式域名：

```text
shadowpass-wallet.vercel.app
```

`rpId` 按环境固定为 `localhost` 或 `shadowpass-wallet.vercel.app`。Vercel 预览域名不能使用 passkey，页面会明确禁用并提示，不会降级成普通密码登录。

Vercel 项目 Root Directory 设为 `apps/wallet`，仓库内 `vercel.json` 会回到 monorepo 根目录安装依赖并构建该 workspace。

本地钱包通过 Vite 的 `/facilitator` 同源代理访问 facilitator，默认目标为 `http://127.0.0.1:4022`。可用 `VITE_FACILITATOR_PROXY_TARGET` 改代理目标。这样浏览器不会直接跨域请求 relayer，也不需要给 facilitator 开放 CORS。

## 配置

| 变量 | 默认值 | 说明 |
|---|---|---|
| `VITE_NETWORK` | `anvil` | `anvil` 或 `base-sepolia`，决定读取哪个 deployment |
| `VITE_DEPLOYMENT_URL` | `/deployments/<network>.json` | 可覆盖 deployment JSON 地址 |
| `VITE_RPC_URL` | `http://127.0.0.1:8545` | Anvil RPC；Base Sepolia 使用 `https://sepolia.base.org` |
| `VITE_MAILBOX_URL` | deployment 中的 `mailbox` | 凭证和主人卡片记录信箱，必须配置 |
| `VITE_FACILITATOR_URL` | Anvil 为 `/facilitator` | facilitator 的 x402/relay 基础地址 |
| `VITE_ARTIFACTS_URL` | `/zk/circuits-v2` | wasm、zkey、vk 和 MANIFEST 的位置 |

`rpId` 与页面来源绑定。浏览器中应打开 `http://localhost:5173`，不要用 `127.0.0.1` 代替 passkey 演示地址。

## 密钥与存储

- Passkey PRF 输出为 32 字节；登录时只读取 `prf.results.first`，注册时才检查 `prf.enabled`。
- 信封、恢复码、HKDF 和 seed 派生全部调用 `@shadowpass/sdk` 的 `keys` 模块。
- IndexedDB 只保存 passkey metadata、SDK `SPW1` 信封和查看钥；PRF、seed、签名钥、管家钥不落盘。
- 恢复码为 20 位 Crockford Base32，mode 1 信封写入 §13 恢复槽；passkey 信封写入 credential-id 槽。
- 第二个 passkey 使用新的随机 user handle，并通过 `excludeCredentials` 排除已有凭证。

设置信箱服务：

```bash
VITE_MAILBOX_URL=http://localhost:8787
```

生产环境必须配置 `VITE_MAILBOX_URL`。未配置时页面会阻断开通，不使用内存槽冒充可恢复钱包。

## 开通、充值与发卡

1. 创建 passkey 后，钱包依次调用 facilitator 的 `join`、在浏览器生成 `main_reg` 证明并调用 `register`，得到约 31 天有效的根证书。根证书有效期按 UTC 天稳定生成，注册前先写入本地。根证书不可轮换；本地数据丢失或隔日重新打开时，通过 nullifier 查询已注册叶子并逐日回扫，找回原来的 cert0，绝不替换旧 lineage。钱包寿命目前硬性限制为 31 天，过期后会明确拒绝继续使用，轮换能力见 #49。
2. 入金支持两条路：
   - 一键领取固定 10 / 50 / 100，浏览器生成 `budget_mint` 证明，facilitator 代付 `faucetDeposit`。
   - MetaMask 等 EIP-1193 钱包连接 Anvil，本地生成 `budget_mint` 证明，外部钱包先向 token 发送 `approve`，再向 `Gate.deposit` 提交证明和密文备忘。
3. 发卡可粘贴配对码，也可打开 `/pair#<code>`。每张卡签发 cert1、上链 `issue`、生成 `budget_transfer` 证明并上链转移预算。
4. 给 Agent 的票据用 Agent 的信箱公钥加密，管家找零票据用主人信箱公钥加密。交易回执中的 `NoteMemo` 必须与本地密文一致。
5. 授权树显示主人、管家和各 Agent 卡的能力、额度、剩余、有效期与状态，并按 `Revocations` 链上状态展示吊销。恢复时从 `/slot` 取回种子，先扫描 `NoteMemo` 重建票据，再按 `cardId` 合并逐卡 `owner_card` 记录；记录必须通过由种子派生的 HMAC、签名、根关系和链上 `Issued` 事件核对。MAC 错误或缺失的记录直接丢弃，也不能推进 `seq`；已核验票据和凭证包不会被记录覆盖。
6. `budget_transfer` 代付前先保存 cert1、两张输出票据、备忘和 calldata；响应丢失时按所有 `cm1`/`cm2` 候选核链，不重复扣预算。遇到 `StaleRevokedRoot`/`StaleNoteRoot` 时用同一父票据重建证明并保留旧候选；遇到 `BudgetSpent` 时清除 pending 并提示重新选择票据。存在 pending 时界面明确显示那张卡，不能悄悄复用给另一条配对请求。凭证投递失败时卡片保留 `pending_delivery` 和完整加密凭证包，重试只重投原包。开通、入金、发卡、恢复和重投共用一个跨标签页钱包锁，拿到锁后重新读取最新本地账本。

## 账单、异常提醒与吊销

- 钱包只从链上 `OwnerCiphertext` 解出交易链，并匹配授权树中的任意 Agent 公钥；经签名校验且能追溯到父卡的 `delegated` 消息用于识别子 Agent。无法解密的陌生交易不会进入账单列表或计数。信箱 `receipt` 是未经认证的展示数据：`budgetNf`、交易哈希和金额必须同时匹配链上事件，才标记为“已上报”，链上状态始终是权威来源。
- 未上报提醒有 30 秒宽限期，避免诚实的 Agent 在交易确认与收据到达之间被误报；匹配收据到达后会撤销当前提醒。已提醒 ID 保存在本地 IndexedDB，刷新页面不会重复提醒历史记录。
- 账单页的异常规则保存在本地 IndexedDB，默认启用未上报、5 分钟超过 5 笔、单笔超过 20 USDC。页面每 7 秒增量拉取新块和信箱游标，并在标签页重新可见时立刻刷新；阈值按链上区块时间计算，避免本机与链上时钟偏移。
- 命中规则后页面展示全部当前提醒、发出提示音并闪烁标题栏；无用户手势时浏览器可能阻止声音，标题栏提醒仍会工作。
- 管家可以吊销任一 Agent 的 cert1；Alice 可以用签名钥和 `own_w` 吊销 cert0 整棵树。两种操作都调用 SDK `revokeCertInput` 生成 `main_revoke` 证明，再通过 facilitator 的 `revoke` relay 提交。
- 若另一个吊销先改变了 revoked root，钱包会重新同步状态并自动生成新证明重试，最多三次。
- 链上吊销不是立即冻结。Anvil 部署的宽限窗口是 10 秒，窗口内旧状态根仍可被 Gate 接受；页面会显示当前窗口长度，不会把它描述成立即生效。

Anvil 的 `faucetDeposit` 是整个代币合约每天一次，不是每个钱包一次。重复跑真实链 E2E 前要重启 `npm run dev:chain`，否则第二次会触发 faucet 限额。

## 证明产物

`apps/wallet/public/zk/circuits-v2/` 和 `circuits/build/` 都在 `.gitignore` 中，不从仓库提交。需要先在本地生成：

```bash
cd circuits
npm run build
npm run setup
npm run publish-artifacts -- v2
```

`setup` 需要本地 `artifacts/ptau/powersOfTau28_hez_final_18.ptau`。SDK 会用 `packages/sdk/src/artifact-hashes.ts` 校验 zkey 和 vk，该表由 `circuits/zk/MANIFEST.sha256` 生成。钱包当前需要的 `main_d2.zkey`、`main_reg.zkey`、`main_revoke.zkey`、`budget_mint.zkey`、`budget_transfer.zkey` 及对应 vk/wasm 必须齐全。

## 验证

```bash
npm run typecheck -w @shadowpass/wallet
npm test -w @shadowpass/wallet
npm run build -w @shadowpass/wallet
npm run e2e -w @shadowpass/wallet
```

`e2e` 先构建、再用带生产 CSP 的 `vite preview` 运行；使用本机 Chrome 和符合 iCloud 行为的 PRF 测试替身，覆盖两次 Touch ID 注册、不同 PRF 的第二 passkey、`/slot` 分页/恢复、CSP WebAssembly 和 PRF 不可用状态。临时截图写入忽略的 `apps/wallet/e2e-output/`，验收截图复制到 `apps/wallet/docs/e2e/`。

带真实链的验证需要先运行本地链、facilitator 和信箱：

```bash
npm run e2e:chain -w @shadowpass/wallet
npm run e2e:browser-chain -w @shadowpass/wallet
```

`e2e:chain` 直接调用钱包 flows，覆盖开通、100 入金、PAY 40、TREASURY 50、信箱凭证同步、`wallet_status` 和逐卡主人记录恢复。它随后用真实 `main_d2` 证明直接向 Anvil `ShadowGate.execute` 写一笔不上报的付款，验证账单归属和错误查看钥；再执行 Agent 吊销、整树吊销和 `TREASURY_SUPPLY`，并在宽限窗口后确认旧 `revoked` 根得到 `StaleRevokedRoot`。这里的直接 Gate 调用是故意不经过 MCP `pay` 的恶意 Agent 模拟，不等于完整 x402 交付链路。

`e2e:browser-chain` 在 Chrome、生产构建和 Vite preview 中重复开通与发卡，然后从 Node 侧提交同一笔真实 Gate 付款，检查页面在 30 秒内出现“未上报”警戒栏和标题栏闪烁，再通过 UI 生成吊销证明并显示 10 秒宽限窗口。两者使用 PRF 替身，不替代真实 Touch ID 的录屏验收；自动化也不能证明提示音一定播放，声音在浏览器自动播放策略下可能被阻止。

真实 Touch ID 仍需人工验收：

1. Chrome 打开 `http://localhost:5173`，使用 Google 密码管理器的 passkey 和 Touch ID 创建钱包，记录浏览器与 macOS 版本。
2. 锁定后用同一 passkey 解锁，确认签名钥指纹不变；再刷新页面确认卡片和余额仍在。
3. 在全新 Chrome 配置文件里分别用恢复码和同步 passkey 恢复，确认授权树和余额一致并录屏。
4. 真实走完开通、100 入金、配对发卡、MetaMask 入金、断网重投和双标签页并发发卡。

2026-10-23 已在 Chrome 155.0.8059.85（arm64）/ macOS 26.4 + Google 密码管理器上由用户实测 passkey 注册成功，登录时 PRF 可用。该证据不覆盖 #11 的发卡、MetaMask 入金、断网重投或恢复录屏，这些仍待人工验收。

## 已知部署边界

- 本轮完成的是 Anvil 真链验收。Base Sepolia 的 facilitator CORS、Vercel `/facilitator` 代理和生产证明产物分发尚未接通，转后续部署工单处理。
- deployment 配置加载失败时只禁用链上控制台；passkey 创建、解锁、同步 passkey 和恢复码恢复仍可使用。
