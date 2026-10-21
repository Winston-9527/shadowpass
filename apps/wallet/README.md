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

- Passkey PRF 输出为 32 字节。
- seed 用 PRF 派生的 AES-256-GCM key 包裹，包裹记录和查看钥存 IndexedDB。
- 签名钥、管家钥、信箱钥只在内存中；锁定时显式清零。
- 恢复码是自包含的 `SP1-` 令牌，包含 scrypt 保护的 seed 密文，不依赖旧浏览器 IndexedDB。
- 第二个 passkey 会在同一 seed 上增加一份包裹。

### SDK #6 临时适配

`@shadowpass/sdk` 的 `keys` 模块尚未交付，本 PR 在 `src/wallet/keys.ts` 保留 SDK 适配入口，并用明确标注的 provisional keys 让 #10 的 UI 和 passkey 流程可独立测试。设置：

```bash
VITE_ALLOW_PROVISIONAL_KEYS=true
```

`#6` 合并后应优先调用其 `deriveKeys(seed)`；当前 provisional 输出不能用于后续链上凭证。

## 验证

```bash
npm run typecheck -w @shadowpass/wallet
npm test -w @shadowpass/wallet
npm run build -w @shadowpass/wallet
npm run e2e -w @shadowpass/wallet
```

`e2e` 使用本机 Chrome 和一个注入的 PRF 测试替身，覆盖创建、同一 passkey 解锁、第二 passkey、自包含恢复码和 PRF 不可用状态。截图写入 `apps/wallet/e2e-output/`，不提交 git。

真实 Touch ID 仍需人工验收：

1. Safari 打开 `http://localhost:5173`，用 Touch ID 创建，记录 macOS/Safari 版本和截图。
2. 锁定后用同一 passkey 解锁，确认签名钥指纹不变。
3. 在 Chrome 重复一次，记录 PRF 是否可用。
4. 清空站点数据后使用恢复码，确认公钥一致。
