# MVP 真机录屏检查表

自动 E2E 使用 Playwright passkey 替身，真机录屏必须由人完成。目标时长不超过 3 分钟。

## 设备

- macOS + Chrome。
- Google 密码管理器可创建并同步 passkey。
- Touch ID 已启用。
- 终端字体足够大，Claude/终端和钱包可以快速切换。

## 录屏前

1. 执行 `npm run demo:mvp` 并等待所有服务 ready。
2. 完成两条 `claude mcp add`，确认 Claude 会话能看到 `pay`、`treasury_supply`、`treasury_withdraw`。
3. 关闭通知、书签栏和其他无关标签。
4. 确认 wallet 是全新浏览器 profile，或清除本地钱包数据后重新开始。
5. 按 `docs/mvp/SCRIPT.md` 排练至少一次。

## 必须覆盖

- 真 Touch ID 创建/解锁。
- 100 USDC 入金。
- buyer 与 treasury 两次配对和发卡。
- Claude 实际调用采购 MCP 并返回报告内容。
- treasury MCP 的 supply 和 withdraw。
- 钱包 Bills 页面显示两条分支与未上报提醒。
- 钱包吊销 buyer；buyer 再付款失败；treasury 仍 active。
- 对照面板或讲解截图，说明链上暴露边界。

## 输出

- 文件必须 ≤ 180 秒，有讲解，不得加速伪造耗时。
- 保存 SHA-256 和录制日期。
- 若无法完成真机录屏，PR 必须保留未勾选项，不能把自动 E2E 说成真机录屏。
