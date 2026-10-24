# MVP 三分钟剧本

这套剧本必须使用真实钱包 PWA 和两个真实 MCP，不使用协议层控制台冒充产品。

## 开始前

1. 执行 `npm run demo:mvp`，确认输出 `shadowpass.mvp.ready`、20 个模拟存款和两个配对链接。
2. 打开 `http://localhost:4173`，使用 Chrome。
3. 另开终端执行 `npm run claude:mvp`。只使用这一个用户可见的 Claude 会话，不再分别打开 buyer 和 treasury 对话。

## 逐秒剧本

| 时间 | 操作 | 画面和讲解要点 |
|---|---|---|
| 0:00–0:20 | 打开钱包，点击 Create with passkey，完成 Touch ID | 展示 Google 密码管理器保存 passkey。强调私钥/seed 不留在钱包商侧。 |
| 0:20–0:35 | 点击 Open wallet，再点击 100 USDC | 说明这是测试网 faucet，链上真实入金；匿名集已预置 20 个本地模拟账户。 |
| 0:35–1:05 | 点击 Issue card，粘贴 buyer 配对链接，预算 40，选择 PAY，签发；再签 treasury 50 / TREASURY | 指出能力位和预算不同，两条 Agent 分支互不越权。 |
| 1:05–1:30 | 在主 Agent 说“用采购卡帮我买一份 EV 市场报告，最多花 2 USDC；再从理财卡里拿 20 spUSD，存进本地演示金库，放一天” | 展示主 Agent 分别调度 buyer 与 treasury subagent；采购分支走 x402、证明和 facilitator 结算，理财分支显示承诺票据、仓位 ID 和链上交易。 |
| 1:30–1:50 | 说“现在到期了，推进本地演示时间，然后赎回刚才的仓位” | 主 Agent 只推进本地 Anvil 时间，再调度 treasury subagent；展示本金和收益进入预先承诺票据。 |
| 1:50–2:00 | 指出主 Agent 没有 MCP 钱包工具，两个子 Agent 各自只加载自己的 server | 强调一次对话的 UX 不牺牲工具面隔离。 |
| 2:00–2:20 | 回到钱包，打开 Bills | 展示 buyer 和 treasury 两条链、金额、tx、Reported/Unreported；恶意 buyer 不上报时出现提醒。 |
| 2:20–2:35 | 打开 Authorization，吊销 buyer，确认 10 秒宽限窗口 | 再让 Claude buyer 调用 pay，返回 `revoked`。 |
| 2:35–2:50 | 调用 treasury `wallet_status` | 展示 treasury 仍为 active，说明只冻结出问题分支。 |
| 2:50–3:00 | 切到 `docs/demo` 对照面板截图或#50 页面 | 总结链上只看到池内授权分支，Alice 用查看钥完成对账。 |

## 出错兜底

| 故障 | 兜底 |
|---|---|
| Touch ID / PRF 不可用 | 切到已经验证的 Chrome + Google 密码管理器；Safari 作为备用但需提前测试。 |
| 主 Agent 没有调度到子 Agent | 退出后重新执行 `npm run claude:mvp`，确认 `.claude/agents/` 三个文件存在；或用 `npm run test:mvp` 展示真实 MCP stdio E2E。 |
| 配对链接打开了生产钱包 | 改用终端输出的 `http://localhost:4173/pair#...`，或直接粘贴配对码。 |
| 本地链或 facilitator 异常 | 停止并重新执行 `npm run demo:mvp`；产物缓存会复用。 |
| 现场时间不足 | 直接播放 `docs/demo/demo.webm`，并明确说明那是协议层演示，不是钱包+MCP 录屏。 |

## 不要过度表述

- E2E 的 passkey 是浏览器替身，不说成真实 Touch ID。
- 20 个模拟账户只扩大票据层匿名集，身份层匿名集仍有限。
- 不宣称生产级可信设置、抗流量分析或隐藏金额/IP。
