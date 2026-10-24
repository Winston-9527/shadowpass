# ShadowPass Wallet

用户端 PWA 骨架（#10）。桌面优先，Mac Safari + Touch ID 为主演示，Mac Chrome 为备用。

## 开发

```bash
npm install
npm run dev:mailbox -w @shadowpass/wallet
# another terminal
VITE_MAILBOX_URL=http://127.0.0.1:8787 npm run dev -w @shadowpass/wallet
```

本地访问 `http://localhost:5173`。Vercel 正式域名：

```text
shadowpass-wallet.vercel.app
```

`rpId` 按环境固定为 `localhost` 或 `shadowpass-wallet.vercel.app`。Vercel 预览域名不能使用 passkey，页面会明确禁用并提示，不会降级成普通密码登录。

Vercel 项目 Root Directory 设为 `apps/wallet`，仓库内 `vercel.json` 会回到 monorepo 根目录安装依赖并构建该 workspace。

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

设置 facilitator 与证明产物来源：

```bash
VITE_FACILITATOR_URL=http://127.0.0.1:4022
VITE_SHADOWPASS_ARTIFACTS=https://shadowpass-wallet.vercel.app/zk/circuits-v2
```

生产环境的 facilitator 地址通过 Vercel 项目环境变量配置；同源代理时也可设为 `/facilitator` 并使用
`vercel.json` rewrite。证明产物托管方式见 `docs/DEPLOY.md` §4。

生产环境必须配置 `VITE_MAILBOX_URL`。未配置时页面会阻断开通，不使用内存槽冒充可恢复钱包。

## 验证

```bash
npm run typecheck -w @shadowpass/wallet
npm test -w @shadowpass/wallet
npm run build -w @shadowpass/wallet
npm run e2e -w @shadowpass/wallet
```

`e2e` 先构建、再用带生产 CSP 的 `vite preview` 运行；使用本机 Chrome 和符合 iCloud 行为的 PRF 测试替身，覆盖两次 Touch ID 注册、不同 PRF 的第二 passkey、`/slot` 分页/恢复、CSP WebAssembly 和 PRF 不可用状态。临时截图写入忽略的 `apps/wallet/e2e-output/`，验收截图复制到 `apps/wallet/docs/e2e/`。

真实 Touch ID 仍需人工验收：

1. Safari 打开 `http://localhost:5173`，用 Touch ID 创建，记录 macOS/Safari 版本和截图。
2. 锁定后用同一 passkey 解锁，确认签名钥指纹不变。
3. 在 Chrome 重复一次，记录 PRF 是否可用。
4. 清空站点数据后使用恢复码，确认公钥一致。
