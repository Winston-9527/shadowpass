# 共享接口规范（v0）

所有工单共同依赖的约定。**改这里的任何内容都要在 PR 描述里写明，并通知验收人。** 数值都按 BN254 标量域元素处理，JSON 里一律用十进制字符串。

## 1. 常量

| 名称 | 值 |
|---|---|
| `P`（BN254 标量域） | `21888242871839275222246405745257275088548364400416034343698204186575808495617` |
| `L`（BabyJub 素数阶子群） | `2736030358979909402780800718157159386076813972158567259200215660948447373041` |
| 能力位 | `PAY = 1 << 0`，`TREASURY = 1 << 1`（32 位，子凭证必须是父凭证的子集） |
| 标签 | `KEY_TAG = 2053861995`（"zkrk"），`TAG_BNF = 2053857902`（"zkbn"），`TAG_REG = 2053858418`（"zkdr"） |
| 树深度 | 签发树 `MD = 20`（LeanIMT，实际深度随叶子数变化，最大 20），撤销 IMT `RD = 20`，根凭证树 `RT = 20`，票据树 `NT = 20`，群组树 20 |
| 网络 | Base Sepolia，chain id `84532`，CAIP-2 `eip155:84532` |
| 钱包域名 / passkey RP ID | `shadowpass-wallet.vercel.app`（开发用 `localhost`），定了不改 |
| 证明产物 | `https://shadowpass-wallet.vercel.app/zk/circuits-v<N>/`，按 MANIFEST 校验（见 `docs/ARCHITECTURE.md` §4） |

## 2. 哈希与凭证

```
cert0  = Poseidon9(0, ent0.x, ent0.y, ent1.x, ent1.y, cap0, expiry0, vpk.x, vpk.y)   // 根凭证，绑定主人查看公钥
cert_i = Poseidon7(i, ent_i.x, ent_i.y, ent_{i+1}.x, ent_{i+1}.y, cap_i, expiry_i)     // i >= 1
note   = Poseidon8(owner.x, owner.y, q, lin0, lin1, lin2, lin3, rho)                   // lin = 链上凭证哈希，空位补 0
budget_nf = Poseidon3(TAG_BNF, holder_sk, note)
key_entry = Poseidon3(KEY_TAG, A.x, A.y)                                               // 撤销集合中的“密钥”条目
state_root = Poseidon3(issued_root, revoked_root, root_root)
vpk = vsk * Base8 = 8 * own_w，own_w = vsk * Generator
```

签名：EdDSA-Poseidon（circomlibjs `signPoseidon`），签的是凭证哈希。参考实现：`circuits/scripts/world.mjs`。

## 3. 密钥派生（用户侧）

规范实现是 `@shadowpass/sdk` 的 `keys` 模块，钱包和 MCP 只调用它，不自行实现。

```
seed        = 32 字节 CSPRNG，开通时生成一次
prf_i       = WebAuthn PRF 输出：extensions.prf.eval.first = UTF-8("shadowpass-v1")
              （注册时看 prf.enabled；登录时只看 prf.results.first，登录结果里没有 enabled）
wrap_key_i  = HKDF-SHA256(ikm = prf_i, salt = UTF-8("shadowpass-v1"), info = "wrap", 32 字节)
recov_key   = scrypt(password = UTF-8(规范化恢复码), salt = 16 字节随机, N = 2^15, r = 8, p = 1, dkLen = 32)
信封         = "SPW1"(4) || mode(1：0 = passkey，1 = 恢复码) || iv(12) || salt(16；mode 0 填 0) || AES-256-GCM 密文含 tag(48)
sign_prv    = HKDF-SHA256(seed, salt = 空, info = "shadowpass/sign", 32 字节)     -> identity(sign_prv)
steward_prv = HKDF-SHA256(seed, salt = 空, info = "shadowpass/steward", 32 字节)  -> identity(steward_prv)，管家分配钥（ent1）
vsk         = HKDF-SHA256(seed, salt = 空, info = "shadowpass/view", 64 字节) mod L；为 0 时改用 info "shadowpass/view-retry"
box_sk      = HKDF-SHA256(seed, salt = 空, info = "shadowpass/box", 32 字节)      -> X25519 私钥，box_pk = crypto_scalarmult_base(box_sk)
```

