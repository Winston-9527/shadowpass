import { buildInstanceV6 } from "./lib_v6.mjs"; import { satisfiable } from "./witness_v6.mjs";
for (const D of [1, 2, 3, 4]) { const { input, meta } = await buildInstanceV6({ D }); console.log("D=" + D, "valid ->", (await satisfiable(D, input)) ? "ACCEPT" : "REJECT", "imt leaves", meta.imt.leaves.length); }
process.exit(0);
