# 部署（Vercel）

钱包 PWA 部署在 **https://shadowpass-wallet.vercel.app**。这个域名同时承担两个职责：

1. 钱包页面的地址；
2. passkey 的 RP ID（写死在 `docs/INTERFACES.md`，不能改）。

预览部署（preview）的域名和 RP ID 不一致，**passkey 在 preview 上不可用**，只能在生产域名上测。

## 1. 项目配置

仓库是 npm workspaces monorepo，构建入口是 `apps/wallet`，不是仓库根目录。根目录直接跑 `npm run build` 会去编译 circom 电路（需要 `circom` 二进制和未进 git 的 `*.zkey`），在 Vercel 上必然失败。

所以下面两种配置二选一，仓库里两种 `vercel.json` 都已经准备好：

### A. Root Directory 留空（推荐，改动最少）

Vercel 项目 → Settings → General → **Root Directory**：留空（仓库根目录）。

> 别设成 `packages/sdk` 之类的子目录 —— 这个项目最初就是 `packages/sdk`，`npm ci` 会按 sdk 的依赖装（157 个包，没有 vite），构建报 `Cannot find package 'vite'`。API 改法：`PATCH https://api.vercel.com/v9/projects/<projectId>?teamId=<teamId>`，body `{"rootDirectory": null}`。

根目录的 `vercel.json` 会覆盖 Dashboard 里的构建设置：

```
Install Command:  npm ci
Build Command:    npm run build -w @shadowpass/wallet
Output Directory: apps/wallet/dist
```

> Vercel 构建时按 production 安装依赖，devDependencies 会被跳过（实测加 `--include=dev` 也没用）。所以**构建期需要的工具必须放 `dependencies`**——目前是 `apps/wallet` 里的 `vite`。新增构建插件（如 `@vitejs/plugin-react`）时同理。

### B. Root Directory 设为 `apps/wallet`

Vercel 项目 → Settings → General → **Root Directory**：`apps/wallet`。

此时 `apps/wallet/vercel.json` 生效，它先 `cd ../..` 回到仓库根再安装和构建（workspace 依赖 `@shadowpass/sdk` 只在 monorepo 里存在，不能在子目录单独安装）：

```
Install Command:  cd ../.. && npm ci
Build Command:    cd ../.. && npm run build -w @shadowpass/wallet
Output Directory: dist
```

> 两种配置不要混用。如果 Dashboard 里设了 Root Directory=apps/wallet，根目录的 `vercel.json` 会被忽略。

框架预设用 Vite（或 Other）都可以，`vercel.json` 已显式给出命令和产物目录。

## 2. 环境变量

静态占位页不需要环境变量。后续接入链上交互时再加，清单见 `.env.example`；其中 `SHADOWPASS_ARTIFACTS` 默认指向本域名的 `/zk/circuits-v<N>/`。

注意：只有 `VITE_` 前缀的变量会进浏览器包，密钥类变量（`DEPLOYER_PK`、`FACILITATOR_PK`）**绝不能**加 `VITE_`。

## 3. 证明产物

`circuits/scripts/publish-artifacts.sh` 把 wasm、zkey、vk 复制到 `apps/wallet/public/zk/circuits-v<N>/`（该目录 git-ignored，不进仓库）。

要在线托管时，必须在**部署前**生成产物，让它们出现在构建产物里。CI 里没有 circom 和 ptau，所以要么：

- 本地 `cd circuits && bash scripts/build.sh && npm run setup && bash scripts/publish-artifacts.sh` 后再部署；或
- 把产物放到外部存储 / OSS，改 `SHADOWPASS_ARTIFACTS` 指向它。

产物由 SDK 内置的哈希表校验（`packages/sdk/scripts/generate-artifact-hashes.mjs` 从 `circuits/zk/MANIFEST.sha256` 生成），不依赖托管方自报的 MANIFEST。

## 4. 验证

```bash
npm ci
npm run build -w @shadowpass/wallet      # 产物在 apps/wallet/dist
npm run typecheck                        # 所有 workspace
npx serve apps/wallet/dist               # 本地看效果
```

线上检查：

```bash
curl -sI https://shadowpass-wallet.vercel.app | head -1
```

## 5. 常见报错

| 报错 | 原因 | 处理 |
|---|---|---|
| `Cannot find package 'vite'` / `[UNRESOLVED_IMPORT] Could not resolve 'vite'` | Root Directory 指到了某个子包，`npm ci` 只装了那个包的依赖；或 devDependencies 被 production 安装跳过 | 把 Root Directory 设回仓库根；构建期工具（`vite`）放 `dependencies` |
| `No Output Directory named 'public' found` | Output Directory 用的是旧默认值 `public` | 按上面 A/B 设置产物目录 |
| `circom: command not found` | 在仓库根跑了全量 `npm run build` | 只构建 `-w @shadowpass/wallet` |
| `npm ci` 报 lockfile 不同步 | 改了依赖没提交 `package-lock.json` | 本地 `npm install` 后一起提交 |
| `404 Not Found - GET https://registry.npmjs.org/@shadowpass%2fsdk` | 根目录被设成 `apps/wallet` 且没 `cd ../..` | 用 B 里的 install command |
| 部署成功但 passkey 报 `SecurityError` | 在 preview 域名或 localhost 以外测试 | 用生产域名，RP ID 已写死 |
