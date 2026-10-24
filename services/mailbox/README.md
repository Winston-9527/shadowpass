# 加密信箱

`@shadowpass/mailbox` 实现 `docs/INTERFACES.md` §9 和 §13。服务端只接收并保存密文，不持有收件人私钥，不记录请求正文，也不记录 `recipient` 或槽 ID。

## 运行

```bash
npm install
npm run start -w @shadowpass/mailbox
```

默认监听 `127.0.0.1:8787`，本地数据写入 `.mailbox.sqlite`。

```text
POST /box/:recipient   {"ct":"<base64 sealed box>"}  -> {"id":1}
GET  /box/:recipient?after=0                         -> [{"id","ct","ts"}]
POST /slot/:slot       {"ct":"<base64 SPW1 envelope>"} -> {"id":1}
GET  /slot/:slot?after=0                              -> [{"id","ct","ts"}]
GET  /health                                         -> {"ok":true}
```

`recipient` 是 32 字节 X25519 公钥，64 位 hex。服务端统一转为小写，避免大小写产生两个信箱。

`slot` 是 64 位 hex 槽 ID。备份槽不过期、不淘汰，每槽最多 16 条，写满返回 409。`ct` 解码后必须是 81 字节 `SPW1` 信封，mode 只能为 0 或 1。

## 存储

- 未设置 `MAILBOX_KV_URL` / `MAILBOX_KV_TOKEN`：使用 Node 24 内置 SQLite。
- 设置后：使用 Upstash REST；也兼容 `KV_REST_API_URL` / `KV_REST_API_TOKEN` 和 `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN`。
- SQLite 路径由 `MAILBOX_DB_PATH` 指定。

线上部署时使用 Upstash，不要依赖实例本地磁盘。生产地址为
`https://shadowpass-mailbox.vercel.app`。

```bash
MAILBOX_KV_URL=https://example.upstash.io \
MAILBOX_KV_TOKEN=... \
MAILBOX_HOST=0.0.0.0 \
npm run start -w @shadowpass/mailbox
```

Vercel 入口在 `services/mailbox/api/`，`vercel.json` 把 `/box/*`、`/slot/*` 和 `/health` 转发到函数。项目 Root Directory 设为 `services/mailbox`，至少配置：

```text
KV_REST_API_URL
KV_REST_API_TOKEN
MAILBOX_TRUSTED_PROXY_HEADER=x-real-ip
MAILBOX_CORS_ORIGIN=https://shadowpass-wallet.vercel.app
```

Upstash 的 Vercel Marketplace 集成会向 Production 和 Preview 注入
`KV_REST_API_URL` / `KV_REST_API_TOKEN`。Mailbox 也兼容
`MAILBOX_KV_URL` / `MAILBOX_KV_TOKEN` 和
`UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN`。

仓库根目录已有钱包的 `vercel.json`，因此不要复用默认配置，显式传入
Mailbox 的配置：

```bash
npx vercel link --project shadowpass-mailbox
npx vercel build --prod -A services/mailbox/vercel.json
npx vercel deploy --prebuilt --prod -A services/mailbox/vercel.json
curl -fsS https://shadowpass-mailbox.vercel.app/health
```

若域名被 Vercel Deployment Protection 的 SSO 拦截，浏览器会收到登录页而
不是 Mailbox 的 JSON 响应；必要时执行
`npx vercel project protection disable shadowpass-mailbox --sso`。

## 限制

```text
MAILBOX_MAX_MESSAGE_BYTES=16384   单条密封密文字节上限
MAILBOX_MAX_BATCH_SIZE=200        单次增量读取上限
MAILBOX_MAX_PER_BOX=1000          每个箱子最多保留的消息数
MAILBOX_RETENTION_MS=2592000000   消息保留 30 天
MAILBOX_RATE_LIMIT_POST=30        每 IP 每窗口 POST 次数
MAILBOX_RATE_LIMIT_GET=120        每 IP 每窗口 GET 次数
MAILBOX_RATE_WINDOW_MS=60000      限流窗口
MAILBOX_CORS_ORIGIN=*             浏览器访问来源
MAILBOX_LOG_REQUESTS=0            设为 1 时记录方法/模板路径/状态，不记录 recipient 或正文
MAILBOX_TRUSTED_PROXY_HEADER=     仅支持 x-real-ip（Vercel）或 cf-connecting-ip，默认关闭
```

## SDK

```ts
import {
  deriveKeys,
  MailboxClient,
} from "@shadowpass/sdk";

const keys = await deriveKeys(Uint8Array.from({ length: 32 }, (_, index) => index + 1));
const client = new MailboxClient("https://mailbox.example");
await client.send(keys.box.publicKey, new TextEncoder().encode("credential"));
const messages = await client.pollAll(keys.box, 0);
for (const entry of messages) {
  if (entry.decoded) console.log(entry.id, entry.value);
}
```

客户端使用 `libsodium-wrappers 0.7.15`。`crypto_box_seal` 不认证发送方；坏条目会保留 `id`、标记 `decoded: false` 并继续返回后续消息。收据本来就不能作为链上事实，最终以链上事件和主人解密结果为准。

`send` 的收件人公钥同时接受 32 字节 `Uint8Array` 和 64 位 hex 字符串（可选 `0x` 前缀），字符串会先做格式校验再转换。

消息箱单次 `poll` 最多返回 200 条。满 200 条时用最后一条的 `id` 作为下一次 `after`；需要一次拉完时使用 `pollAll`。备份槽由钱包的 `HttpBackupSlotClient` 独立调用 `/slot`。

## 测试

```bash
npm test -w @shadowpass/mailbox
npm test -w @shadowpass/sdk
npm run e2e -w @shadowpass/mailbox
MAILBOX_E2E_BASE_URL=https://mailbox.example npm run e2e:online -w @shadowpass/mailbox
```

E2E 会启动真实 HTTP 进程、发送/解密两条消息、验证增量拉取与 429，并扫描 SQLite 文件和日志确保没有明文。
