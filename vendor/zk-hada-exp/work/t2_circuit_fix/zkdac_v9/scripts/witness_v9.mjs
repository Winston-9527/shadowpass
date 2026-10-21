import * as snarkjs from "snarkjs"; import fs from "fs"; import os from "os"; import path from "path";
const tmp = path.join(os.tmpdir(), "zkdac-v9-wtns-" + process.pid + ".wtns");
export async function satisfiable(D, input, build = new URL("../build", import.meta.url).pathname) {
  try { await snarkjs.wtns.calculate(input, `${build}/c${D}/main_c_d${D}_js/main_c_d${D}.wasm`, tmp); return true; }
  catch (e) { if (process.env.DEBUG) console.error(String(e).slice(0, 300)); return false; } finally { try { fs.unlinkSync(tmp); } catch {} }
}
