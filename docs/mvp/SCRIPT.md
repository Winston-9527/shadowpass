# MVP 三分钟剧本

这套剧本必须使用真实钱包 PWA 和两个真实 MCP，不使用协议层控制台冒充产品。

## 开始前

1. 执行 `npm run demo:mvp`，确认输出 `shadowpass.mvp.ready`、20 个模拟存款和两个配对链接。
2. 打开 `http://localhost:4173`，使用 Chrome。
3. 在 Claude Code 中执行输出里的两条 `claude mcp add` 命令，然后重启 Claude 会话。
4. 准备两个终端标签：一个运行采购 MCP，一个运行理财 MCP；实际由 Claude 客户端拉起 stdio 也可以。

## 逐秒剧本

| 时间 | 操作 | 画面和讲解要点 |
|---|---|---|
| 0:00–0:20 | 打开钱包，点击 Create with passkey，完成 Touch ID | 展示 Google 密码管理器保存 passkey。强调私钥/seed 不留在钱包商侧。 |
| 0:20–0:35 | 点击 Open wallet，再点击 100 USDC | 说明这是测试网 faucet，链上真实入金；匿名集已预置 20 个本地模拟账户。 |
| 0:35–1:05 | 点击 Issue card，粘贴 buyer 配对链接，预算 40，选择 PAY，签发；再签 treasury 50 / TREASURY | 指出能力位和预算不同，两条 Agent 分支互不越权。 |
| 1:05–1:30 | 在 Claude 采购会话说“帮我买一份 EV 市场报告” | 展示 MCP `pay` 调用、x402 402、证明和 facilitator 结算，Claude 收到报告 JSON。 |
| 1:30–1:50 | 在 Claude 理财会话调用 `treasury_supply`，存入 20，期限使用本地 24 小时演示值 | 展示承诺票据、仓位 ID 和链上交易。 |
| 1:50–2:00 | 推进 Anvil 时间，调用 `treasury_withdraw` | 展示本金和收益进入预先承诺票据；说明测试收益不是投资建议。 |
| 2:00–2:20 | 回到钱包，打开 Bills | 展示 buyer 和 treasury 两条链、金额、tx、Reported/Unreported；恶意 buyer 不上报时出现提醒。 |
| 2:20–2:35 | 打开 Authorization，吊销 buyer，确认 10 秒宽限窗口 | 再让 Claude buyer 调用 pay，返回 `revoked`。 |
| 2:35–2:50 | 调用 treasury `wallet_status` | 展示 treasury 仍为 active，说明只冻结出问题分支。 |
| 2:50–3:00 | 切到 `docs/demo` 对照面板截图或#50 页面 | 总结链上只看到池内授权分支，Alice 用查看钥完成对账。 |

## 出错兜底

| 故障 | 兜底 |
|---|---|
| Touch ID / PRF 不可用 | 切到已经验证的 Chrome + Google 密码管理器；Safari 作为备用但需提前测试。 |
| Claude Desktop 未连接到 MCP | 用已输出 Claude Code 命令重启客户端；或使用 `npm run test:mvp` 展示真实 MCP stdio E2E。 |
| 本地链或 facilitator 异常 | 停止并重新执行 `npm run demo:mvp`；产物缓存会复用。 |
| 现场时间不足 | 直接播放 `docs/demo/demo.webm`，并明确说明那是协议层演示，不是钱包+MCP 录屏。 |

## 不要过度表述

- E2E 的 passkey 是浏览器替身，不说成真实 Touch ID。
- 20 个模拟账户只扩大票据层匿名集，身份层匿名集仍有限。
- 不宣称生产级可信设置、抗流量分析或隐藏金额/IP。