- **恢复码**：20 个 Crockford Base32 字符（100 bit 熵），显示为 `XXXX-XXXX-XXXX-XXXX-XXXX`。规范化：去掉 `-` 和空格，转大写，`I`/`L` → `1`，`O` → `0`。
- **PRF 输出、seed、签名钥、管家钥永不落盘**。本地 IndexedDB 只存信封、凭证 ID、公钥和查看钥。
- 每个 passkey 用**新的随机用户句柄**注册，并在 `excludeCredentials` 里列出已有凭证，避免覆盖。

委托树固定为：`ent0 = Alice 身份` →（cert0，Poseidon9）→ `ent1 = 管家分配钥`（也在 Alice 钱包里）→（cert1）→ `ent2 = Agent`。Agent 的证明是 D=2；Agent 再向下委托是 D=3（需要时再编译 `main_d3`）。入金直接铸给管家：`owner = ent1, lin = [cert0, 0, 0, 0]`。

Agent 侧（MCP server）自己生成 `holder_prv`（32 字节）和 X25519 信箱密钥，存在本机，永不离开。

## 4. 电路公开输入（顺序即 verifier 的 `pubSignals` 顺序）

`main_d{D}`（D=1/2/3，公开输入数分别为 15/16/17）：
```
[0] state_root  [1] now  [2] ctx_hash  [3] act_req_cap
[4] own_c1x  [5] own_c1y  [6] own_c2x  [7] own_c2y
[8 .. 8+D] own_e[0..D]  [9+D] own_esign
[10+D] note_root  [11+D] budget_nf  [12+D] cm_change  [13+D] q_spent
```
D=1/2/3 分别为 15/16/17 个。主人密文 `ct = [own_c1x, own_c1y, own_c2x, own_c2y, own_e..., own_esign]`，长度 `D + 6`，合约按长度选 verifier。

`main_reg`：`[group_root, domain, nf_domain, leaf0]`。

`main_revoke`：`[old_root, new_root, entry, next_index]`。

`budget_transfer`：`[note_root, revoked_root, nullifier, cm_out1, cm_out2]`。

`budget_mint`：`[cm, q]`。

## 5. Action 与 ctx_hash

```solidity
struct Action { address target; bytes4 method; uint256 amount; uint256 nonce; bytes params; }
ctx_hash = uint256(keccak256(abi.encode(block.chainid, address(gate), act.method, act.target, act.params, act.amount, act.nonce, keccak256(memoChange)))) >> 8;
```

