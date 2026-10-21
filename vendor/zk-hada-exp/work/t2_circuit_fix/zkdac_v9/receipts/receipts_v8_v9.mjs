// #41: anvil RECEIPTS for one budgeted action, v8 gate vs v9 gate, D = 2 and D = 4 (same world, same history on each gate). Derived from
// ../../../t5_e2/E2-budget_20261009/e2_anvil.mjs (setup / deployment / mirror code copied; races removed). usage: node receipts_v8_v9.mjs > ../results/receipts_v8_v9.json
// Original header: E2 (#39 PREREGISTRATION "E2"): concurrent budget spending with REAL transactions on anvil, automine off so every candidate of a race lands in ONE block.
// a1: M splits 100 into 10 notes of 10 for S1..S10; 32 delegates S1..S32 attempt 10 each (S11..S32 hold no note: no proof can be built).
// a2: a second budget of 100; M gives T1..T4 25 each; each Ti submits 3 actions of 10 built on the SAME note version, in one block.
//     then revocation freeze: M (issuer) revokes T1's certificate; after the window T1's pre-built proof fails, T2 still spends.
// a3: counterexample on the real v7 gate (ZkDacGateV7R, no budget): S1..S32 each submit 2 actions of 10 in one block.
// usage: node e2_anvil.mjs > results/e2_anvil.json   (starts anvil on :8553; anvil test key #0 is public; local only)
import { createRequire } from "module"; import { spawn } from "child_process"; import fs from "fs"; import crypto from "crypto";
const H = (p) => new URL("../../../t5_e2/E2-budget_20261009/" + p, import.meta.url).pathname;
const TC = H("../../t4_contracts/"); const reqTC = createRequire(TC + "package.json"); const { ethers } = reqTC("ethers");
const L7 = await import(H("../../t2_circuit_fix/zkdac_v7/scripts/lib_v7.mjs"));
const L8 = await import(H("../../t2_circuit_fix/zkdac_v8/scripts/lib_v8.mjs"));
const BW = await import(H("../../t2_circuit_fix/zkdac_v8/scripts/budget_world.mjs"));
const RG = await import(H("../../t4_registration/scripts/lib_register.mjs"));
const RV = await import(H("../../t4_obligations/E7-obligations_20261009/revoke/revoke_lib.mjs"));
const snarkjs = createRequire(H("../../t2_circuit_fix/zkdac_v7/package.json"))("snarkjs");
const V7 = H("../../t2_circuit_fix/zkdac_v7"), V8 = H("../../t2_circuit_fix/zkdac_v8"), REG = H("../../t4_registration"), RVK = H("../../t4_obligations/E7-obligations_20261009/revoke/build/zk/rt.zkey");
const PK = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80"; const PORT = 8554, FORK = process.env.FORK ?? "prague";
const METHOD = "0xa9059cbb", PARAMS = "0x1234abcd", DOMAIN = 0xd0a1n, RWIN = 30, NWIN = 600, SKEW = 3600;
const log = (...a) => console.error(new Date().toISOString().slice(11, 19), ...a);
// ---------- chain ----------
const anvil = spawn("anvil", ["--port", String(PORT), "--chain-id", "31337", "--hardfork", FORK, "--gas-limit", "300000000", "--silent"], { stdio: "ignore" });
process.on("exit", () => anvil.kill());
const provider = new ethers.providers.JsonRpcProvider(`http://127.0.0.1:${PORT}`); let up = false;
for (let i = 0; i < 50 && !up; i++) { try { await provider.getBlockNumber(); up = true; } catch { await new Promise((r) => setTimeout(r, 200)); } }
const wallet = new ethers.Wallet(PK, provider); let nonce = await wallet.getTransactionCount();
const art = (file, name) => JSON.parse(fs.readFileSync(`${TC}foundry/out/${file}/${name}.json`));
let LIBS = {};   // library name -> address, linked by position from linkReferences
async function deploy(file, name, args = [], _unused) { const a = art(file, name); let code = a.bytecode.object.slice(2);
  for (const refs of Object.values(a.bytecode.linkReferences ?? {})) for (const [lib, locs] of Object.entries(refs)) { if (!LIBS[lib]) throw new Error("library not deployed: " + lib);
    for (const { start, length } of locs) code = code.slice(0, 2 * start) + LIBS[lib].slice(2).toLowerCase() + code.slice(2 * (start + length)); }
  code = "0x" + code;
  const f = new ethers.ContractFactory(a.abi, code, wallet); const c = await f.deploy(...args, { nonce: nonce++ }); await c.deployed(); return c; }
