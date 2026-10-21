// #18 Part 2 forge fixtures: real revoke_transition proofs on the revocation tree of fixtures_V7.json actions[3] (C_D4), so that the v7 action proof
// and the revocation registry share the same genesis tree. usage: node gen_fixtures_revoke.mjs  -> ../../../t4_contracts/foundry/test/fixtures_revoke.json
import fs from "fs";
import * as R from "./revoke_lib.mjs";
const REG = new URL("../../../t4_registration/scripts/lib_register.mjs", import.meta.url).pathname;
const { humanPrv } = await import(REG);
const FX = new URL("../../../t4_contracts/foundry/test/fixtures_V7.json", import.meta.url).pathname;
const v7fx = JSON.parse(fs.readFileSync(FX)); const act = v7fx.actions[3]; if (act.name !== "C_D4") throw new Error("fixture layout");
// same arguments as gen_fixtures_v7.mjs for C_D4 (human 2, seed 11, now 1000, expiries now + 5000..2000)
const inst = await R.buildInstanceV7({ D: 4, mode: "C", seed: 11, now: 1000, entPrv: [humanPrv(2)], rootOthers: 0, expiries: [6000, 5000, 4000, 3000] });
const genesis = inst.meta.imt;
if (String(genesis.root) !== String(BigInt(act.pub[1]))) throw new Error(`genesis mismatch: ${genesis.root} vs ${act.pub[1]}`);
if (inst.meta.cert[0] !== act.cert0) throw new Error("cert0 mismatch");
const zkey = new URL("build/zk/rt.zkey", import.meta.url).pathname;
async function prove(t, label) {
  const { proof, publicSignals } = await R.snarkjs.groth16.fullProve(t.input, R.WASM, zkey);
  const cd = JSON.parse("[" + (await R.snarkjs.groth16.exportSolidityCallData(proof, publicSignals)) + "]");
  return { label, a: cd[0], b: cd[1], c: cd[2], pub: cd[3], newRoot: String(t.newRoot), entry: t.input.entry, nextIndex: t.nextIndex };
}
const cert = inst.meta.cert.map(BigInt);
const T1 = R.transition(genesis, cert[2], R.certAuthority(inst, 2, 0));          // V1: issuer ent[2] revokes cert hop 2 (the C_D4 action's own chain)
const T2stale = R.transition(genesis, R.keyEntry(inst, 3), R.keyAuthority(inst, 3)); // V8: prepared against genesis, concurrently with T1
const T2 = R.transition(T1.after, R.keyEntry(inst, 3), R.keyAuthority(inst, 3));     // V3 + V8 rebuilt on the new root
const T3 = R.transition(T2.after, cert[3], R.certAuthority(inst, 3, 1));             // V2: holder ent[4] self-revokes cert hop 3
// V6 contract part: an otherwise valid transition into slot count + 5 (circuit accepts; the contract supplies next_index = count)
const c = R.cloneImt(genesis); const k = R.trunc(cert[1]); const lo = c.lowIndex(k); const low = c.leaves[lo]; const lp = c.path(lo); const ni = c.leaves.length + 5;
c._set(lo, { value: low.value, nextIndex: BigInt(ni), nextValue: k }); const np = c.path(ni); c._set(ni, { value: k, nextIndex: low.nextIndex, nextValue: low.nextValue });
const base = R.transition(genesis, cert[1], R.certAuthority(inst, 1, 0));
const Tgap = { input: { ...base.input, next_index: String(ni), new_root: String(c.root), new_sib: np.sib.map(String) }, newRoot: c.root, nextIndex: ni };
const out = { genesisRoot: String(genesis.root), genesisCount: genesis.leaves.length,
  T1: await prove(T1, "issuer ent[2] revokes cert hop 2"), T2stale: await prove(T2stale, "key ent[3] against genesis"),
  T2: await prove(T2, "key ent[3] rebuilt after T1"), T3: await prove(T3, "holder ent[4] revokes cert hop 3 after T2"), Tgap: await prove(Tgap, "next_index = count + 5") };
// V11: replaying the entries in event order reproduces every root
const replay = await R.IMT.create(20); replay.leaves = genesis.leaves.map((l) => ({ ...l })); replay.levels = genesis.levels.map((m) => new Map(m));
const roots = []; for (const t of [out.T1, out.T2, out.T3]) { replay.insert(BigInt(t.entry)); roots.push(String(replay.root)); }
out.replayMatches = roots[0] === out.T1.newRoot && roots[1] === out.T2.newRoot && roots[2] === out.T3.newRoot;
fs.writeFileSync(new URL("../../../t4_contracts/foundry/test/fixtures_revoke.json", import.meta.url), JSON.stringify(out, null, 1));
console.error("genesis", out.genesisRoot, "count", out.genesisCount, "replayMatches", out.replayMatches); process.exit(0);