- `memoChange` 是必填参数（没有找零备忘时传空字节 `0x`，并且调用方必须显式传入）。
- 电路把 `ctx_hash` 当作不透明的公开输入，所以在哈希里加入 `keccak256(memoChange)` 不需要改电路，却能防止转发方（facilitator）替换找零票据的备忘。
- `amount` 必须等于 `q_spent`。管理员用 `setMethod(method, cap, target, enabled)` 配置：`requiredCap[method]` 作为 `act_req_cap` 公开输入，**`act.target` 必须等于为该方法登记的 `target`**（PAY → `ShadowPayout`，TREASURY_SUPPLY → `TreasuryAdapter`）。否则持有 TREASURY 能力的 Agent 可以把 target 指向自己的合约，直接把资金转走。
- 管理员信任边界：管理员可以改变方法的能力位和登记目标，并发出 `MethodSet`；已经生成的证明通过 `ctx_hash` 绑定旧目标，不会因管理员换目标而被解释成新目标。
- 方法：`PAY = bytes4(keccak256("shadowpass.PAY"))` 要求能力 `PAY`；`TREASURY_SUPPLY = bytes4(keccak256("shadowpass.TREASURY_SUPPLY"))` 要求能力 `TREASURY`。
- 付款：`target = ShadowPayout`，`params = abi.encode(payTo, reqHash)`，`ShadowPayout` 按 `keccak256(abi.encode(payTo, reqHash))` 防重放（只按 `reqHash` 会被别人抢先占用），`reqHash = keccak256(abi.encode(string network, address asset, uint256 amount, address payTo, string resourceUrl))`（`network` 是 CAIP-2 字符串，如 `"eip155:84532"`）。
- 理财存入（定期存款语义）：`method = TREASURY_SUPPLY`，`target = TreasuryAdapter`，`params = abi.encode(vault, term, returnCm, expectedQ, returnMemo)`。存入时，adapter 必须校验 `returnCm < P`、`returnMemo` 不超过 512 字节、`expectedQ < 2^64`，否则拒绝（不然取回时会永远失败，本金被锁死）。`quote()` 必须是保守估计：模拟 deposit 再 redeem 的取整损失，再减去“到期时一份 share 的价值 + 2 wei”（交易可能比报价晚几个区块上链，取整损失最多一份 share）。**存入时，adapter 在链上重新计算 `quote(vault, amount, term)`，要求 `expectedQ <= quote`，否则拒绝**（Agent 是不可信的，不能让它自己报一个更高的到期金额）。到期后任何人可调用 `TreasuryAdapter.withdraw(positionId)`，赎回并以 `returnCm`（面额 `expectedQ`，由理财 Agent 在存入时承诺）存回资金池，同时发出 `returnMemo`；多出的部分进储备；不足部分只有在**不超过容差**（`max(一份 share 的价值 + 2 wei, expectedQ 的 0.01%)`）且不超过储备余额时，才从储备补足并照常铸票据；超过储备余额时才报 `Shortfall`，不铸票据，资金留在储备里。
- 资金流：
  - **付出（推送）**：`execute` 验证通过、记下 nullifier 之后，Gate 先把 `amount` 个代币转给 `target`，再调用 `target.onAuthorized(method, amount, params)`。target 只能使用本次收到的 `amount`，不得动用自己的储备。
  - **回流（拉取）**：adapter 先 `approve(gate, q)`，再调用 `Gate.depositFromAdapter(cm, q, memo)`；Gate 用 `transferFrom(adapter, gate, q)` 收款，然后插入票据。只允许白名单 adapter 调用；adapter 调用后把授权清零。

## 6. 链上事件（前端和 MCP 靠它们重建状态）

签名即 ABI，`indexed` 按下表；合约和 SDK 必须完全一致。

| 合约 | 事件 | 用途 |
|---|---|---|
| Gate | `Executed(uint256 indexed budgetNf, address indexed target, bytes4 method, uint256 amount)` | 付款记录 |
| Gate | `OwnerCiphertext(uint256 indexed budgetNf, uint256[] ct)` | 主人扫描解密 |
| Gate | `NullifierSpent(uint256 indexed nullifier)` | **每次消耗票据都发**（`execute`、`transferBudget`），用于判断票据是否已花 |
| Gate | `NoteInserted(uint256 indexed cm, uint256 index, uint256 root)` | 重建票据树 |
| Gate | `NoteMemo(uint256 indexed cm, bytes memo)` | 新票据的加密打开信息（§11） |
| Gate | `Issued(uint256 indexed certHash, uint256 index, uint256 root)` | 重建签发树 |
| Gate | `StateRegistered(uint256 issued, uint256 revoked, uint256 root, uint256 stateRoot)` | 已登记的状态根组合 |
| Registry | `Registered(uint256 indexed nf, uint256 leaf0, uint256 index, uint256 root)` | 根凭证树追加 |
| Registry | `Replaced(uint256 indexed nf, uint256 oldLeaf0, uint256 newLeaf0, uint256 index, uint256 root)` | 根凭证树**原位替换**第 `index` 个叶子 |
| Revocations | `Revoked(uint256 indexed entry, uint256 index, uint256 oldRoot, uint256 newRoot)` | 重建撤销 IMT |
| 群组 | `Joined(uint256 indexed commitment, uint256 index, uint256 root)` | 重建群组树 |

同步要求：
- 按区块分段拉取日志（每段不超过 2,000 个区块，可配置），记录已处理到的区块；每次重新处理最后 12 个区块以应对重组。
- 每处理完一批事件，用事件里的 `root` 与本地重建的根逐一比对，不一致立即报错。
- 拉取日志时用本表事件的 topic0 做过滤（`getLogs` 的 `topics` 参数）。合约可以发出本表以外的事件（管理事件等），它们不会进入同步；本表事件解码失败则报出明确错误，不能静默跳过或崩溃在 `undefined` 上。
- 同步失败（任意一段 `getLogs` 出错）不能破坏已有状态：在新对象里完整重放，成功后再替换；并发的 `update()` 共享同一个进行中的 Promise。