const NOW = (await provider.getBlock("latest")).timestamp;
// ---------- off-chain mirror of the shared state ----------
const key = (n) => (n === "H" ? RG.humanPrv(2) : crypto.createHash("sha256").update("e2-node-" + n).digest());
const imt = await L7.IMT.create(20); for (let k = 0; k < 20; k++) imt.insert(L8.rnd250("e2-decoy-" + k));
const issued = new BW.W.SparseTree(16); const roots = L7.newRootTree(); const notes = L8.newNoteTree();
const exps = (D) => [5000, 4000, 3000, 2000].slice(0, D).map((e) => NOW + e);
let ctxNonce = 0n; const holders = {};
async function inst(chain, gate, amount) { const D = chain.length - 1; const n = ++ctxNonce;
  const x = await L7.buildInstanceV7({ D, seed: 11, mode: "C", now: NOW, entPrv: chain.map(key), rootOthers: 0, expiries: exps(D), accSeed: `e2-${chain.join(">")}-${n}`,
    ctx: { chainId: 31337n, verifier: gate ?? "0x0000000000000000000000000000000000000001", method: METHOD, target: target?.address ?? "0x0000000000000000000000000000000000000002", params: PARAMS, amount: BigInt(amount ?? 0), nonce: n } });
  return { chain, D, input: x.input, meta: x.meta, nonce: n }; }
async function addHolder(name, chain) { const h = await inst(chain); for (let i = 1; i < h.D; i++) issued.append(h.meta.cert[i]); if (roots.indexOf(BigInt(h.meta.cert[0])) < 0) roots.insert(BigInt(h.meta.cert[0])); holders[name] = h; return h; }
function treeWitness(h) { const input = structuredClone(h.input); input.issued_root = String(issued.root);
  for (let i = 1; i < h.D; i++) { const p = issued.path(issued.index.get(String(h.meta.cert[i]))); input.m_sib[i] = p.sib; input.m_bit[i] = p.bit; }
  Object.assign(input, L7.rootProof(roots, h.meta.cert[0])); L7.refreshAll(input, { ...h.meta, imt }); return input; }
const owner = (h) => [BigInt(h.input.ent_Ax[h.D]), BigInt(h.input.ent_Ay[h.D])];
const mkNote = (h, q, label) => ({ own: owner(h), q: BigInt(q), lin: L8.linOf(h.meta), rho: L8.rnd250("e2-note-" + label) });
const cd = async (proof, ps) => JSON.parse("[" + (await snarkjs.groth16.exportSolidityCallData(proof, ps)) + "]");
const P3 = (c) => ({ a: c[0], b: c[1], c: c[2] });
// ---------- holders (all created before the gates are deployed: issued root is fixed at deployment) ----------
const M = await addHolder("M", ["H", "M"]);
for (let i = 1; i <= 32; i++) await addHolder("S" + i, ["H", "M", "S" + i]);
for (let i = 1; i <= 4; i++) await addHolder("T" + i, ["H", "M", "T" + i]);
const S11 = await addHolder("S11x", ["H", "M", "S1", "S11"]), S111 = await addHolder("S111x", ["H", "M", "S1", "S11", "S111"]);
log("holders", Object.keys(holders).length);
// ---------- deployment ----------
const poseidon = await deploy("PoseidonT3.sol", "PoseidonT3"); LIBS.PoseidonT3 = poseidon.address;
LIBS.PoseidonT4 = (await deploy("PoseidonT4.sol", "PoseidonT4")).address;
const reg = await deploy("ZkDacRegistry.sol", "ZkDacRegistry", [(await deploy("Groth16VerifierRegister.sol", "Groth16VerifierRegister")).address, wallet.address, DOMAIN.toString(), 300], poseidon.address);
const revs = await deploy("ZkDacRevocations.sol", "ZkDacRevocations", [(await deploy("Groth16VerifierRevoke.sol", "Groth16VerifierRevoke")).address, String(imt.root), imt.leaves.length, RWIN]);
var target = await deploy("Targets.sol", "MockTarget");
const tpk = M.meta.tpk.map(String);
const gate8 = await deploy("ZkDacGateV8.sol", "ZkDacGateV8", [[(await deploy("Groth16VerifierV8CD2.sol", "Groth16VerifierV8CD2")).address, (await deploy("Groth16VerifierV8CD4.sol", "Groth16VerifierV8CD4")).address], [10, 14], reg.address, revs.address, wallet.address, String(issued.root), 300, SKEW, tpk,
  [(await deploy("Groth16VerifierBudgetTransfer.sol", "Groth16VerifierBudgetTransfer")).address, (await deploy("Groth16VerifierBudgetMint.sol", "Groth16VerifierBudgetMint")).address, NWIN]], poseidon.address);   // LeanIMT links PoseidonT3
