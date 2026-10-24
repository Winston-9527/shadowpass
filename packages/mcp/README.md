# @shadowpass/mcp

Agent 侧 stdio MCP server。它把 Agent 的本地 EdDSA holder 私钥、X25519 信箱私钥、凭证包和收据保存在用户自己的机器上，不把秘密交给钱包商或 facilitator。

## 当前能力

- 首次启动生成 holder 私钥、信箱私钥和一次性配对秘密；目录权限 `0700`，文件权限 `0600`，已有过宽权限会被收紧。
- 在 stderr 打印钱包配对链接、配对码和二维码。stdout 只用于 MCP JSON-RPC。
- 第一个凭证包必须在密封盒内携带配对秘密；接受后锁定根凭证和主人信箱。后续包必须属于同一主人链，重放、回滚和已花票据会被丢弃。
- 从加密信箱接收凭证包，验证签名、链连续性、链上签发、吊销状态、有效期和票据树成员关系；能力取整条链按位与，有效期取最小值。
- 每次工具调用前刷新链上状态并同步信箱；链上状态不可用，或可信凭证依赖的链上写入暂时不可见时，保留信箱游标，不消费该凭证包。启动时会从链上票据备忘恢复本地票据。
- 提供 `wallet_status`、`list_receipts`、`pay`、`treasury_supply`、`treasury_status`、`treasury_withdraw`、`delegate`。
- `pay` 通过官方 x402 fetch 客户端处理 402：使用 SDK 选票、构造 action 和找零 `memoChange`，生成 D1/D2/D3 证明并在本地验证通过后才提交；`spendControls` 只允许部署中的测试币，并限制单笔金额。
- `pay` 返回商家响应体（最多 32 KiB），并标记为 `trust: "untrusted"`；付款成功后立即把找零票据写入本地 store。
- `pay` 和 `treasury_supply` 在执行前本地检查能力位、金额上限和参数；`treasury_supply` 还会检查金库白名单与当前余额。检查失败时不会生成证明或发起网络请求。
- `treasury_supply` 通过 `TreasuryAdapter.quote` 取得 `expectedQ`，提交五个字段的 `TREASURY_SUPPLY` action，保存找零和仓位，并把带 `treasury:<vault>` 资源的收据发给主人。
- `treasury_status` 合并本地仓位与链上 `PositionOpened`/仓位状态；`treasury_withdraw` 只允许到期后调用 relay，并从链上 `NoteMemo` 校验、恢复 `returnCm` 对应票据。
- 付款和理财操作共享串行执行队列，避免并发工具调用花掉同一张票据。
- 付款或理财成功后记录收据并发送给主人信箱；`--malicious` 只跳过收据上报，仍保留本地记录。

`pay` 已使用 `@shadowpass/x402` 的 `ShadowpassClientScheme` 与 `@x402/fetch`。理财工具依赖 facilitator 的 `POST /relay/execute` 与 `POST /relay/treasuryWithdraw`；缺少 RPC、证明产物、relay 或凭证时会返回固定错误码，不会伪造成功。`delegate` 的真实后端仍待后续接线。

## 安装

在仓库根目录安装 workspace：

```bash
npm install
```

直接从仓库运行：

```bash
./node_modules/.bin/shadowpass-mcp --name buyer
```

常用参数：

```text
--name <name>        Agent 名称，默认 SHADOWPASS_AGENT_NAME 或 default
--home <dir>         覆盖默认 ~/.shadowpass/agents
--network <network>  部署名，默认 SHADOWPASS_NETWORK 或 anvil
--rpc <url>          链上状态同步 RPC；也可用 SHADOWPASS_RPC_URL / ANVIL_RPC_URL
--malicious          付款但不向主人发送收据
--no-qr              不打印终端二维码
--print-pairing      只打印配对信息后退出
--new-pairing        生成新的配对秘密并清除当前主人锁定（换主人时使用）
```

## Claude Code

把仓库路径替换为实际绝对路径：

```bash
claude mcp add shadowpass -- \
  /absolute/path/to/shadowpass/node_modules/.bin/shadowpass-mcp \
  --name buyer
```

## Claude Desktop

编辑 `claude_desktop_config.json`：

```json
{
  "mcpServers": {
    "shadowpass": {
      "command": "/absolute/path/to/shadowpass/node_modules/.bin/shadowpass-mcp",
      "args": ["--name", "buyer"],
      "env": {
        "SHADOWPASS_NETWORK": "anvil",
        "SHADOWPASS_RPC_URL": "http://127.0.0.1:8545",
        "SHADOWPASS_ARTIFACTS": "/absolute/path/to/shadowpass/apps/wallet/public/zk/circuits-v2"
      }
    }
  }
}
```

重启客户端后，可以说“帮我买一份报告”；如果 Agent 尚未配对或付款后端未配置，工具会返回明确错误，不会直接付款。

本地 anvil 必须持续出块，建议使用 `anvil --block-time 1`。Gate 的 `nowTs` 使用最新区块时间并限制 60 秒时钟偏差；链空闲过久时，需要先产生新区块，否则付款会因 `BadClock` 失败。

## 本地数据

默认目录：

```text
~/.shadowpass/agents/<name>/
├─ agent.json       公钥、网络、主人锁定、凭证指纹、信箱游标和最近一次固定错误码
├─ secrets.json     holder 私钥、X25519 私钥和一次性配对秘密
├─ credentials.json 最近验证通过且属于锁定主人的凭证包
├─ notes.json       本地票据
├─ receipts.json    链上付款、理财收据与是否已上报
└─ treasury.json    理财仓位、到期时间和待赎回票据
```

日志不会打印 holder 私钥、信箱私钥或凭证签名内容。配对链接和码包含 Agent 公钥、信箱公钥和一次性配对秘密，应只通过可信渠道交给主人钱包。

## 测试

```bash
npm run typecheck -w @shadowpass/mcp
npm test -w @shadowpass/mcp
```

测试使用 mock chain state、可注入 prover、真实 SDK witness 和官方 x402 fetch 客户端，不依赖 anvil 或外部服务。覆盖首次配对、主人锁定、伪造签名、重放、回滚、链上状态恢复、票据恢复、找零 memo、ctx_hash 绑定、本地证明预验证、测试币限制、单笔上限、理财白名单、到期检查和并发票据保护。

真实 anvil 验证需同时使用 #50 本地分支提供的 relay `execute`/`treasuryWithdraw`。验收记录：并发两次 `treasury_supply` 只有一次成功；D2 证明约 1.49 秒；存入后找零 5 spUSD；到期赎回恢复 20.199995 spUSD；主人可解出 Alice、管家、理财 Agent 三跳。
