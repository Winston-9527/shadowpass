import { buildInstanceV3 } from "./lib_v3.mjs"; import { satisfiable } from "./witness_v3.mjs";
for (const D of [1, 2, 3, 4]) { const { input } = await buildInstanceV3({ D }); console.log("D=" + D, "valid ->", (await satisfiable(D, input)) ? "ACCEPT" : "REJECT"); }
process.exit(0);
