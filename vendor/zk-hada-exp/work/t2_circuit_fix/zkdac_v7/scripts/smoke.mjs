import { buildInstanceV7, decryptChain } from "./lib_v7.mjs"; import { satisfiable } from "./witness_v7.mjs";
for (const mode of ["A", "C"]) for (const D of [1, 2, 3, 4]) {
  const { input, meta } = await buildInstanceV7({ D, mode });
  const dec = await decryptChain(input, meta.tsk, mode);
  const ok = dec.every((p, j) => p[0] === meta.accEnts[j][0] && p[1] === meta.accEnts[j][1]);
  console.log(mode, "D=" + D, "valid ->", (await satisfiable(D, input, mode)) ? "ACCEPT" : "REJECT", "| auditor recovers ent[0..D]:", ok, `(${dec.length} keys)`);
}
process.exit(0);
