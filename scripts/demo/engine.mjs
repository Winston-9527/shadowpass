import crypto from "node:crypto";
import {
  createPublicClient,
  createWalletClient,
  encodeAbiParameters,
  http,
  keccak256,
  parseAbi,
  toHex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { wrapFetchWithPayment } from "@x402/fetch";
import { assembleShadowpassPayload, createShadowpassClient } from "@shadowpass/x402";
import {
  ChainState,
  actionInput,
  ctxHash,
  deriveKeys,
  encodeNoteMemo,
  issue,
  issueRoot,
  loadArtifacts,
  mintInput,
  noteCm,
  openChain,
  prove,
  registerInput,
  reqHash,
  toCalldata,
  transferInput,
} from "@shadowpass/sdk";
import { poseidon2 } from "poseidon-lite";
import { CIRCUITS } from "./artifacts.mjs";
import { buildComparison } from "./comparison.mjs";

const PAY = 1n;
const TREASURY = 2n;
const USDC = 1_000_000n;
const SIMULATED_USERS = 20;
const SIMULATED_DEPOSIT = 1n * USDC;
const MAIN_DEPOSIT = 75n * USDC;
const BUYER_BUDGET = 40n * USDC;
const TREASURY_BUDGET = 25n * USDC;
const TERM_SECONDS = 24n * 60n * 60n;
const DOMAIN = 7n;

const proof = "(uint256[2] a,uint256[2][2] b,uint256[2] c) proof";
const groupAbi = parseAbi([
  "function join(uint256 commitment)",
  "function currentRoot() view returns (uint256)",
  "function size() view returns (uint256)",
]);
const registryAbi = parseAbi([
  `function register(${proof},uint256 groupRoot,uint256 nf,uint256 leaf0,uint256[] siblingNodes)`,
]);
const tokenAbi = parseAbi([
  `function faucetDeposit(${proof},uint256 cm,uint256 q,bytes memo)`,
]);
const gateAbi = parseAbi([
  "function issue(uint256 certHash)",
  `function transferBudget(${proof},uint256 noteRoot,uint256 revokedRoot,uint256 nullifier,uint256 cm1,uint256 cm2,bytes memo1,bytes memo2)`,
  `function execute(${proof},(uint256 issued,uint256 revoked,uint256 root) roots,uint64 nowTs,(address target,bytes4 method,uint256 amount,uint256 nonce,bytes params) action,uint256[] ct,(uint256 noteRoot,uint256 budgetNf,uint256 cmChange,uint256 qSpent) budget,bytes memoChange)`,
  "function registerState(uint256 issued,uint256 revoked,uint256 root) returns (uint256)",
]);
const treasuryAbi = parseAbi([
  "function quote(address vault,uint256 amount,uint256 term) view returns (uint256)",
  "function withdraw(uint256 positionId)",
  "function nextPositionId() view returns (uint256)",
]);

function sha256(value) {
  return crypto.createHash("sha256").update(value).digest();
}

function seedFor(label) {
  return sha256(`shadowpass-demo:${label}`);
}

function privateKeyFor(label) {
  return `0x${sha256(`shadowpass-demo:${label}:eoa`).toString("hex")}`;
}

function randomHex(label) {
  return `0x${sha256(`shadowpass-demo:${label}:${crypto.randomUUID()}`).toString("hex")}`;
}

function deterministicRandom(label) {
  let counter = 0;
  return (length) => {
    const chunks = [];
    let size = 0;
    while (size < length) {
      const chunk = sha256(`${label}:${counter++}`);
      chunks.push(chunk);
      size += chunk.length;
    }
    return Buffer.concat(chunks).subarray(0, length);
  };
}

function ensure(condition, message) {
  if (!condition) throw new Error(message);
}

function pointKey(point) {
  return `${point.x}:${point.y}`;
}

function jsonSafe(value) {
  return JSON.parse(JSON.stringify(value, (_key, child) => typeof child === "bigint" ? child.toString() : child));
}

const TREASURY_METHOD = keccak256(toHex("shadowpass.TREASURY_SUPPLY")).slice(0, 10);

export class DemoEngine {
  constructor(options) {
    this.root = options.root;
    this.deployment = options.deployment;
    this.rpcUrl = options.rpcUrl;
    this.merchantUrl = options.merchantUrl;
    this.facilitatorUrl = options.facilitatorUrl;
    this.merchantPayTo = options.merchantPayTo;
    this.artifactDir = options.artifactDir;
    this.manifestHashes = options.manifestHashes;
    this.deployer = privateKeyToAccount(options.deployerPrivateKey);
    this.account = this.deployer;
    this.publicClient = createPublicClient({ transport: http(options.rpcUrl) });
    this.walletClient = createWalletClient({ account: this.deployer, transport: http(options.rpcUrl) });
    this.state = undefined;
    this.artifacts = new Map();
    this.actions = [];
    this.transactions = [];
    this.simulated = [];
    this.notes = {};
    this.positions = {};
    this.startedAt = new Date().toISOString();
    this.mutex = Promise.resolve();
  }

  async initializeArtifacts() {
    for (const circuit of CIRCUITS) {
      this.artifacts.set(circuit, await loadArtifacts({
        circuit,
        dir: this.artifactDir,
        trustedHashes: this.manifestHashes,
      }));
    }
  }

  async send({ address, abi, functionName, args, client = this.walletClient, label }) {
    const hash = await client.writeContract({
      account: client.account,
      chain: null,
      address,
      abi,
      functionName,
      args,
    });
    const receipt = await this.publicClient.waitForTransactionReceipt({ hash, confirmations: 1 });
    if (receipt.status !== "success") throw new Error(`${label ?? functionName} reverted: ${hash}`);
    const record = {
      label: label ?? functionName,
      hash,
      blockNumber: Number(receipt.blockNumber),
    };
    this.transactions.push(record);
    return { hash, receipt, record };
  }

  async prove(circuit, input) {
    const artifacts = this.artifacts.get(circuit);
    ensure(artifacts, `missing artifacts for ${circuit}`);
    const started = performance.now();
    const result = await prove(circuit, input, artifacts);
    const calldata = toCalldata(result.proof, result.publicSignals);
    return {
      proof: { a: calldata.a, b: calldata.b, c: calldata.c },
      publicSignals: calldata.publicSignals,
      proofMs: performance.now() - started,
    };
  }

  async sync() {
    this.state = await ChainState.sync({
      getLogs: async (args) => {
        const latest = await this.publicClient.getBlockNumber();
        const toBlock = args.toBlock !== undefined && BigInt(args.toBlock) >= latest ? "latest" : args.toBlock;
        return this.publicClient.getLogs({ ...args, toBlock });
      },
      getBlockNumber: () => this.publicClient.getBlockNumber(),
    }, this.deployment);
    return this.state;
  }

  roots() {
    return {
      issued: this.state.issued.root,
      revoked: this.state.revoked.root,
      root: this.state.rootTree.root,
    };
  }

  async registerCurrentState(label = "register state roots") {
    await this.sync();
    const roots = this.roots();
    await this.send({
      address: this.deployment.gate,
      abi: gateAbi,
      functionName: "registerState",
      args: [roots.issued, roots.revoked, roots.root],
      label,
    });
    await this.sync();
  }

  async createSimulatedDepositors() {
    for (let index = 0; index < SIMULATED_USERS; index += 1) {
      const keys = await deriveKeys(seedFor(`simulated-user-${index}`));
      const privateKey = privateKeyFor(`simulated-user-${index}`);
      const account = privateKeyToAccount(privateKey);
      const client = createWalletClient({ account, transport: http(this.rpcUrl) });
      await this.publicClient.request({
        method: "anvil_setBalance",
        params: [account.address, "0x56BC75E2D63100000"],
      });
      const note = {
        own: [keys.sign.Ax, keys.sign.Ay],
        q: SIMULATED_DEPOSIT,
        lin: [0n, 0n, 0n, 0n],
        rho: BigInt(`0x${sha256(`simulated-note-${index}`).toString("hex")}`) % (1n << 250n),
      };
      const witness = mintInput(note);
      const result = await this.prove("budget_mint", witness);
      const memo = await encodeNoteMemo(note, keys.box.publicKey);
      const tx = await this.send({
        address: this.deployment.token,
        abi: tokenAbi,
        functionName: "faucetDeposit",
        args: [result.proof, noteCm(note), note.q, toHex(memo)],
        client,
        label: `模拟用户 #${index + 1} 入金`,
      });
      this.simulated.push({
        index: index + 1,
        depositor: account.address,
        cm: noteCm(note),
        q: note.q,
        tx: tx.hash,
        proofMs: result.proofMs,
      });
    }
  }

  async registerAlice(alice, steward, cert0) {
    const commitment = poseidon2([alice.sign.Ax, alice.sign.Ay]);
    await this.send({
      address: this.deployment.group,
      abi: groupAbi,
      functionName: "join",
      args: [commitment],
      label: "加入身份组",
    });
    await this.sync();
    const chainGroupRoot = await this.publicClient.readContract({
      address: this.deployment.group,
      abi: groupAbi,
      functionName: "currentRoot",
    });
    const rawGroupLogs = await this.publicClient.getLogs({
      address: this.deployment.group,
      fromBlock: BigInt(this.deployment.startBlock),
      toBlock: "latest",
    });
    ensure(
      this.state.group.root === chainGroupRoot && this.state.group.leaves.includes(commitment),
      `identity group sync mismatch: chain=${chainGroupRoot} local=${this.state.group.root} leaves=${this.state.group.leaves.join(",")} rawLogs=${rawGroupLogs.length} topic=${rawGroupLogs[0]?.topics?.[0]} expected=${keccak256(toHex("Joined(uint256,uint256,uint256)"))} startBlock=${this.deployment.startBlock}`,
    );

    const witness = registerInput({
      human: alice.sign,
      cert0,
      domain: DOMAIN,
      state: this.state,
    });
    const result = await this.prove("main_reg", witness);
    await this.send({
      address: this.deployment.registry,
      abi: registryAbi,
      functionName: "register",
      args: [
        result.proof,
        BigInt(witness.group_root),
        BigInt(witness.nf_domain),
        BigInt(witness.leaf0),
        witness.siblings.map((value) => BigInt(value)),
      ],
      label: "注册 Alice 根凭证",
    });
    await this.sync();
    return { commitment, proofMs: result.proofMs };
  }

  async depositStewardNote(alice, steward, cert0) {
    const note = {
      own: [steward.sign.Ax, steward.sign.Ay],
      q: MAIN_DEPOSIT,
      lin: [cert0.hash, 0n, 0n, 0n],
      rho: BigInt(`0x${sha256("alice-main-note").toString("hex")}`) % (1n << 250n),
    };
    const result = await this.prove("budget_mint", mintInput(note));
    const memo = await encodeNoteMemo(note, alice.box.publicKey);
    await this.send({
      address: this.deployment.token,
      abi: tokenAbi,
      functionName: "faucetDeposit",
      args: [result.proof, noteCm(note), note.q, toHex(memo)],
      label: "Alice 入金 75 spUSD",
    });
    await this.sync();
    return { note, proofMs: result.proofMs };
  }

  async transferBudget({ holder, note, child, firstAmount, label }) {
    const secondAmount = note.q - firstAmount;
    const witness = transferInput({
      holder,
      note,
      child,
      q1: firstAmount,
      q2: secondAmount,
      state: this.state,
      random: deterministicRandom(`${label}:transfer`),
    });
    const result = await this.prove("budget_transfer", witness.input);
    const memo1 = await encodeNoteMemo(witness.out1, child.holder === holder ? holder.box?.publicKey : this.agentBox(child.holder.Ax));
    const memo2 = await encodeNoteMemo(witness.out2, this.stewardBox);
    const publicSignals = result.publicSignals;
    await this.send({
      address: this.deployment.gate,
      abi: gateAbi,
      functionName: "transferBudget",
      args: [
        result.proof,
        BigInt(publicSignals[0]),
        BigInt(publicSignals[1]),
        BigInt(publicSignals[2]),
        BigInt(publicSignals[3]),
        BigInt(publicSignals[4]),
        toHex(memo1),
        toHex(memo2),
      ],
      label,
    });
    await this.sync();
    return { out1: witness.out1, out2: witness.out2, proofMs: result.proofMs };
  }

  agentBox(ax) {
    const entry = Object.entries(this.boxes).find(([, point]) => point.x === ax);
    ensure(entry, `missing mailbox key for ${ax}`);
    return entry[1].box;
  }

  async prepare() {
    await this.initializeArtifacts();
    await this.sync();
    await this.createSimulatedDepositors();

    const alice = await deriveKeys(seedFor("alice"));
    const steward = await deriveKeys(seedFor("steward"));
    const buyer = await deriveKeys(seedFor("buyer"));
    const treasury = await deriveKeys(seedFor("treasury"));
    this.boxes = {
      alice: { x: alice.sign.Ax, box: alice.box.publicKey },
      steward: { x: steward.sign.Ax, box: steward.box.publicKey },
      buyer: { x: buyer.sign.Ax, box: buyer.box.publicKey },
      treasury: { x: treasury.sign.Ax, box: treasury.box.publicKey },
    };
    this.stewardBox = steward.box.publicKey;

    const block = await this.publicClient.getBlock({ blockTag: "latest" });
    const expiry = block.timestamp + 7n * 24n * 60n * 60n;
    const cert0 = issueRoot(
      alice.sign,
      steward.sign,
      PAY | TREASURY,
      expiry,
      alice.view.vpk,
      alice.view.w,
    );
    const registration = await this.registerAlice(alice, steward, cert0);
    const buyerCert = issue(cert0, buyer.sign, PAY, expiry);
    const treasuryCert = issue(cert0, treasury.sign, TREASURY, expiry);
    await this.send({
      address: this.deployment.gate,
      abi: gateAbi,
      functionName: "issue",
      args: [buyerCert.hash],
      label: "签发采购凭证",
    });
    await this.send({
      address: this.deployment.gate,
      abi: gateAbi,
      functionName: "issue",
      args: [treasuryCert.hash],
      label: "签发理财凭证",
    });
    await this.sync();

    const deposit = await this.depositStewardNote(alice, steward, cert0);
    const firstTransfer = await this.transferBudget({
      holder: steward.sign,
      note: deposit.note,
      child: buyerCert,
      firstAmount: BUYER_BUDGET,
      label: "划拨采购预算 40 spUSD",
    });
    const secondTransfer = await this.transferBudget({
      holder: steward.sign,
      note: firstTransfer.out2,
      child: treasuryCert,
      firstAmount: TREASURY_BUDGET,
      label: "划拨理财预算 25 spUSD",
    });

    this.notes = {
      steward: secondTransfer.out2,
      buyer: firstTransfer.out1,
      treasury: secondTransfer.out1,
      treasuryReturn: undefined,
    };
    this.identities = { alice, steward, buyer, treasury };
    this.certificates = { cert0, buyer: buyerCert, treasury: treasuryCert };
    this.expiry = expiry;
    this.groupJoin = registration;
    await this.registerCurrentState("注册初始状态根");
    return this.getSnapshot();
  }

  async executeTreasury() {
    ensure(!this.positions.supply, "treasury supply already executed");
    await this.sync();
    const amount = 20n * USDC;
    const term = TERM_SECONDS;
    const quote = await this.publicClient.readContract({
      address: this.deployment.treasury,
      abi: treasuryAbi,
      functionName: "quote",
      args: [this.deployment.vault, amount, term],
    });
    ensure(quote > 0n, "vault quote is zero");
    const returnNote = {
      own: [this.identities.treasury.sign.Ax, this.identities.treasury.sign.Ay],
      q: quote,
      lin: [this.certificates.cert0.hash, this.certificates.treasury.hash, 0n, 0n],
      rho: BigInt(`0x${sha256("treasury-return-note").toString("hex")}`) % (1n << 250n),
    };
    const returnMemo = await encodeNoteMemo(returnNote, this.identities.treasury.box.publicKey);
    const nonce = BigInt(`0x${randomHex("treasury-nonce").slice(2)}`) % (1n << 250n);
    const params = encodeAbiParameters(
      [
        { type: "address" },
        { type: "uint256" },
        { type: "uint256" },
        { type: "uint256" },
        { type: "bytes" },
      ],
      [this.deployment.vault, term, noteCm(returnNote), quote, toHex(returnMemo)],
    );
    const action = {
      target: this.deployment.treasury,
      method: TREASURY_METHOD,
      amount,
      nonce,
      params,
    };
    const memoChangeLabel = "treasury-change";
    const placeholder = randomHex(memoChangeLabel);
    const first = actionInput({
      chain: [this.certificates.cert0, this.certificates.treasury],
      holderSk: this.identities.treasury.sign.sk,
      note: this.notes.treasury,
      qSpent: amount,
      ctxHash: ctxHash({ chainId: this.deployment.chainId, gate: this.deployment.gate, action, memoChange: placeholder }),
      reqCap: TREASURY,
      now: (await this.publicClient.getBlock({ blockTag: "latest" })).timestamp,
      state: this.state,
      random: deterministicRandom(memoChangeLabel),
    });
    const memoChange = await encodeNoteMemo(first.change, this.identities.treasury.box.publicKey);
    const now = (await this.publicClient.getBlock({ blockTag: "latest" })).timestamp;
    const built = actionInput({
      chain: [this.certificates.cert0, this.certificates.treasury],
      holderSk: this.identities.treasury.sign.sk,
      note: this.notes.treasury,
      qSpent: amount,
      ctxHash: ctxHash({ chainId: this.deployment.chainId, gate: this.deployment.gate, action, memoChange }),
      reqCap: TREASURY,
      now,
      state: this.state,
      random: deterministicRandom(memoChangeLabel),
    });
    const proofResult = await this.prove("main_d2", built.input);
    const publicSignals = proofResult.publicSignals;
    const ctLength = 8;
    const ct = publicSignals.slice(4, 4 + ctLength);
    const roots = this.roots();
    const tx = await this.send({
      address: this.deployment.gate,
      abi: gateAbi,
      functionName: "execute",
      args: [
        proofResult.proof,
        roots,
        now,
        action,
        ct.map((value) => BigInt(value)),
        {
          noteRoot: BigInt(publicSignals[12]),
          budgetNf: BigInt(publicSignals[13]),
          cmChange: BigInt(publicSignals[14]),
          qSpent: BigInt(publicSignals[15]),
        },
        toHex(memoChange),
      ],
      label: "理财 Agent 存入白名单金库",
    });
    const nextPositionId = await this.publicClient.readContract({
      address: this.deployment.treasury,
      abi: treasuryAbi,
      functionName: "nextPositionId",
    });
    const positionId = nextPositionId - 1n;
    const ownerView = this.decryptOwnerChain(built.ct);
    this.notes.treasury = built.change;
    this.notes.treasuryReturn = returnNote;
    this.positions = { supply: true, positionId, returnCm: noteCm(returnNote), expectedQ: quote, term, tx: tx.hash };
    const record = {
      operation: "treasury",
      label: "理财 Agent 将 20 spUSD 存入模拟 ERC-4626 金库",
      amount,
      payTo: this.deployment.treasury,
      tx: tx.hash,
      proofMs: proofResult.proofMs,
      ownerView,
      createdAt: new Date().toISOString(),
    };
    this.actions.push(record);
    await this.sync();
    return { record: jsonSafe(record), comparison: jsonSafe(this.comparison("treasury")) };
  }

  async withdrawTreasury() {
    ensure(this.positions.supply, "treasury supply has not executed");
    ensure(!this.positions.withdraw, "treasury position already withdrawn");
    await this.publicClient.request({ method: "evm_increaseTime", params: [Number(TERM_SECONDS + 1n)] });
    await this.publicClient.request({ method: "evm_mine", params: [] });
    const tx = await this.send({
      address: this.deployment.treasury,
      abi: treasuryAbi,
      functionName: "withdraw",
      args: [this.positions.positionId],
      label: "到期赎回并生成承诺票据",
    });
    await this.sync();
    ensure(this.state.notes.leaves.includes(noteCm(this.notes.treasuryReturn)), "return note was not inserted");
    this.positions.withdraw = true;
    const record = {
      operation: "treasury_withdraw",
      label: "金库到期，本金和收益回到预先承诺的票据",
      amount: this.positions.expectedQ,
      payTo: this.deployment.treasury,
      tx: tx.hash,
      createdAt: new Date().toISOString(),
    };
    this.actions.push(record);
    return { record: jsonSafe(record) };
  }

  async purchase() {
    ensure(this.notes.buyer && this.notes.buyer.q >= 2n * USDC, "buyer budget is exhausted");
    await this.registerCurrentState("注册采购前状态根");
    const noteBefore = this.notes.buyer;
    const builder = {
      buildPayment: async (requirements, resourceUrl) => {
        const holder = this.identities.buyer;
        const requestHash = reqHash({
          network: requirements.network,
          asset: requirements.asset,
          amount: BigInt(requirements.amount),
          payTo: requirements.payTo,
          resource: resourceUrl,
        });
        const params = encodeAbiParameters(
          [{ type: "address" }, { type: "bytes32" }],
          [requirements.payTo, requestHash],
        );
        const action = {
          target: requirements.extra.payout,
          method: requirements.extra.method,
          amount: BigInt(requirements.amount),
          nonce: BigInt(`0x${randomHex("purchase-nonce").slice(2)}`) % (1n << 250n),
          params,
        };
        const now = (await this.publicClient.getBlock({ blockTag: "latest" })).timestamp;
        const memoLabel = "purchase-change";
        const placeholder = randomHex(memoLabel);
        const first = actionInput({
          chain: [this.certificates.cert0, this.certificates.buyer],
          holderSk: holder.sign.sk,
          note: noteBefore,
          qSpent: action.amount,
          ctxHash: ctxHash({ chainId: this.deployment.chainId, gate: this.deployment.gate, action, memoChange: placeholder }),
          reqCap: PAY,
          now,
          state: this.state,
          random: deterministicRandom(memoLabel),
        });
        const memoChange = await encodeNoteMemo(first.change, holder.box.publicKey);
        const built = actionInput({
          chain: [this.certificates.cert0, this.certificates.buyer],
          holderSk: holder.sign.sk,
          note: noteBefore,
          qSpent: action.amount,
          ctxHash: ctxHash({ chainId: this.deployment.chainId, gate: this.deployment.gate, action, memoChange }),
          reqCap: PAY,
          now,
          state: this.state,
          random: deterministicRandom(memoLabel),
        });
        const proved = await this.prove("main_d2", built.input);
        const ct = proved.publicSignals.slice(4, 12);
        const currentRoots = this.roots();
        const payload = assembleShadowpassPayload({
          requirements,
          resourceUrl,
          proof: proved.proof,
          roots: {
            issued: currentRoots.issued.toString(),
            revoked: currentRoots.revoked.toString(),
            root: currentRoots.root.toString(),
          },
          nowTs: now,
          nonce: action.nonce,
          ct,
          budget: {
            noteRoot: proved.publicSignals[12],
            budgetNf: proved.publicSignals[13],
            cmChange: proved.publicSignals[14],
            qSpent: proved.publicSignals[15],
          },
          memoChange: toHex(memoChange),
        });
        payload.timings = { proofMs: proved.proofMs };
        this.pendingPurchase = {
          note: built.change,
          ownerView: this.decryptOwnerChain(built.ct),
          proofMs: proved.proofMs,
        };
        return payload;
      },
    };
    const paidFetch = wrapFetchWithPayment(fetch, createShadowpassClient({
      builder,
      network: `eip155:${this.deployment.chainId}`,
      spendControls: {
        allowedAssets: [{
          network: `eip155:${this.deployment.chainId}`,
          asset: this.deployment.token,
          maxAmountPerPayment: "2000000",
        }],
      },
    }));
    const response = await paidFetch(`${this.merchantUrl}/report`);
    const body = await response.json().catch(() => ({}));
    ensure(response.status === 200, `x402 purchase failed: HTTP ${response.status} ${JSON.stringify(body)}`);
    ensure(this.pendingPurchase, "payment builder did not run");
    this.notes.buyer = this.pendingPurchase.note;
    await this.sync();
    ensure(this.state.notes.leaves.includes(noteCm(this.notes.buyer)), "purchase change note was not inserted");

    const metrics = await fetch(`${this.facilitatorUrl}/metrics`).then((item) => item.json());
    const settlement = [...metrics.records].reverse().find((record) => record.operation === "settle" && record.transaction);
    const record = {
      operation: "purchase",
      label: "采购 Agent 通过 x402 购买市场报告",
      amount: 2n * USDC,
      payTo: this.merchantPayTo,
      tx: settlement?.transaction ?? null,
      proofMs: this.pendingPurchase.proofMs,
      ownerView: this.pendingPurchase.ownerView,
      merchantBody: body,
      createdAt: new Date().toISOString(),
    };
    this.actions.push(record);
    this.pendingPurchase = undefined;
    return {
      record: jsonSafe(record),
      comparison: jsonSafe(this.comparison("purchase")),
    };
  }

  decryptOwnerChain(ciphertext) {
    const points = openChain(ciphertext, this.identities.alice.view.vsk);
    ensure(points, "owner could not decrypt chain");
    const labels = new Map([
      [pointKey({ x: this.identities.alice.sign.Ax, y: this.identities.alice.sign.Ay }), "Alice"],
      [pointKey({ x: this.identities.steward.sign.Ax, y: this.identities.steward.sign.Ay }), "管家"],
      [pointKey({ x: this.identities.buyer.sign.Ax, y: this.identities.buyer.sign.Ay }), "采购 Agent"],
      [pointKey({ x: this.identities.treasury.sign.Ax, y: this.identities.treasury.sign.Ay }), "理财 Agent"],
    ]);
    return points.map((point) => labels.get(pointKey(point)) ?? "未知实体");
  }

  comparison(operation = "purchase") {
    const record = [...this.actions].reverse().find((entry) => (
      entry.operation === operation
    ));
    return buildComparison({
      operation,
      transaction: record?.tx,
      amount: record?.amount ?? (operation === "treasury" ? 20n * USDC : 2n * USDC),
      payTo: record?.payTo ?? (operation === "treasury" ? this.deployment.treasury : undefined),
      proofMs: record?.proofMs,
    });
  }

  getSnapshot() {
    const branchState = {
      buyer: {
        name: "采购 Agent",
        capabilities: ["PAY"],
        budget: this.notes.buyer?.q ?? BUYER_BUDGET,
        initialBudget: BUYER_BUDGET,
        status: this.actions.some((entry) => entry.operation === "purchase") ? "已执行" : "待执行",
      },
      treasury: {
        name: "理财 Agent",
        capabilities: ["TREASURY"],
        budget: this.notes.treasury?.q ?? TREASURY_BUDGET,
        initialBudget: TREASURY_BUDGET,
        status: this.positions.withdraw ? "已赎回" : this.positions.supply ? "已存入" : "待执行",
      },
    };
    return jsonSafe({
      generatedAt: new Date().toISOString(),
      startedAt: this.startedAt,
      simulated: true,
      simulatedLabel: "本地模拟环境 · 链上交易真实执行 · 20 个匿名集用户为预置数据",
      network: {
        name: "Anvil",
        chainId: this.deployment.chainId,
        gate: this.deployment.gate,
        token: this.deployment.token,
        payout: this.deployment.payout,
        treasury: this.deployment.treasury,
        vault: this.deployment.vault,
        merchantUrl: this.merchantUrl,
      },
      anonymity: {
        simulatedDepositors: this.simulated.length,
        simulatedDeposits: this.simulated.reduce((sum, item) => sum + item.q, 0n).toString(),
        noteSetSize: this.state?.notes.size ?? 0,
        registeredIdentities: this.state?.group.size ?? 0,
        note: "模拟用户分别从独立本地账户入金；界面和分析材料都将其标为预置数据。",
      },
      story: {
        owner: "Alice",
        expiry: this.expiry?.toString(),
        branches: branchState,
        capabilities: {
          pay: PAY.toString(),
          treasury: TREASURY.toString(),
        },
      },
      position: this.positions.supply ? {
        id: this.positions.positionId?.toString(),
        returnCm: this.positions.returnCm?.toString(),
        expectedQ: this.positions.expectedQ?.toString(),
        termSeconds: this.positions.term?.toString(),
        withdrawn: !!this.positions.withdraw,
      } : null,
      actions: this.actions,
      transactions: this.transactions,
      comparison: this.comparison("purchase"),
      comparisonTreasury: this.comparison("treasury"),
      ready: !!this.identities,
    });
  }

  attemptCapability(branch, operation) {
    const capabilities = branch === "buyer" ? PAY : branch === "treasury" ? TREASURY : 0n;
    const required = operation === "purchase" ? PAY : TREASURY;
    const allowed = (capabilities & required) === required;
    return {
      allowed,
      branch,
      operation,
      reason: allowed ? "capability_granted" : "capability_mismatch",
      explanation: allowed
        ? "能力位允许该操作"
        : operation === "treasury"
          ? "采购凭证没有 TREASURY，电路会拒绝该操作"
          : "理财凭证没有 PAY，电路会拒绝该操作",
    };
  }

  serialized(task) {
    const run = this.mutex.then(task, task);
    this.mutex = run.catch(() => undefined);
    return run;
  }

  purchaseAction() {
    return this.serialized(() => this.purchase());
  }

  treasuryAction() {
    return this.serialized(() => this.executeTreasury());
  }

  withdrawAction() {
    return this.serialized(() => this.withdrawTreasury());
  }
}

export { SIMULATED_USERS, SIMULATED_DEPOSIT, USDC, TREASURY_METHOD };
