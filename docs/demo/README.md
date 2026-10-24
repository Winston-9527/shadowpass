# ShadowPass 演示环境

这个演示把两条真实链路串在同一个本地环境里：

- 采购 Agent 通过 x402 向示例商家购买市场报告，由 facilitator 代付并调用 `ShadowGate.execute`。
- 理财 Agent 用 `TREASURY_SUPPLY` 将预算存入白名单 ERC-4626 金库，到期后赎回，并把本金和收益生成到预先承诺的票据。
- Alice 用自己的查看钥解密两条分支的委托链，证明 Agent 的每笔操作都能被主人对账。
- 交易隐私剖面并排展示公开链回执和 Alice 回执，用票据层点阵、身份层匿名集和真实 nullifier 说明当前匿名边界。
- 页面右侧的对照面板解释同样的操作如果走 ERC-7710、Smart Account 或 session key，链上通常能看到什么。

当前交付是**协议层演示**：使用 SDK、合约和 facilitator 串起真实链路，不包含钱包 PWA passkey 或 MCP/Claude 操作。完整钱包加 MCP 的讲解版会等 #44、#47、#48 合并后另开 PR。

演示中的 20 个模拟用户只扩展票据层匿名集；根凭证身份层仍只有 Alice，页面会明确显示这一限制。凭证、票据和预算都是本地预置数据。采购、存款、赎回、x402 结算和 ZK 验证则是 Anvil 上的真实交易。

## 前置条件

- Node.js 24 或更高版本，仓库根目录执行 `npm install`。
- Foundry：`anvil`、`cast`、`forge` 在 `PATH` 中。
- Circom 2.2.3。
- `jq`、`curl` 和 `bash`。
- Playwright Chromium，用于浏览器验收和备用录屏：`npx playwright install chromium`。
- 首次构建需要约 2 GB 可用磁盘和网络，用于下载 302,072,984 字节的 Hermez PTAU。下载支持断点续传和重试。

检查环境：

```bash
node --version
circom --version
anvil --version
cast --version
forge --version
jq --version
```

Circom 2.2.3 可按官方方式安装；macOS 可用：

```bash
cargo install --git https://github.com/iden3/circom.git --tag v2.2.3 circom
```

## 一键启动

在仓库根目录执行：

```bash
npm install
bash scripts/demo/run.sh
```

首次运行会依次完成：

1. 从 `https://circom.info/` 校验或断点续传下载 `powersOfTau28_hez_final_18.ptau`，并检查 SHA-256。
2. 编译演示实际使用的 `main_d2`、`main_reg`、`budget_transfer`、`budget_mint`。
3. 执行 Groth16 setup，并核对产物 manifest。
4. 启动 Anvil，部署合约。
5. 创建 20 个独立模拟账户，各自入金 5–100 spUSD；这些入金也统一由 facilitator relay 发送。
6. 通过 facilitator relay 注册 Alice 根凭证、签发卡、入金和划拨预算，再启动三个本地 HTTP 服务。

终端出现以下内容后，打开 `http://127.0.0.1:4179`：

```text
[demo] 演示面板 http://127.0.0.1:4179
[demo] Gate 0x...
```

首次全量构建和 setup 已实测约 65 秒，20 笔模拟入金与演示初始化约 1 分钟；完整冷启动在 30 分钟验收窗口内。已有匹配产物时，脚本会直接命中 `.runtime/` 缓存。

按 `Ctrl-C` 会关闭演示服务。脚本自己启动的 Anvil 会一并停止；如果复用了已有 Anvil，则不会停止外部进程。

## 环境变量

