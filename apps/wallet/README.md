# ShadowPass Wallet

用户端 PWA（#10、#11）。主演示环境为 Mac Chrome + Google 密码管理器 + Touch ID，Safari 为备用；链上流程可在 Anvil 或 Base Sepolia 运行。

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
npm run start -w @shadowpass/facilitator

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
| `VITE_MAILBOX_URL` | deployment 中的 `mailbox` | 凭证和恢复快照信箱，必须配置 |
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

1. 创建 passkey 后，钱包依次调用 facilitator 的 `join`、在浏览器生成 `main_reg` 证明并调用 `register`，得到七天内有效的根证书。
2. 入金支持两条路：
   - 一键领取固定 10 / 50 / 100，浏览器生成 `budget_mint` 证明，facilitator 代付 `faucetDeposit`。
   - MetaMask 等 EIP-1193 钱包连接 Anvil，本地生成 `budget_mint` 证明，外部钱包发送 `approve` 和 `deposit`。
3. 发卡可粘贴配对码，也可打开 `/pair#<code>`。每张卡签发 cert1、上链 `issue`、生成 `budget_transfer` 证明并上链转移预算。
4. 给 Agent 的票据用 Agent 的信箱公钥加密，管家找零票据用主人信箱公钥加密。交易回执中的 `NoteMemo` 必须与本地密文一致。
5. 授权树显示主人、管家和两张 Agent 卡的能力、额度、剩余、有效期与状态。恢复时从 `/slot` 取回种子，扫描 `NoteMemo` 重建票据。

Anvil 的 `faucetDeposit` 是整个代币合约每天一次，不是每个钱包一次。重复跑真实链 E2E 前要重启 `npm run dev:chain`，否则第二次会触发 faucet 限额。

## 证明产物

`apps/wallet/public/zk/circuits-v2/` 和 `circuits/build/` 都在 `.gitignore` 中，不从仓库提交。需要先在本地生成：

```bash
cd circuits
npm run build
npm run setup
npm run publish-artifacts -- v2
```

`setup` 需要本地 `artifacts/ptau/powersOfTau28_hez_final_18.ptau`。SDK 会用 `packages/sdk/src/artifact-hashes.ts` 校验 zkey 和 vk，该表由 `circuits/zk/MANIFEST.sha256` 生成。钱包当前需要的 `main_reg.zkey`、`budget_mint.zkey`、`budget_transfer.zkey` 及对应 vk/wasm 必须齐全。

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

`e2e:chain` 直接调用钱包 flows，覆盖开通、100 入金、PAY 40、TREASURY 50、信箱凭证同步、`wallet_status` 和恢复快照。`e2e:browser-chain` 在 Chrome、生产构建和 Vite preview 中重复同一流程，并检查授权树和 IndexedDB 中的 issue/transfer 哈希。两者使用 PRF 替身，不替代真实 Touch ID 的录屏验收。

真实 Touch ID 仍需人工验收：

1. Safari 打开 `http://localhost:5173`，用 Touch ID 创建，记录 macOS/Safari 版本和截图。
2. 锁定后用同一 passkey 解锁，确认签名钥指纹不变。
3. 在 Chrome 重复一次，记录 PRF 是否可用。
4. 清空站点数据后使用恢复码，确认公钥一致。

#11 的真实设备恢复录屏仍需人工补充。自动化已经验证恢复后的卡片数量和管家余额，但没有把该过程声称为真机录屏。
