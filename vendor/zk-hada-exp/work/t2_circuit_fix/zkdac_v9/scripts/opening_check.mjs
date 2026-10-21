// #41 ④: the auditor recovers ent[0..D] from the COMPRESSED ciphertext — single committee key, and the E6 threshold opening (3-of-5 partial
// decryptions + DLEQ, ../../../t4_accountability/E6-threshold-opening_20261009/threshold.mjs). D = 1..4, N fresh instances each; witnesses checked too.
// usage: node scripts/opening_check.mjs 10 > results/opening_check.json
import { buildInstanceV8 } from "../../zkdac_v8/scripts/lib_v8.mjs"; import { toV9, openSingleKey, openWithS, pubOfInput } from "./lib_v9.mjs"; import { satisfiable } from "./witness_v9.mjs";
import crypto from "crypto";
const T = await import(new URL("../../../t4_accountability/E6-threshold-opening_20261009/threshold.mjs", import.meta.url).pathname);
const N = Number(process.argv[2] ?? 10); const { pub, members } = T.deal({ t: 3, n: 5, epoch: 1, seed: "v9-open" }); const out = { runs_per_depth: N, committee: "t=3, n=5", depths: {} };
const same = (rec, input) => rec && rec.every((p, j) => p && String(p[0]) === input.ent_Ax[j] && String(p[1]) === input.ent_Ay[j]);
for (const D of [1, 2, 3, 4]) { let single = 0, thr = 0, wit = 0, wrongS = 0;
  for (let r = 0; r < N; r++) {
    const a = await buildInstanceV8({ D, seed: 3000 + r }); toV9(a.input, crypto.randomBytes(16).toString("hex")); if (same(openSingleKey(pubOfInput(a.input), a.meta.tsk), a.input)) single++;
    const b = await buildInstanceV8({ D, seed: 4000 + r }); b.input.tpk = pub.tpk.map(String); toV9(b.input, crypto.randomBytes(16).toString("hex")); if (await satisfiable(D, b.input)) wit++;
    const c1 = [BigInt(b.input.acc_c1x), BigInt(b.input.acc_c1y)]; const ctx = { epoch: 1, ev: "v9-" + D + "-" + r, tpk: pub.tpk, c1s: [c1] };
    const shares = [1, 3, 5].map((i) => T.memberShare(pub, members[i - 1], ctx)); const comb = T.combine(pub, ctx, shares);
    if (comb.status === "OK" && same(openWithS(pubOfInput(b.input), comb.S[0]), b.input)) thr++;
    const bad = T.combine(pub, ctx, shares.slice(0, 2), { forceWith: [1, 3] }); const rec = openWithS(pubOfInput(b.input), bad.S[0]); if (!same(rec, b.input)) wrongS++;
  }
  out.depths[D] = { single_key_exact: `${single}/${N}`, threshold_3of5_exact: `${thr}/${N}`, witness_with_committee_tpk_satisfiable: `${wit}/${N}`, forced_2_shares_wrong: `${wrongS}/${N}` };
  console.error(D, JSON.stringify(out.depths[D])); }
console.log(JSON.stringify(out, null, 1)); process.exit(0);
