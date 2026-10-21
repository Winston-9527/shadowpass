import { buildInstanceV5 } from "./lib_v5.mjs"; import { satisfiable } from "./witness_v5.mjs";
for (const D of [1, 2, 3, 4]) { const { input } = await buildInstanceV5({ D }); console.log("D=" + D, "valid ->", (await satisfiable(D, input)) ? "ACCEPT" : "REJECT", "rt_depth", input.rt_depth); }
process.exit(0);
