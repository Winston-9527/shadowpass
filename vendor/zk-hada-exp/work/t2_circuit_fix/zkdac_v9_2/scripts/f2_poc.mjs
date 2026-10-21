// v9.2 check 4 (PREREGISTRATION.md): F-2 PoC. In a shared world (issued tree, registered-root tree, revocation IMT, note tree), the issuer of hop D-1
// certifies the identity point O = (0, 1) as the holder (for D = 1 the registered master is O); the note's owner is O. holder_sk = 0.
// v9.1: witness satisfiable and a real v9.1 proof verifies (F-2 is real); v9.2: unsatisfiable at the new constraint. Plus holder_sk = l, p - 1.
// usage (this directory): node scripts/f2_poc.mjs > results/f2_poc.json 2> results/f2_poc.stderr
import fs from "fs"; import os from "os"; import path from "path"; import crypto from "crypto"; import { createRequire } from "module";
const here = new URL("..", import.meta.url).pathname, V91 = new URL("../../zkdac_v9_1/", import.meta.url).pathname;
const snarkjs = createRequire(here + "package.json")("snarkjs");
const V2 = await import("../../zkdac_v2/scripts/lib.mjs"); const L7 = await import("../../zkdac_v7/scripts/lib_v7.mjs"); const L8 = await import("../../zkdac_v8/scripts/lib_v8.mjs");
const L9 = await import("./lib_v9.mjs"); const BW = await import("../../zkdac_v8/scripts/budget_world.mjs");
const L = 2736030358979909402780800718157159386076813972158567259200215660948447373041n, P = 21888242871839275222246405745257275088548364400416034343698204186575808495617n;
// identity holder: prv2pub(MAGIC) = O. O never signs (it is the terminal holder), so signPoseidon is not patched.
const { eddsa } = await V2.init(); const F = eddsa.F; const MAGIC = Buffer.alloc(32, 9); const isM = (p) => Buffer.isBuffer(p) && p.every((b) => b === 9);
const O = [F.e(0n), F.e(1n)]; const o2p = eddsa.prv2pub.bind(eddsa); eddsa.prv2pub = (prv) => (isM(prv) ? O : o2p(prv));
const tmp = path.join(os.tmpdir(), `f2-${process.pid}.wtns`);
async function sat(dir, D, input) { try { await snarkjs.wtns.calculate(input, `${dir}build/c${D}/main_c_d${D}_js/main_c_d${D}.wasm`, tmp); return { sat: true }; }
  catch (e) { const m = String(e.message ?? e).match(/template (\S+) line: (\d+)/); return { sat: false, fail: m ? `${m[1].replace(/_\d+$/, "")} L${m[2]}` : String(e).slice(0, 120) }; } }
const key = (n) => crypto.createHash("sha256").update("f2-node-" + n).digest();
const out = { identity_point: [String(F.toObject(O[0])), String(F.toObject(O[1]))], rows: [] };
for (const D of [1, 2, 3, 4]) {
  const chain = ["H", "M", "A", "B", "C"].slice(0, D + 1); const entPrv = chain.map(key); entPrv[D] = MAGIC;
  const { input, meta } = await L7.buildInstanceV7({ D, seed: 21, mode: "C", now: 1000, entPrv, rootOthers: 0, expiries: [5000, 4000, 3000, 2000].slice(0, D), accSeed: `f2-${D}` });
  if (input.ent_Ax[D] !== "0" || input.ent_Ay[D] !== "1") throw new Error("holder is not O");
  // shared trees: the certificate naming O as holder IS issued (hop >= 1) or registered (hop 0)
  const imt = await L7.IMT.create(20); for (let k = 0; k < 20; k++) imt.insert(L8.rnd250("f2-decoy-" + k));
  const issued = new BW.W.SparseTree(16); for (let i = 1; i < D; i++) issued.append(meta.cert[i]); const roots = L7.newRootTree(); roots.insert(BigInt(meta.cert[0]));
  const inp = structuredClone(input); inp.issued_root = String(issued.root);
  for (let i = 1; i < D; i++) { const p = issued.path(issued.index.get(String(meta.cert[i]))); inp.m_sib[i] = p.sib; inp.m_bit[i] = p.bit; }
  Object.assign(inp, L7.rootProof(roots, meta.cert[0])); L7.refreshAll(inp, { ...meta, imt });
  inp.holder_sk = "0";                                                     // anyone knows the secret of O
  const notes = L8.newNoteTree(); for (let k = 0; k < 4; k++) notes.insert(L8.rnd250("f2-other-" + k));
  const note = { own: [0n, 1n], q: 50n, lin: L8.linOf(meta), rho: L8.rnd250("f2-rho-" + D) }; notes.insert(L8.noteCm(note));
  const { input: w } = L8.setBudget(inp, note, notes, 7n, L8.rnd250("f2-chg-" + D)); L9.toV9(w, crypto.randomBytes(16).toString("hex"));
  const row = { D, holder_is_identity: true, v9_1: await sat(V91, D, w), v9_2: await sat(here, D, w) };
  if (row.v9_1.sat) { const { proof, publicSignals } = await snarkjs.groth16.fullProve(w, `${V91}build/c${D}/main_c_d${D}_js/main_c_d${D}.wasm`, `${V91}build/zk/c${D}.zkey`);
    row.v9_1_proof_verifies = await snarkjs.groth16.verify(JSON.parse(fs.readFileSync(`${V91}zk/vk_c${D}.json`)), publicSignals, proof); }
  for (const [label, sk] of [["holder_sk = l", L], ["holder_sk = p - 1", P - 1n]]) { const x = structuredClone(w); x.holder_sk = String(sk);
    row[label] = { v9_1: await sat(V91, D, x), v9_2: await sat(here, D, x) }; }
  out.rows.push(row); console.error(JSON.stringify(row));
}
try { fs.unlinkSync(tmp); } catch {}
console.log(JSON.stringify(out, null, 1)); process.exit(0);
