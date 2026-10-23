import { pathToFileURL } from "node:url";
import { loadDeployment, type Address } from "@shadowpass/sdk";
import { createMerchantApp } from "./app.js";

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
}

export async function main(): Promise<void> {
  const network = process.env.SHADOWPASS_NETWORK ?? "anvil";
  const deployment = await loadDeployment(network);
  const { app } = createMerchantApp({
    facilitatorUrl: required("FACILITATOR_URL"),
    deployment,
    asset: (process.env.SHADOWPASS_TOKEN ?? deployment.token) as Address,
    merchantPayTo: required("MERCHANT_PAY_TO") as Address,
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