根的有效期：
- **只追加的树**（签发树、票据树、群组树）：接受历史上出现过的任何根（合约记录 `knownRoot[root] = true`）。只追加不会删除成员，旧根依然有效；花费由 nullifier 控制，吊销由撤销树控制。这样，别人频繁 `issue`、`deposit`、`join` 也不会让正在提交的证明失效。
- **会替换或会增长约束的树**（根凭证树，因为有原位替换；撤销树）：保留宽限窗口。demo 部署时设为 10 秒。

## 7. 配对与凭证包

配对（Agent → 用户钱包，明文，只含公钥）：
```
https://shadowpass-wallet.vercel.app/pair#<base64url(JSON)>
JSON = { "v": 1, "name": "采购 Agent", "agentPk": {"x": "..", "y": ".."}, "boxPk": "<X25519 公钥 hex>" }
```
MCP 在终端同时打印这个链接、同样内容的配对码（base64url 字符串）和二维码。只放在 `#` 后面，不进服务器日志。

凭证包（用户钱包 → Agent，经信箱加密下发）：

```json
{
  "v": 1, "chainId": 84532, "deployment": "base-sepolia",
  "chain": [
    { "hop": 0, "issuer": {"x": "..", "y": ".."}, "holder": {"x": "..", "y": ".."}, "cap": "3", "expiry": "1767225600",
      "sig": {"S": "..", "R8x": "..", "R8y": ".."}, "vpk": {"x": "..", "y": ".."}, "ownW": {"x": "..", "y": ".."}, "hash": ".." },
    { "hop": 1, "issuer": {}, "holder": {}, "cap": "1", "expiry": "..", "sig": {}, "hash": ".." }
  ],
  "note": { "own": ["..", ".."], "q": "4000000", "lin": ["..", "..", "0", "0"], "rho": ".." },
  "owner": { "box": "<X25519 公钥 hex>" }
}
```

Agent 用 `delegate` 创建子 Agent 时，向主人信箱发送 `{"type": "delegated", "parent": "<hash>", "cert": {...}}`，主人钱包据此显示授权树，并用于祖先吊销（工单 A2）。每笔付款后发送 `{"type": "receipt", "budgetNf": "..", "tx": "..", "resource": "..", "amount": ".."}`。收据只用于展示，以链上解密为准。

## 8. x402 `shadowpass` scheme

### 8.1 付款要求（402 响应里的 `accepts[i]`）

```json
{ "scheme": "shadowpass", "network": "eip155:84532", "asset": "0x<ShadowToken>", "amount": "2000000",
  "payTo": "0x<商家收款地址>", "maxTimeoutSeconds": 120,
  "extra": { "gate": "0x<ShadowGate>", "payout": "0x<ShadowPayout>", "method": "0x<bytes4(keccak256(\"shadowpass.PAY\"))>" } }
```

`resource.url` 取自 x402 v2 的 `PaymentRequired.resource.url`。

### 8.2 付款凭据（`PaymentPayload.payload`）

所有整数都用十进制字符串，地址和字节用 `0x` 开头的十六进制。

```json
{ "D": 2,
  "proof": { "a": ["..",".."], "b": [["..",".."],["..",".."]], "c": ["..",".."] },
  "roots": { "issued": "..", "revoked": "..", "root": ".." },
  "nowTs": "1767225600",
  "action": { "target": "0x<payout>", "method": "0x<PAY>", "amount": "2000000", "nonce": "..", "params": "0x<abi.encode(payTo, reqHash)>" },
  "ct": ["..."],
  "budget": { "noteRoot": "..", "budgetNf": "..", "cmChange": "..", "qSpent": "2000000" },
  "memoChange": "0x.." }
```

