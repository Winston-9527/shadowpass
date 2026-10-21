import * as snarkjs from "snarkjs"; import fs from "fs"; import os from "os"; import path from "path";
const tmp = path.join(os.tmpdir(), "zkdac-v3-wtns-" + process.pid + ".wtns");
// true iff the v3 constraint system is satisfiable by `input` (witness generation succeeds)
export async function satisfiable(D, input, build = new URL("../build", import.meta.url).pathname) {
  try { await snarkjs.wtns.calculate(input, `${build}/d${D}/main_d${D}_js/main_d${D}.wasm`, tmp); return true; }
  catch (e) { if (process.env.DEBUG) console.error(String(e).slice(0, 300)); return false; } finally { try { fs.unlinkSync(tmp); } catch {} }
}