const gate7 = await deploy("ZkDacGateV7R.sol", "ZkDacGateV7R", [(await deploy("Groth16VerifierV7CD2.sol", "Groth16VerifierV7CD2")).address, reg.address, revs.address, wallet.address, String(issued.root), 300, SKEW, tpk, 10]);
const send = async (c, fn, args, gasLimit) => { const tx = await c[fn](...args, { nonce: nonce++, ...(gasLimit ? { gasLimit } : {}) }); return tx; };
const btv = (await deploy("Groth16VerifierBudgetTransfer.sol", "Groth16VerifierBudgetTransfer")).address, bmv = (await deploy("Groth16VerifierBudgetMint.sol", "Groth16VerifierBudgetMint")).address;
const gate9 = await deploy("ZkDacGateV9.sol", "ZkDacGateV9", [[(await deploy("Groth16VerifierV9CD2.sol", "Groth16VerifierV9CD2")).address, (await deploy("Groth16VerifierV9CD4.sol", "Groth16VerifierV9CD4")).address], [8, 10],
  reg.address, revs.address, wallet.address, String(issued.root), 300, SKEW, tpk, [btv, bmv, NWIN]], poseidon.address);
for (const g of [gate8, gate7, gate9]) await (await send(g, "setMethod", [METHOD, 1, true])).wait();
const humans = Array.from({ length: 10 }, (_, i) => RG.makeHuman(i)); const group = new RG.Group(humans.map((h) => h.id.commitment));
await (await send(reg, "setGroupRoot", [group.root.toString(), true])).wait();
{ const w = RG.registerWitness({ human: humans[2], group, domain: DOMAIN, master: [M.input.ent_Ax[1], M.input.ent_Ay[1]], cap0: M.input.cap[0], expiry0: M.input.expiry[0] });
  const rp = await snarkjs.groth16.fullProve(w, `${REG}/build/r20/main_reg_20_js/main_reg_20.wasm`, `${REG}/build/zk/reg20.zkey`); const c = await cd(rp.proof, rp.publicSignals);
  await (await send(reg, "register", [P3(c), c[3][0], c[3][2], c[3][3], []])).wait(); }
if ((await reg.currentRoot()).toString() !== String(roots.root)) throw new Error("registry root mismatch");
log("deployed; gate8", gate8.address, "gate7", gate7.address);
// ---------- budget operations (mirror kept in sync; checked against gate8.noteRoot()) ----------
const bw = Object.assign(Object.create(BW.BudgetWorld.prototype), { w: { imt }, notes });
async function syncCheck() { const r = (await gate8.noteRoot()).toString(); if (r !== String(notes.root)) throw new Error(`note root mismatch ${r} vs ${notes.root}`); }
async function mint(h, q, label) { const n = mkNote(h, q, label); const x = bw.mintWitness(n); const { proof, publicSignals } = await snarkjs.groth16.fullProve(x, `${V8}/build/budget_mint/budget_mint_js/budget_mint.wasm`, `${V8}/build/zk/budget_mint.zkey`);
  await (await send(gate8, "mint", [P3(await cd(proof, publicSignals)), x.cm, x.q])).wait(); notes.insert(L8.noteCm(n)); await syncCheck(); return n; }
async function transfer(from, n, to, q1, q2, label) { const t = bw.transferWitness(from, n, { to, q1, q2, label: "e2-" + label });
  const { proof, publicSignals } = await snarkjs.groth16.fullProve(t.input, `${V8}/build/budget_transfer/budget_transfer_js/budget_transfer.wasm`, `${V8}/build/zk/budget_transfer.zkey`);
  const s = publicSignals; await (await send(gate8, "transferBudget", [P3(await cd(proof, s)), s[0], s[1], s[2], s[3], s[4]])).wait(); notes.insert(L8.noteCm(t.out1)); notes.insert(L8.noteCm(t.out2)); await syncCheck(); return t; }