- `proof` 是 Solidity 调用顺序（即 SDK `toCalldata` 的输出，`b` 已交换坐标）。
- `action.nonce`：248 bit 的随机数。
- `nowTs`：取最新区块时间，不能用本机时间（Gate 要求 `nowTs <= block.timestamp` 且差值不超过 `clockSkew`）。
- 字段与 `ShadowGate.execute(Proof, Roots, nowTs, Action, ct, Budget, memoChange)` 一一对应。

### 8.3 facilitator 的检查（`/verify`，`/settle` 之前再检查一次）

依次检查，第一个不通过的检查的错误码作为 `invalidReason` 返回：

| 检查 | `invalidReason` |
|---|---|
| `scheme`、`network` 与要求一致；`D ∈ {1,2,3}` 且 `ct.length == D + 6` | `invalid_scheme` / `invalid_payload` |
| `action.target == extra.payout`，`action.method == extra.method` | `wrong_target` |
| `action.amount == budget.qSpent == amount`（要求里的金额） | `amount_mismatch` |
| `params` 解码为 `(payTo, reqHash)`，`payTo` 等于要求里的 `payTo`，`reqHash` 等于按 §5 用 `(network, asset, amount, payTo, resource.url)` 重算的值 | `binding_mismatch` |
| `nowTs` 不早于最新区块时间减去 `clockSkew` | `stale` |
| 状态根组合已登记；未登记时，`/settle` 先调用一次 `registerState`（无许可） | `unknown_state` |
| `eth_call` 模拟 `Gate.execute` 成功；把合约的 revert 名称映射成错误码 | `simulation_failed:<RevertName>` |

`/settle` 用 facilitator 的热钱包发送 `execute`，等待 1 个确认，返回 `transaction`、`network`、`payer = "shadowpass-pool"`。同一个 `budgetNf` 的并发请求只允许一个进入 `/settle`。流程为 `upfront`（先 settle 再交付），参考 `spikes/x402-scheme/`。

### 8.4 `@shadowpass/x402` 包的对外 API（#8 实现，#7 和商家使用）

```ts
// 证明由调用方生成：x402 包不接触私钥、凭证、票据
export interface ShadowpassPaymentBuilder {
  buildPayment(req: PaymentRequirements, resourceUrl: string): Promise<ShadowpassPayload>;
}
export const ShadowpassPayloadSchema: z.ZodType<ShadowpassPayload>;     // §8.2 的 zod schema
export class ShadowpassClientScheme implements SchemeNetworkClient {      // Agent 端（MCP）注册到 x402Client
  constructor(builder: ShadowpassPaymentBuilder);
}
export class ShadowpassServerScheme implements SchemeNetworkServer {      // 商家注册到 x402ResourceServer，paymentFlow = upfront
  constructor(cfg: { deployment: Deployment; asset: Address; payout: Address; decimals: 6 });
}
export class ShadowpassFacilitatorScheme implements SchemeNetworkFacilitator {  // facilitator 服务注册到 x402Facilitator
  constructor(cfg: { publicClient: PublicClient; walletClient: WalletClient; deployment: Deployment });
}
export function checkPayment(payload, req, resourceUrl, chainView): Promise<VerifyResponse>;  // §8.3 的纯检查逻辑，供测试和 facilitator 复用
```

Agent 端（#7）实现 `ShadowpassPaymentBuilder.buildPayment`，内部全部用 SDK 完成：
1. 读取本地凭证包和未花票据；按 `amount` 选一张余额足够的票据；
2. 用 `ctx.reqHash` 算出 `reqHash`，构造 `action`；
3. 生成找零票据和 `memoChange`（加密给自己的信箱公钥）；
4. 用 `ctx.ctxHash`（含 `memoChange`）算出 `ctx_hash`，再用 `witness.actionInput`、`prove.prove`、`prove.verify` 生成证明，本地验证通过后再提交；
5. 用 `prove.toCalldata` 输出 §8.2 的格式。

MCP 的 x402 客户端只允许 `asset = 部署文件里的测试代币`，并设置单笔上限（`spendControls`）。

## 9. 信箱 API

```
POST /box/:recipient          body: { "ct": "<base64>" }（只允许这一个字段，多余字段 400）   -> 201 { "id": n }
GET  /box/:recipient?after=n                                                                    -> 200 [{ "id", "ct", "ts" }]
```