| 变量 | 默认值 | 用途 |
|---|---|---|
| `ANVIL_PORT` | `8545` | 本地链端口 |
| `SHADOWPASS_DEMO_PORT` | `4179` | 演示面板端口 |
| `SHADOWPASS_MERCHANT_PORT` | `4021` | x402 示例商家端口 |
| `SHADOWPASS_FACILITATOR_PORT` | `4022` | facilitator 端口 |
| `SHADOWPASS_PTAU` | 空 | 本地 PTAU 的绝对路径；仍会校验哈希 |
| `SHADOWPASS_PTAU_URL` | `https://circom.info/powersOfTau28_hez_final_18.ptau` | PTAU 下载地址，支持 Range 续传 |
| `SHADOWPASS_BUILD_DIR` | `circuits/build` | 复用已构建电路产物的目录 |
| `SHADOWPASS_ZK_DIR` | `circuits/zk` | 复用 vk 和 verifier 的目录 |
| `SHADOWPASS_TRUST_BUILD=1` | 空 | 仅复用 manifest 校验通过的显式产物；不绕过哈希 |

不要提交 `.env`、私钥、助记词、zkey、PTAU 或 `build/`。演示使用 Anvil 公开开发私钥，只允许连接本地链。

当前演示的主人和 Agent 密钥都由公开标签派生，仅用于本地 Anvil。生产钱包必须使用 passkey/PRF 或等价的密钥来源，不能复用这套派生方式。

## 自动化验收

完整链上 E2E 使用独立端口，连续执行三次采购，再执行理财存入、时间推进、赎回和能力隔离检查。它还会比对链上 `OwnerCiphertext`，确认三次采购密文互不相同，并确认开通和 Agent 操作均由 facilitator 代付：

```bash
SHADOWPASS_PTAU=/absolute/path/to/powersOfTau28_hez_final_18.ptau \
DEMO_E2E_ANVIL_PORT=8555 \
bash scripts/demo/e2e.sh
```

成功时最后会输出 `result: "ok"`、三次采购密文唯一性、relay 发送者、匿名集大小和真实能力拒绝原因。

浏览器端验收需要先保持 `run.sh` 运行，再开另一个终端：

```bash
DEMO_URL=http://127.0.0.1:4179 \
node scripts/demo/ui-check.mjs
```

脚本会真实点击采购、理财、赎回，验证链上事件解密主人视图和对照面板，并检查 1440、390、320 px 视口没有横向溢出。它还会验证隐私剖面中的真实交易哈希、facilitator 执行账户、budget nullifier、密文字段、Alice 解密链和匿名集限制。截图默认写入 `scripts/demo/.runtime/ui/`。如需重新生成协议层复核录屏：

```bash
DEMO_URL=http://127.0.0.1:4179 \
DEMO_VIDEO=docs/demo/demo.webm \
DEMO_DESKTOP_SCREENSHOT=docs/demo/desktop.png \
DEMO_MOBILE_SCREENSHOT=docs/demo/mobile.png \
node scripts/demo/ui-check.mjs
```

## 产物与缓存

`scripts/demo/.runtime/` 已被忽略，包含：

- 与当前电路源码指纹一致的 WASM、zkey、vk 和 verifier 快照。
- 本次运行的部署快照。
- UI 验收截图和临时录屏。

`artifacts/ptau/`、`circuits/build/`、`*.zkey`、`*.ptau` 都已被根目录 `.gitignore` 排除。删除 `scripts/demo/.runtime/` 可强制重新构建。源码指纹或 manifest 不匹配时，脚本也不会复用旧产物。

## 常见问题

`Too many values for input signal ...`

说明旧 WASM 与新电路源码不匹配。演示脚本会按源码指纹自动重建；如目录被手工改乱，删除 `scripts/demo/.runtime/` 后重试。

`ptau hash mismatch`

文件不完整或被替换。默认下载器会保留 `.download` 并从断点继续；多次失败后可删除错误文件重试，或通过 `SHADOWPASS_PTAU` 指向官方 `powersOfTau28_hez_final_18.ptau`。

端口被占用

通过上面的端口变量换一组端口。Anvil 端口必须对应 chain ID `31337`，否则脚本会拒绝复用该 RPC。

交易已成功但页面没有刷新

页面每 5 秒拉取一次 `/api/status`。也可以刷新页面；链上状态不会丢失。

## 相关材料

- [三分钟演示剧本](SCRIPT.md)
- [竞品、风险与边界问答](QA.md)
- [备用录屏与复核](RECORDING.md)
