import { pathToFileURL } from "node:url";
import { createMerchantApp } from "./app.js";

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
}

export async function main(): Promise<void> {
  const { app } = createMerchantApp({
    facilitatorUrl: required("FACILITATOR_URL"),
    asset: required("SHADOWPASS_TOKEN") as `0x${string}`,
    gate: required("SHADOWPASS_GATE") as `0x${string}`,
    payout: required("SHADOWPASS_PAYOUT") as `0x${string}`,
  });
  app.listen(Number(process.env.PORT ?? 4021), () => {
    console.log("shadowpass merchant demo listening");
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