async function actionTx(gate, h, amount, note, label) {   // returns { args, change } built on the CURRENT mirror state
  const a = await inst(h.chain, gate.address, amount); const inp = treeWitness(a);
  let input = inp, change = null;
  if (note) { const r = L8.setBudget(inp, note, notes, BigInt(amount), L8.rnd250("e2-chg-" + label)); input = r.input; change = r.change; }
  const D = h.D, dir = note ? V8 : V7; const { proof, publicSignals } = await snarkjs.groth16.fullProve(input, `${dir}/build/c${D}/main_c_d${D}_js/main_c_d${D}.wasm`, `${dir}/build/zk/c${D}.zkey`);
  const s = publicSignals; const c = await cd(proof, s); const act = [target.address, METHOD, amount, a.nonce.toString(), PARAMS];
  const nCt = 4 + 2 * (D + 1); const ct = s.slice(9, 9 + nCt);
  const args = note ? [P3(c), [s[0], s[1], s[2]], s[3], s[4], act, ct, s.slice(9 + nCt)] : [P3(c), [s[0], s[1], s[2]], s[3], s[4], act, ct];
  return { args, change, label, holder: h.chain.at(-1) };
}
// ---------- receipts: the same history on gate8 (v8 proofs) and gate9 (v9 proofs), each gate with its own note tree ----------
const L9 = await import(new URL("../scripts/lib_v9.mjs", import.meta.url).pathname); const V9 = new URL("..", import.meta.url).pathname;
await (await send(gate9, "registerState", [String(issued.root), String(imt.root), String(roots.root)])).wait();
const out = { date: new Date().toISOString(), client: await provider.send("web3_clientVersion", []), hardfork: FORK, receipts: {} };
async function history(gate, ver) {
  const nt = L8.newNoteTree(); const w = Object.assign(Object.create(BW.BudgetWorld.prototype), { w: { imt }, notes: nt });
  const rc = async (tx) => { const r = await tx.wait(); return { status: r.status, gasUsed: r.gasUsed.toNumber(), calldata_bytes: (tx.data.length - 2) / 2 }; };
  const n0 = mkNote(M, 100, ver + "-mint"); const mx = w.mintWitness(n0);
  const mp = await snarkjs.groth16.fullProve(mx, `${V8}/build/budget_mint/budget_mint_js/budget_mint.wasm`, `${V8}/build/zk/budget_mint.zkey`);
  const rmint = await rc(await send(gate, "mint", [P3(await cd(mp.proof, mp.publicSignals)), mx.cm, mx.q])); nt.insert(L8.noteCm(n0));
  const tr = async (from, n, to, q1, q2, label) => { const t = w.transferWitness(from, n, { to, q1, q2, label: ver + label });
    const p = await snarkjs.groth16.fullProve(t.input, `${V8}/build/budget_transfer/budget_transfer_js/budget_transfer.wasm`, `${V8}/build/zk/budget_transfer.zkey`); const s = p.publicSignals;
    const r = await rc(await send(gate, "transferBudget", [P3(await cd(p.proof, s)), s[0], s[1], s[2], s[3], s[4]])); nt.insert(L8.noteCm(t.out1)); nt.insert(L8.noteCm(t.out2)); return { t, r }; };
  const a = await tr(M, n0, holders.S1, 40, 60, "-t1"); const b = await tr(holders.S1, a.t.out1, S11, 20, 20, "-t2"); const c = await tr(S11, b.t.out1, S111, 10, 10, "-t3");
  const act = async (h, n, amount, label) => { const x = await inst(h.chain, gate.address, amount); const inp = treeWitness(x); const { input, change } = L8.setBudget(inp, n, nt, BigInt(amount), L8.rnd250(ver + label));
    if (ver === "v9") L9.toV9(input, ver + label);
    const dir = ver === "v9" ? V9 : V8; const p = await snarkjs.groth16.fullProve(input, `${dir}/build/c${h.D}/main_c_d${h.D}_js/main_c_d${h.D}.wasm`, `${dir}/build/zk/c${h.D}.zkey`); const s = p.publicSignals; const c_ = await cd(p.proof, s);
    const actT = [target.address, METHOD, amount, x.nonce.toString(), PARAMS]; let args;
    if (ver === "v9") { const nCt = h.D + 6; args = [P3(c_), [input.issued_root, input.revoked_root, input.root_root], s[1], actT, s.slice(6, 6 + nCt), s.slice(6 + nCt)]; }
    else { const nCt = 4 + 2 * (h.D + 1); args = [P3(c_), [s[0], s[1], s[2]], s[3], s[4], actT, s.slice(9, 9 + nCt), s.slice(9 + nCt)]; }
    const r = await rc(await send(gate, "execute", args)); nt.insert(L8.noteCm(change)); return { ...r, public_inputs: s.length }; };
  const d2 = await act(holders.S1, b.t.out2, 10, "-a2"); const d4 = await act(S111, c.t.out1, 10, "-a4");
  if ((await gate.noteRoot()).toString() !== String(nt.root)) throw new Error(ver + " note root mismatch");
  return { mint: rmint, transfer_1: a.r, execute_D2: d2, execute_D4: d4 };
}
out.receipts.v8 = await history(gate8, "v8"); log("v8 done"); out.receipts.v9 = await history(gate9, "v9"); log("v9 done");
out.diff_v9_minus_v8 = { execute_D2: out.receipts.v9.execute_D2.gasUsed - out.receipts.v8.execute_D2.gasUsed, execute_D4: out.receipts.v9.execute_D4.gasUsed - out.receipts.v8.execute_D4.gasUsed };
console.log(JSON.stringify(out, null, 1)); anvil.kill(); process.exit(0);
