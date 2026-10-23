# @shadowpass/sdk

ShadowPass 的链下逻辑唯一实现。Node 与浏览器共用，运行时只依赖 SDK 依赖，不引用 `circuits/`、`vendor/` 或 `spikes/`。

## 模块

- `keys`：seed、签名钥、查看钥、管家钥、X25519 信箱钥；PRF 包裹与恢复码包裹。
- `certs`：Poseidon9 根凭证、Poseidon7 子凭证、EdDSA-Poseidon 签名。
- `trees`：签发、撤销 IMT、根凭证、票据、群组五棵树。
- `state`：从链上事件增量重建五棵树、memo 和 spent nullifier。
- `witness`：D1/D2/D3 action、register、revoke、budget transfer、mint。
- `prove`：snarkjs fullProve、验证、calldata；从目录或 URL 加载并按 `MANIFEST.sha256` 校验。
- `owner`：主人密文加密/解密和链上账单扫描。
- `notes`：233 字节票据明文、281 字节 libsodium sealed-box memo、恢复扫描。
- `bundle`：凭证包与 receipt/delegated 消息编解码。
- `mailbox`：加密信箱 HTTP 客户端。
- `ctx`：与 Solidity ABI 一致的 `ctxHash`、`reqHash`。

## 用法

```ts
import { deriveKeys, loadArtifacts, prove } from "@shadowpass/sdk";

const keys = await deriveKeys(seed);
const artifacts = await loadArtifacts({ baseUrl: "/zk/circuits-v2", circuit: "main_d2" });
const { proof, publicSignals } = await prove("main_d2", witnessInput, artifacts);
```

浏览器构建与证明：

```bash
npm run browser:build -w @shadowpass/sdk
SHADOWPASS_BROWSER_URL=http://127.0.0.1:4173 npm run browser:proof -w @shadowpass/sdk
```

浏览器测试需要将 `wasm`、`zkey`、`vk` 和对应 `MANIFEST.sha256` 放在 `browser/public/zk/circuits-v2/`。这些产物不进 git。

`MailboxClient.poll` 返回的批次最多 200 条；`pollAll` 会自动继续拉取。

`src/artifact-hashes.ts` 由 `npm run artifact:hashes -w @shadowpass/sdk` 从
`circuits/zk/MANIFEST.sha256` 生成；`loadArtifacts` 默认用它校验 zkey/vk，
不信任远程托管方返回的 manifest。

## 环境

- `SHADOWPASS_ARTIFACTS`：可选，证明产物目录或 URL。
- `SHADOWPASS_ANVIL_RPC`：可选，运行 `sync` 集成测试所需的 Anvil RPC。
- `SHADOWPASS_DEPLOYMENT`：可选，Anvil 部署 JSON 路径。

`ctxHash` 按 #6 补充接口包含 `keccak256(memoChange)`；对应接口已由 PR #18 合并。
