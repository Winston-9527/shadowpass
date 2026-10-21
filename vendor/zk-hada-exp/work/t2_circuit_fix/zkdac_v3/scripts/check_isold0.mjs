// For each depth: which revocation proofs use the empty-leaf case (isOld0=1), where oldKey/oldValue are unused by SMTVerifier.
import { buildInstanceV3 } from "./lib_v3.mjs";
for (const D of [1, 2, 3, 4]) { const { input } = await buildInstanceV3({ D }); console.log(`D=${D} r_isOld0 =`, JSON.stringify(input.r_isOld0)); }
process.exit(0);
