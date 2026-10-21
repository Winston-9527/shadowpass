import { buildInstanceV9, openSingleKey, pubOfInput } from "./lib_v9.mjs"; import { satisfiable } from "./witness_v9.mjs";
for (const D of [1, 2, 3, 4]) { const { input, meta } = await buildInstanceV9({ D }); const rec = openSingleKey(pubOfInput(input), meta.tsk);
  const ok = rec && rec.every((p, j) => p && String(p[0]) === input.ent_Ax[j] && String(p[1]) === input.ent_Ay[j]);
  console.log("v9 D=" + D, "valid ->", (await satisfiable(D, input)) ? "ACCEPT" : "REJECT", "| auditor recovers ent[0..D] from compressed ciphertext:", ok); }
process.exit(0);
