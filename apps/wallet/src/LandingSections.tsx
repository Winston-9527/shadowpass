const features = [
  ["Pooled settlement", "Merchants and the chain see an authorized agent from a shared pool, not the owner address."],
  ["Wallet without keys", "The hosted wallet only sees deposits. Authorization and spending stay on the owner's device."],
  ["Owner-only audit", "The owner view key decrypts every delegated action without trusting the agent or facilitator."],
  ["Attenuated delegation", "Capabilities and expiry can only narrow down the certificate chain."],
] as const;

export function LandingSections() {
  return (
    <section className="protocol">
      <div className="protocol-intro">
        <span className="eyebrow">ShadowPass protocol</span>
        <h2>A private prepaid card for AI agents</h2>
        <p>
          Give any agent a time-limited budget with enforced permissions. Revoke one branch without
          involving the agent, and keep the complete spending history visible only to the owner.
        </p>
      </div>
      <div className="protocol-grid">
        {features.map(([title, body]) => (
          <article className="protocol-card" key={title}>
            <h3>{title}</h3>
            <p>{body}</p>
          </article>
        ))}
      </div>
      <div className="protocol-bottom">
        <pre className="delegation-tree"><code>{`Alice (7 days, 100 USDC)
└─ Steward {PAY, TREASURY}
   ├─ Procurement {PAY}
   └─ Treasury {TREASURY}`}</code></pre>
        <div className="protocol-links">
          <a href="https://github.com/Winston-9527/shadowpass">Source</a>
          <a href="https://github.com/Winston-9527/shadowpass/blob/main/docs/PRODUCT.md">Product</a>
          <a href="https://github.com/Winston-9527/shadowpass/blob/main/docs/INTERFACES.md">Interfaces</a>
        </div>
      </div>
    </section>
  );
}
