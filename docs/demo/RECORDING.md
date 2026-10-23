# 备用录屏与复核

## 录制规范

- 时长不超过 180 秒。
- 使用真实本地链，不用静态 mock 冒充结算。
- 页面中的“模拟数据”提示必须可见。
- 采购、理财存入、到期赎回和对照面板都要出现。
- 录屏只使用 Anvil 公开开发账户，不出现真实私钥、助记词或 `.env`。

## 自动生成

先保持演示服务运行，再执行：

```bash
DEMO_URL=http://127.0.0.1:4179 \
DEMO_VIDEO=docs/demo/demo.webm \
DEMO_DESKTOP_SCREENSHOT=docs/demo/desktop.png \
DEMO_MOBILE_SCREENSHOT=docs/demo/mobile.png \
node scripts/demo/ui-check.mjs
```

脚本使用 Playwright 记录实际操作，等待真实证明和交易完成，最后检查交互总耗时小于 180 秒。正式文件由下方哈希锁定。

## 当前备份

- 文件：`docs/demo/demo.webm`
- 桌面截图：`docs/demo/desktop.png`
- 手机截图：`docs/demo/mobile.png`
- 时长：33.16 秒，分辨率 1440 x 900，VP9。
- SHA-256：`5d747e38d266ea3a6e217498eaa06dfd4e03e3b33ac05914d1409f34ee72e4dd`
- 生成时间：2026-10-23；脚本内五段字幕与 `SCRIPT.md` 的五步结构一致。
- 交互耗时：32.883 秒；采购和理财状态最终分别为“已执行”“已赎回”。

## 播放前检查

```bash
test -s docs/demo/demo.webm
shasum -a 256 docs/demo/demo.webm
```

如果现场网络或本地链异常，直接播放备用录屏；仍保留 `run.sh` 和 `ui-check.mjs` 供评委复核。
