import { buildInstance } from "./lib.mjs"; import { satisfiable } from "./witness.mjs";
for (const D of [1, 2, 3, 4]) { const { input } = await buildInstance({ D }); console.log("D=" + D, "valid ->", await satisfiable(D, input) ? "ACCEPT" : "REJECT"); }
process.exit(0);