- `recipient`：64 个十六进制字符（32 字节），是收件人的 X25519 公钥。备份槽不走这组接口，见 §13 的 `/slot`。
- `ct`：标准 base64（带 padding），内容是 libsodium `crypto_box_seal` 的密文，解码后 48 字节到 16 KiB。
- `id`：每个箱子内严格递增，并且**写入可见的顺序与 id 顺序一致**（读到 id = k 的请求，之后不会再出现小于 k 的新消息）。GET 按 id 升序返回，最多 200 条；返回满 200 条说明可能还有更多，客户端应继续拉取。
- 服务端：每个箱子最多保留 1,000 条或 30 天，超出的先删最旧的；限流按客户端 IP，部署在代理后面时只信任配置的代理头（Vercel 用 `x-real-ip`）；日志里不记录 `recipient` 和 `ct`。
- **发送方不经认证**。任何人都能往任何箱子写入，所以：
  - 客户端遇到解不开或格式不对的条目，**跳过并继续推进游标**，不能抛出异常；
  - `delegated`、`receipt` 等消息一律当作不可信数据，展示前要和链上状态核对（凭证已签发、票据在树中、交易真实存在）。
- 客户端统一用 libsodium-wrappers 0.7.15（见 `docs/ARCHITECTURE.md` §2）。

## 10. 部署文件

`deployments/<network>.json`：
```json
{ "chainId": 84532, "gate": "0x..", "registry": "0x..", "revocations": "0x..", "group": "0x..", "payout": "0x..",
  "treasury": "0x..", "vault": "0x..", "token": "0x..", "verifiers": {"d1": "0x..", "d2": "0x..", "reg": "0x..", "revoke": "0x..", "transfer": "0x..", "mint": "0x.."},
  "startBlock": 0, "facilitator": "https://..", "mailbox": "https://.." }
```

## 11. 票据备忘与恢复

票据的 `rho` 一律用 CSPRNG 生成，**不从种子派生**（派生法恢复不了私有金额，且序号重复会冻结资金）。每张新票据在同一笔交易里附一段加密备忘，合约原样写进 `NoteMemo` 事件，不做验证。

| 函数 | 备忘参数 | 收件人 |
|---|---|---|
| `Gate.deposit(proof, cm, q, memo)` | `memo` | 主人信箱公钥（票据归管家） |
| `Gate.transferBudget(..., memo1, memo2)` | 每个输出一段 | 归管家的那张 → 主人；分给 Agent 的那张 → 该 Agent 的信箱公钥 |
| `Gate.execute(..., memoChange)` | 找零票据 | 花钱的 Agent 自己（主人钱包付款时 → 主人）；已绑定进 `ctx_hash` |
| `Gate.depositFromAdapter(cm, q, memo)` | 存入时承诺的 `returnMemo` | 理财 Agent 自己 |
| `ShadowToken.faucetDeposit(proof, cm, q, memo)` | `memo` | 主人 |

格式：
```
plaintext = 0x01 || own.x(32) || own.y(32) || q(8, big-endian) || lin0..lin3(4 x 32) || rho(32)    // 233 字节
memo      = crypto_box_seal(plaintext, recipientBoxPk)                                            // libsodium 匿名密封盒，281 字节
```

恢复：扫描 `NoteMemo`，用信箱私钥逐条尝试解密；解开后**用明文重算 `cm`，必须等于事件里的 `cm`**（防止无效备忘）；再用持有人私钥算出 nullifier，检查是否已花。未花的就是自己的票据。

已知限制：`deposit`、`transferBudget` 的备忘不在证明里，转发方可以把它换成垃圾数据，这会导致这张票据无法从链上恢复，但钱不会丢。所以钱包和 MCP 在本地也保存票据，并在交易确认后检查事件里的备忘是否和自己发出的一致。

## 12. 入金

| 方式 | 流程 | gas |
|---|---|---|
| 从外部钱包充值（真实流程） | 钱包页面经 EIP-1193（MetaMask 等）连接外部地址 → 本地生成 `budget_mint` 证明和 `cm` → 外部钱包发出 `approve` 和 `Gate.deposit` | 外部地址支付 |
| 测试网一键领取（演示） | `ShadowToken.faucetDeposit`：代币合约给自己铸币、授权 Gate、代为调用 `deposit`。走 facilitator 代付时 `msg.sender` 都是 facilitator，所以合约只设全局每日上限，单个用户的限额由 facilitator 按 IP 控制 | facilitator 代付 |

