import type {
  AssetAmount,
  Network,
  PaymentRequirements,
  Price,
  SchemeNetworkServer,
  SupportedKind,
} from "@x402/core/types";
import type { Address } from "@shadowpass/sdk";
import { SHADOWPASS_NETWORK, SHADOWPASS_SCHEME, SHADOWPASS_ASSET_DECIMALS } from "./types.js";

export interface ShadowpassServerOptions {
  asset: Address;
  gate: Address;
  payout: Address;
  network?: Network;
}

function parseUsdAmount(price: string): bigint {
  const normalized = price.trim().replace(/^\$/, "").replace(/\s*USDC$/i, "");
  const match = normalized.match(/^([0-9]+)(?:\.([0-9]{1,6}))?$/);
  if (!match) throw new Error(`unsupported shadowpass price: ${price}`);
  const whole = BigInt(match[1]!);
  const fraction = (match[2] ?? "").padEnd(SHADOWPASS_ASSET_DECIMALS, "0");
  return whole * 10n ** BigInt(SHADOWPASS_ASSET_DECIMALS) + BigInt(fraction || "0");
}

export class ShadowpassServer implements SchemeNetworkServer {
  readonly scheme = SHADOWPASS_SCHEME;
  readonly defaultAssetTransferMethod = "default";
  readonly paymentFlows = {
    default: { supported: ["upfront"] as const, default: "upfront" as const },
  };

  readonly asset: Address;
  readonly gate: Address;
  readonly payout: Address;
  readonly network: Network;

  constructor(options: ShadowpassServerOptions) {
    this.asset = options.asset;
    this.gate = options.gate;
    this.payout = options.payout;
    this.network = options.network ?? SHADOWPASS_NETWORK;
  }

  async parsePrice(price: Price, network: Network): Promise<AssetAmount> {
    this.assertNetwork(network);
    if (typeof price === "object") {
      if (price.asset.toLowerCase() !== this.asset.toLowerCase()) {
        throw new Error(`shadowpass asset mismatch: ${price.asset}`);
      }
      return price;
    }
    return { amount: parseUsdAmount(String(price)).toString(), asset: this.asset };
  }

  getAssetDecimals(asset: string, network: Network): number | undefined {
    this.assertNetwork(network);
    return asset.toLowerCase() === this.asset.toLowerCase() ? SHADOWPASS_ASSET_DECIMALS : undefined;
  }

  async enhancePaymentRequirements(
    requirements: PaymentRequirements,
    supportedKind: SupportedKind,
    _facilitatorExtensions: string[],
  ): Promise<PaymentRequirements> {
    this.assertNetwork(requirements.network);
    if (supportedKind.scheme !== this.scheme || supportedKind.network !== requirements.network) {
      throw new Error("facilitator does not advertise shadowpass on this network");
    }
    if (requirements.asset.toLowerCase() !== this.asset.toLowerCase()) {
      throw new Error("shadowpass payment requirement uses an unsupported asset");
    }
    return {
      ...requirements,
      extra: {
        ...requirements.extra,
        gate: this.gate,
        payout: this.payout,
      },
    };
  }

  private assertNetwork(network: Network): void {
    if (network !== this.network) throw new Error(`unsupported shadowpass network: ${network}`);
  }
}
