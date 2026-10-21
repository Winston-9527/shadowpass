import * as snarkjs from "snarkjs"; import fs from "fs"; import os from "os"; import path from "path";
const tmp = path.join(os.tmpdir(), "zkdac-v7-wtns-" + process.pid + ".wtns");
// true iff the v7 constraint system (mode "A" | "C", depth D) is satisfiable by `input`
export async function satisfiable(D, input, mode = "C", build = new URL("../build", import.meta.url).pathname) {
  const t = mode.toLowerCase();
  try { await snarkjs.wtns.calculate(input, `${build}/${t}${D}/main_${t}_d${D}_js/main_${t}_d${D}.wasm`, tmp); return true; }
  catch (e) { if (process.env.DEBUG) console.error(String(e).slice(0, 300)); return false; } finally { try { fs.unlinkSync(tmp); } catch {} }
}
