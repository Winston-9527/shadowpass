// v9.1 check 5 (PREREGISTRATION.md): off-curve chain key ent[j], j = 0..3, D = 4. Adapted from audit #53 offcurve_test.mjs.
// usage (this directory): python3 scripts/offcurve.py 1 > results/offcurve_point.json && node scripts/offcurve_poc.mjs results/offcurve_point.json > results/offcurve_poc.json
import fs from "fs"; import os from "os"; import path from "path"; import * as snarkjs from "snarkjs";
const here = new URL("..", import.meta.url).pathname, V9 = new URL("../../zkdac_v9/", import.meta.url).pathname;
const V2 = await import("../../zkdac_v2/scripts/lib.mjs"); const L9 = await import("../../zkdac_v9/scripts/lib_v9.mjs");
const { oracleV9, worldFromMetaV9, openCompressed } = await import("../../../t3_attacks/v9/oracle_v9.mjs");
const X = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));
const { eddsa, poseidon } = await V2.init(); const F = eddsa.F, bj = eddsa.babyJub;
const L = 2736030358979909402780800718157159386076813972158567259200215660948447373041n;
const MAGIC = Buffer.alloc(32, 7); const isM = (prv) => Buffer.compare(Buffer.from(prv), MAGIC) === 0;
const A = [F.e(BigInt(X.Ax)), F.e(BigInt(X.Ay))];
const o2p = eddsa.prv2pub.bind(eddsa), osp = eddsa.signPoseidon.bind(eddsa);
eddsa.prv2pub = (prv) => (isM(prv) ? A : o2p(prv));
eddsa.signPoseidon = (prv, msg) => { if (!isM(prv)) return osp(prv, msg);
  const r = 123456789123456789n; const R8 = bj.mulPointEscalar(bj.Base8, r);
  const h = F.toObject(poseidon([R8[0], R8[1], A[0], A[1], msg])); return { R8, S: (r + h * BigInt(X.q)) % L }; };
const tmp = path.join(os.tmpdir(), `offcurve-${process.pid}.wtns`);
async function sat(dir, D, input) {
  try { await snarkjs.wtns.calculate(input, `${dir}build/c${D}/main_c_d${D}_js/main_c_d${D}.wasm`, tmp); return { sat: true }; }
  catch (e) { const m = String(e.message ?? e).match(/template (\S+) line: (\d+)/); return { sat: false, fail: m ? `${m[1]} L${m[2]}` : String(e).slice(0, 120) }; }
}
const out = { point: X, a_on_curve_circomlibjs: bj.inCurve(A), D: 4, rows: [] };
for (const j of [0, 1, 2, 3]) {
  const ep = []; ep[j] = MAGIC; const D = 4;
  const { input, meta } = await L9.buildInstanceV9({ D, entPrv: ep });
  const row = { j, ent_j_is_offcurve_point: input.ent_Ax[j] === X.Ax, v9: await sat(V9, D, input), v9_1: await sat(here, D, input) };
  row.oracle = await oracleV9(input, worldFromMetaV9(meta), D);
  const op = await openCompressed(input, BigInt(meta.tsk), D + 1);
  row.opening_correct = op === null ? null : op.map((p, k) => p[0] === BigInt(input.ent_Ax[k]) && p[1] === BigInt(input.ent_Ay[k]));
  if (j === 3 && row.v9.sat) {   // a real v9 proof for the off-curve chain, verified with the committed v9 vk
    const { proof, publicSignals } = await snarkjs.groth16.fullProve(input, `${V9}build/c4/main_c_d4_js/main_c_d4.wasm`, `${V9}build/zk/c4.zkey`);
    row.v9_proof_verifies = await snarkjs.groth16.verify(JSON.parse(fs.readFileSync(`${V9}zk/vk_c4.json`)), publicSignals, proof);
  }
  out.rows.push(row); console.error(JSON.stringify(row));
}
try { fs.unlinkSync(tmp); } catch {}
console.log(JSON.stringify(out, null, 1)); process.exit(0);