入金是公开的（谁、何时、多少）。钱包只提供固定面额（10 / 50 / 100），并提示入金后隔一段时间再分给 Agent，以减少关联。分给 Agent 的 `transferBudget` 是私密的。入金得到的票据：`owner = 管家（ent1）`，`lin = [cert0, 0, 0, 0]`。

## 13. 种子信封的备份与恢复

信封（§3）本身已加密，备份在信箱服务的**备份槽**里，用于换浏览器或换电脑后恢复。备份槽和消息箱是两组独立接口，规则不同：

```
POST /slot/:slot      body: { "ct": "<base64 信封>" }（只允许这一个字段）   -> 201 { "id": n }
GET  /slot/:slot?after=n                                                    -> 200 [{ "id", "ct", "ts" }]
```

| 槽 | 槽 ID（64 个 hex） | 内容 |
|---|---|---|
| passkey 槽 | `sha256(UTF-8("shadowpass/slot/passkey/") ‖ UTF-8(base64url_nopad(rawId)))` | mode 0 信封 |
| 恢复码槽 | `sha256(UTF-8("shadowpass/slot/recovery/") ‖ UTF-8(规范化恢复码))` | mode 1 信封 |

`rawId` 是 WebAuthn 凭证的原始 ID 字节，`base64url_nopad` 是不带 `=` 的 base64url 编码。

服务端规则（与 §9 的消息箱不同）：
- **不过期、不淘汰**。每个槽最多 16 条，写满后拒绝新写入（409）。
- `ct` 解码后必须是一个格式正确的 `SPW1` 信封：81 字节，前 4 字节为 `SPW1`，mode 为 0 或 1；否则返回 400。
- 限流同 §9；日志不记录槽 ID 和 `ct`。

客户端规则：
- 恢复时拉取槽内全部条目（按 §9 的方式翻页），逐条尝试解开，解得开的才算数（AES-GCM 的 tag 保证不会误解）。
- 槽 ID 只有持有 passkey 或恢复码的人才算得出来，外人无法定位到槽，也就无法往里灌垃圾数据。信箱运营方能看到槽 ID 和条数，也有能力删掉数据，所以钱包要同时在本地保留信封；“没有配置信箱”时，不能声称“可以换设备恢复”。
- 写备份失败时，不能显示恢复码，也不能把钱包标记为已创建；要么重试成功，要么整体回滚。
- 恢复出 seed 之后，按 §11 扫描 `NoteMemo` 找回票据，按 §6 同步链上状态。

## 14. facilitator 的钱包交易代付接口

用户钱包没有 ETH，开通、领币、发卡、吊销这几类交易由 facilitator 代为发送。facilitator **只转发下表中的调用**，参数原样传入合约，自己不做任何授权判断（授权由证明和合约保证）。

```
POST /relay/:action      body: { "args": { ... } }       -> 200 { "transaction": "0x..", "blockNumber": "..", "logs": [...] }
```

| `action` | 调用的合约函数 |
|---|---|
| `join` | `ShadowGroup.join(commitment)` |
| `register` | `ShadowRegistry.register(proof, groupRoot, nf, leaf0, siblingNodes)` |
| `faucetDeposit` | `ShadowToken.faucetDeposit(proof, cm, q, memo)` |
| `issue` | `ShadowGate.issue(certHash)` |
| `transferBudget` | `ShadowGate.transferBudget(proof, noteRoot, revokedRoot, nullifier, cm1, cm2, memo1, memo2)` |
| `revoke` | `ShadowRevocations.revoke(proof, newRoot, entry)` |
| `registerState` | `ShadowGate.registerState(issued, revoked, root)` |

- 发送前先 `eth_call` 模拟，失败就返回 400 和 revert 名称，不上链。
- 按 IP 限流（`faucetDeposit` 每 IP 每天 1 次），可信代理头的规则同 §9。
- 真实入金（§12，从 MetaMask 发出）不经过这里。
