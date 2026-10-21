import { buildInstanceV4 } from "./lib_v4.mjs"; import { satisfiable } from "./witness_v4.mjs";
for (const D of [1, 2, 3, 4]) { const { input } = await buildInstanceV4({ D }); console.log("D=" + D, "valid ->", (await satisfiable(D, input)) ? "ACCEPT" : "REJECT"); }
process.exit(0);
