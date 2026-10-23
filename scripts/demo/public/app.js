const $ = (selector) => document.querySelector(selector);

const state = {
  data: undefined,
  comparison: "purchase",
  busy: new Set(),
};

const formatAmount = (value) => {
  if (value === undefined || value === null) return "--";
  const raw = BigInt(value);
  const whole = raw / 1_000_000n;
  const fraction = String(raw % 1_000_000n).padStart(6, "0").replace(/0+$/, "");
  return `${whole}${fraction ? `.${fraction}` : ""} spUSD`;
};

const escapeHtml = (value) => String(value ?? "")
  .replaceAll("&", "&amp;")
  .replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;");

function short(value) {
  if (!value) return "待上链";
  return `${value.slice(0, 10)}…${value.slice(-6)}`;
}

function setText(selector, value) {
  const element = $(selector);
  if (element) element.textContent = value;
}

function showToast(message, error = false) {
  const toast = $("#toast");
  toast.textContent = message;
  toast.classList.toggle("error", error);
  toast.classList.add("visible");
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => toast.classList.remove("visible"), 4200);
}

function setBusy(action, busy) {
  if (busy) state.busy.add(action);
  else state.busy.delete(action);
  for (const button of document.querySelectorAll(`[data-action="${action}"]`)) {
    button.disabled = busy;
    button.classList.toggle("busy", busy);
    if (busy) button.dataset.html ??= button.innerHTML;
    button.innerHTML = busy ? "执行中…" : button.dataset.html;
  }
}

async function request(route, options = {}) {
  const response = await fetch(route, {
    headers: { "content-type": "application/json" },
    ...options,
  });
  const body = await response.json();
  if (!response.ok) throw new Error(body.message ?? body.error ?? `HTTP ${response.status}`);
  return body;
}

async function refresh() {
  try {
    state.data = await request("/api/status");
    render();
  } catch (error) {
    showToast(`状态加载失败：${error.message}`, true);
  }
}

function render() {
  const data = state.data;
  if (!data) return;
  setText("#network-name", `${data.network.name} 本地链`);
  setText("#chain-id", String(data.network.chainId));
  setText("#simulated-count", `${data.anonymity.simulatedDepositors} 个模拟用户`);
  setText("#simulation-copy", data.simulatedLabel);
  setText("#note-set", `${data.anonymity.noteSetSize} 张票据`);
  setText("#tx-count", `${data.transactions.length} 笔`);
  setText("#buyer-budget", formatAmount(data.story.branches.buyer.budget));
  setText("#treasury-budget", formatAmount(data.story.branches.treasury.budget));
  setText("#purchase-balance", formatAmount(data.story.branches.buyer.budget));
  setText("#treasury-balance", formatAmount(data.story.branches.treasury.budget));
  setText("#purchase-status", data.story.branches.buyer.status);
  setText("#treasury-status", data.story.branches.treasury.status);
  setText("#return-cm", data.position?.returnCm ? short(data.position.returnCm) : "待生成");
  setText("#simulated-deposits", formatAmount(data.anonymity.simulatedDeposits));
  setText("#registered-identities", String(data.anonymity.registeredIdentities));
  setText("#gate-address", data.network.gate);
  setText("#merchant-url", data.network.merchantUrl);

  const purchaseButton = $('[data-action="purchase"]');
  purchaseButton.disabled = state.busy.has("purchase") || BigInt(data.story.branches.buyer.budget) < 2_000_000n;
  const treasuryButton = $('[data-action="treasury"]');
  treasuryButton.disabled = state.busy.has("treasury") || data.position !== null;
  const withdrawButton = $("#withdraw-button");
  withdrawButton.disabled = state.busy.has("treasury-withdraw") || !data.position || data.position.withdrawn;

  renderLedger(data.actions);
  renderComparison(data);
}

function renderLedger(actions) {
  const ledger = $("#ledger");
  if (!actions.length) {
    ledger.innerHTML = '<div class="empty-state">等待第一笔操作</div>';
    return;
  }
  ledger.innerHTML = actions.slice().reverse().map((action) => `
    <article class="ledger-row">
      <div class="ledger-main">
        <strong>${escapeHtml(action.label)}</strong>
        <code title="${escapeHtml(action.tx ?? "")}">${escapeHtml(short(action.tx))}</code>
      </div>
      <div class="ledger-amount">${escapeHtml(formatAmount(action.amount))}</div>
      <div class="owner-chain">
        ${(action.ownerView ?? []).map((name, index) => `${index ? '<i>→</i>' : ''}<span>${escapeHtml(name)}</span>`).join("") || '<span>不附加主人密文</span>'}
      </div>
      <div class="ledger-time">${action.proofMs ? `${Math.round(action.proofMs)} ms proof` : "状态更新"}</div>
    </article>
  `).join("");
}

function fillList(selector, items) {
  $(selector).innerHTML = items.map((item) => `<li>${escapeHtml(item)}</li>`).join("");
}

function renderComparison(data) {
  const comparison = state.comparison === "treasury" ? data.comparisonTreasury : data.comparison;
  const shadowpass = comparison.shadowpass;
  const session = comparison.sessionKey;
  setText("#shadowpass-compare-title", shadowpass.title);
  setText("#session-compare-title", session.title);
  setText("#shadowpass-action", `${comparison.action}${comparison.transaction ? ` · ${short(comparison.transaction)}` : " · 等待上链"}`);
  setText("#session-action", `${comparison.action}${comparison.transaction ? " · 同一笔业务操作" : " · 等待操作"}`);
  fillList("#shadowpass-visible", shadowpass.visible);
  fillList("#shadowpass-hidden", shadowpass.hidden);
  fillList("#shadowpass-events", shadowpass.onchain);
  fillList("#session-visible", session.visible);
  fillList("#session-hidden", session.hidden);
  fillList("#session-events", session.onchain);
}

async function runAction(action) {
  if (state.busy.has(action)) return;
  setBusy(action, true);
  try {
    const result = await request(`/api/actions/${action}`, { method: "POST", body: "{}" });
    const proof = result.record?.proofMs ? `，证明 ${Math.round(result.record.proofMs)} ms` : "";
    showToast(`完成${proof}`);
    await refresh();
  } catch (error) {
    showToast(`操作失败：${error.message}`, true);
  } finally {
    setBusy(action, false);
    render();
  }
}

async function checkCapability(button) {
  const branch = button.dataset.capability;
  const operation = button.dataset.operation;
  try {
    const result = await request("/api/capability-check", {
      method: "POST",
      body: JSON.stringify({ branch, operation }),
    });
    const target = branch === "buyer" ? $("#buyer-check") : $("#treasury-check");
    target.textContent = result.explanation;
    target.classList.toggle("allowed", result.allowed);
  } catch (error) {
    showToast(`能力检查失败：${error.message}`, true);
  }
}

for (const button of document.querySelectorAll("[data-action]")) {
  button.addEventListener("click", () => void runAction(button.dataset.action));
}
for (const button of document.querySelectorAll("[data-capability]")) {
  button.addEventListener("click", () => void checkCapability(button));
}
for (const button of document.querySelectorAll("[data-comparison]")) {
  button.addEventListener("click", () => {
    state.comparison = button.dataset.comparison;
    for (const item of document.querySelectorAll("[data-comparison]")) item.classList.toggle("active", item === button);
    if (state.data) renderComparison(state.data);
  });
}

void refresh();
setInterval(() => void refresh(), 5000);
