# ShadowPass Wallet

用户端 PWA 骨架（#10）。桌面优先，Mac Safari + Touch ID 为主演示，Mac Chrome 为备用。

## 开发

```bash
npm install
npm run dev -w @shadowpass/wallet
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

未配置时使用内存槽，只用于本地 UI 开发，不能完成跨浏览器恢复。

## 验证

```bash
npm run typecheck -w @shadowpass/wallet
npm test -w @shadowpass/wallet
npm run build -w @shadowpass/wallet
npm run e2e -w @shadowpass/wallet
```

`e2e` 使用本机 Chrome 和一个符合规范字段的 PRF 测试替身，覆盖创建、同一 passkey 解锁、第二 passkey、恢复槽和 PRF 不可用状态。截图写入 `apps/wallet/e2e-output/`，不提交 git。

真实 Touch ID 仍需人工验收：

1. Safari 打开 `http://localhost:5173`，用 Touch ID 创建，记录 macOS/Safari 版本和截图。
2. 锁定后用同一 passkey 解锁，确认签名钥指纹不变。
3. 在 Chrome 重复一次，记录 PRF 是否可用。
4. 清空站点数据后使用恢复码，确认公钥一致。
