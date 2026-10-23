import type {
  AssetAmount,
  Network,
  PaymentRequirements,
  Price,
  SchemeNetworkServer,
  SupportedKind,
} from "@x402/core/types";
import type { Address, Deployment } from "@shadowpass/sdk";
import {
  PAY_METHOD,
  SHADOWPASS_SCHEME,
} from "./types.js";

export interface ShadowpassServerConfig {
  deployment: Deployment;
  asset: Address;
  payout: Address;
  decimals: 6;
}

function parseUsdAmount(price: string, decimals: number): bigint {
  const normalized = price.trim().replace(/^\$/, "").replace(/\s*USDC$/i, "");
  const match = normalized.match(new RegExp(`^([0-9]+)(?:\\.([0-9]{1,${decimals}}))?$`));
  if (!match) throw new Error("unsupported_price");
  const whole = BigInt(match[1]!);
  const fraction = (match[2] ?? "").padEnd(decimals, "0");
  return whole * 10n ** BigInt(decimals) + BigInt(fraction || "0");
}

export class ShadowpassServerScheme implements SchemeNetworkServer {
  readonly scheme = SHADOWPASS_SCHEME;
  readonly defaultAssetTransferMethod = "default";
  readonly paymentFlows = {
    default: { supported: ["upfront"] as const, default: "upfront" as const },
  };

  private readonly network: Network;
  private readonly deployment: Deployment;
  private readonly asset: Address;
  private readonly payout: Address;
  private readonly decimals: number;

  constructor(config: ShadowpassServerConfig) {
    this.deployment = config.deployment;
    this.asset = config.asset;
    this.payout = config.payout;
    this.decimals = config.decimals;
    this.network = `eip155:${config.deployment.chainId}`;
  }

  async parsePrice(price: Price, network: Network): Promise<AssetAmount> {
    this.assertNetwork(network);
    if (typeof price === "object") {
      if (price.asset.toLowerCase() !== this.asset.toLowerCase()) throw new Error("asset_mismatch");
      return price;
    }
    return { amount: parseUsdAmount(String(price), this.decimals).toString(), asset: this.asset };
  }

  getAssetDecimals(asset: string, network: Network): number | undefined {
    this.assertNetwork(network);
    return asset.toLowerCase() === this.asset.toLowerCase() ? this.decimals : undefined;
  }

  async enhancePaymentRequirements(
    requirements: PaymentRequirements,
    supportedKind: SupportedKind,
    _facilitatorExtensions: string[],
  ): Promise<PaymentRequirements> {
    this.assertNetwork(requirements.network);
    if (supportedKind.scheme !== this.scheme || supportedKind.network !== this.network) {
      throw new Error("facilitator_scheme_mismatch");
    }
    if (requirements.asset.toLowerCase() !== this.asset.toLowerCase()) throw new Error("asset_mismatch");
    return {
      ...requirements,
      extra: {
        ...requirements.extra,
        gate: this.deployment.gate,
        payout: this.payout,
        method: PAY_METHOD,
      },
    };
  }

  private assertNetwork(network: Network): void {
    if (network !== this.network) throw new Error("network_mismatch");
  }
}
