import { buildInstanceV8 } from "./lib_v8.mjs"; import { satisfiable } from "./witness_v8.mjs";
for (const D of [1, 2, 3, 4]) { const { input } = await buildInstanceV8({ D }); console.log("v8 D=" + D, "valid ->", (await satisfiable(D, input)) ? "ACCEPT" : "REJECT"); }
process.exit(0);
