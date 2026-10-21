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

```
seed      = 32 字节随机数，开通时生成一次
wrap_i    = AES-256-GCM(key = HKDF-SHA256(PRF(passkey_i, salt="shadowpass-v1"), info="wrap"), seed)
recovery  = AES-256-GCM(key = scrypt(恢复码), seed)
sign_prv  = HKDF-SHA256(seed, info="shadowpass/sign", 32 字节)   -> identity(sign_prv)（world.mjs 的推导）
vsk       = HKDF-SHA256(seed, info="shadowpass/view", 64 字节) mod L，为 0 时换 info 后缀重试
box_sk    = HKDF-SHA256(seed, info="shadowpass/box", 32 字节)    -> X25519 信箱私钥
steward_prv = HKDF-SHA256(seed, info="shadowpass/steward", 32 字节) -> identity(steward_prv)，管家分配钥（ent1）
```

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
ctx_hash = uint256(keccak256(abi.encode(block.chainid, address(gate), act.method, act.target, act.params, act.amount, act.nonce))) >> 8;
```

- `amount` 必须等于 `q_spent`。`requiredCap[method]` 由 Gate 管理员通过 `setMethod` 配置，作为 `act_req_cap` 公开输入。
- 方法：`PAY = bytes4(keccak256("shadowpass.PAY"))` 要求能力 `PAY`；`TREASURY_SUPPLY = bytes4(keccak256("shadowpass.TREASURY_SUPPLY"))` 要求能力 `TREASURY`。
- 付款：`target = ShadowPayout`，`params = abi.encode(payTo, reqHash)`，`reqHash = keccak256(abi.encode(network, asset, amount, payTo, resourceUrl))`。
- 理财存入（定期存款语义）：`method = TREASURY_SUPPLY`，`target = TreasuryAdapter`，`params = abi.encode(vault, term, returnCm, expectedQ)`。到期后任何人可调用 `TreasuryAdapter.withdraw(positionId)`，赎回并以 `returnCm`（面额 `expectedQ`，由理财 Agent 在存入时承诺）存回资金池；多出的部分进储备，不足时报 `Shortfall` 并不铸票据。
- 资金流（推送模型）：Gate 在验证通过后先把 `amount` 个代币转给 `target`，再调用 `target.onAuthorized(method, amount, params)`。资金回流只走 `Gate.depositFromAdapter(cm, q)`，只允许白名单 adapter 调用，代币先转入 Gate。

## 6. 链上事件（前端和 MCP 靠它们重建状态）

| 合约 | 事件 | 用途 |
|---|---|---|
| Gate | `Executed(budgetNf, target, method, amount)` | 付款记录 |
| Gate | `OwnerCiphertext(budgetNf, uint256[] ct)` | 主人扫描解密（取代 v9 的 `Accountability`） |
| Gate | `NoteInserted(cm, index, newRoot)` | 重建票据树 |
| Gate / 签发树 | `Issued(certHash, index, newRoot)` | 重建签发树 |
| Registry | `Registered(nf, leaf0, root)` / `Replaced(...)` | 重建根凭证树 |
| Revocations | `Revoked(entry, index, oldRoot, newRoot)` | 重建撤销 IMT |
| 群组 | `Joined(commitment, index, root)` | 重建群组树 |

状态根有宽限窗口；demo 部署时窗口设为几秒。

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

- 付款要求（402 里的 `accepts[i]`）：`scheme = "shadowpass"`，`network = "eip155:84532"`，`asset` = 测试代币地址，`amount` = 最小单位，`payTo`，`extra = { gate, payout }`。
- 付款凭据（`PaymentPayload.payload`）：
```json
{ "D": 2, "proof": {"a": [], "b": [[], []], "c": []}, "roots": {"issued": "..", "revoked": "..", "root": ".."},
  "nowTs": "..", "action": {"target": "0x..", "method": "0x..", "amount": "..", "nonce": "..", "params": "0x.."},
  "ct": ["..."], "budget": {"noteRoot": "..", "budgetNf": "..", "cmChange": "..", "qSpent": ".."} }
```
- 流程：`upfront`（先 settle 再交付）。facilitator `/verify` 检查 `payTo`、`amount`、`reqHash`，然后 `eth_call` 模拟 `Gate.execute`；`/settle` 发送交易。参考：`spikes/x402-scheme/`。

## 9. 信箱 API

```
POST /box/:recipient        body: { "ct": "<base64 sealed box>" }   -> { "id": n }
GET  /box/:recipient?after=n                                          -> [{ "id", "ct", "ts" }]
```
`recipient` 是收件人 X25519 公钥的 hex。内容用 libsodium `crypto_box_seal` 加密，服务端只存密文。

## 10. 部署文件

`deployments/<network>.json`：
```json
{ "chainId": 84532, "gate": "0x..", "registry": "0x..", "revocations": "0x..", "group": "0x..", "payout": "0x..",
  "treasury": "0x..", "vault": "0x..", "token": "0x..", "verifiers": {"d1": "0x..", "d2": "0x..", "reg": "0x..", "revoke": "0x..", "transfer": "0x..", "mint": "0x.."},
  "startBlock": 0, "facilitator": "https://..", "mailbox": "https://.." }
```
