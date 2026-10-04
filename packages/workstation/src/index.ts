import { TradeLedgerApiClient } from "@tradeledger/api";

const accountId = new URLSearchParams(window.location.search).get("account") ?? "ACC-APP";
const api = new TradeLedgerApiClient({
  baseUrl: window.location.origin,
  getToken: () => window.localStorage.getItem("tradeledger.accessToken") ?? undefined,
});

const app = document.querySelector<HTMLDivElement>("#app");
if (app === null) throw new Error("workstation root is missing");

let busy = false;

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  }[character] ?? character));
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(value);
}

function renderError(message: string): string {
  return `<div class="error" role="alert">${escapeHtml(message)}</div>`;
}

async function load(): Promise<void> {
  app.innerHTML = `
    <main class="shell">
      <header class="topbar">
        <div class="brand">TRADELEDGER</div>
        <div class="connection"><span class="dot"></span> CONNECTING</div>
        <div class="account">Account: <strong>${escapeHtml(accountId)}</strong></div>
      </header>
      <section class="workspace loading">Loading trading context…</section>
    </main>
  `;

  try {
    const [contextResult, ordersResult] = await Promise.all([
      api.getTradingContext(accountId),
      api.listOrders(accountId),
    ]);

    const context = contextResult.context;
    const positions = [...context.accountPortfolio.portfolio.positions.values()];
    const orders = ordersResult.orders;

    app.innerHTML = `
      <main class="shell">
        <header class="topbar">
          <div class="brand">TRADELEDGER</div>
          <div class="connection"><span class="dot online"></span> CONNECTED</div>
          <div class="account">Account: <strong>${escapeHtml(accountId)}</strong></div>
        </header>

        <section class="workspace">
          <aside class="watchlist panel">
            <div class="panel-title">WATCHLIST</div>
            <div class="watch-item active"><span>BTC/USD</span><span>—</span></div>
            <div class="watch-item"><span>ES</span><span>—</span></div>
            <div class="watch-item"><span>NIFTY</span><span>—</span></div>
            <div class="watch-item"><span>EUR/USD</span><span>—</span></div>
            <div class="muted">Live market data is not enabled in this slice.</div>
          </aside>

          <section class="market panel">
            <div class="panel-title">MARKET WORKSPACE</div>
            <div class="market-placeholder">
              <div class="placeholder-title">MARKET VIEW</div>
              <div class="muted">Chart engine deferred. This workspace consumes TradeLedger state only.</div>
            </div>
          </section>

          <section class="order-entry panel">
            <div class="panel-title">ORDER ENTRY</div>
            <form id="order-form">
              <label>Instrument<input name="instrumentId" value="AAPL" required></label>
              <div class="side-toggle">
                <label><input type="radio" name="side" value="buy" checked> BUY</label>
                <label><input type="radio" name="side" value="sell"> SELL</label>
              </div>
              <label>Quantity<input name="quantity" type="number" min="0.000001" step="any" value="1" required></label>
              <label>Order type<select name="type"><option value="market">Market</option><option value="limit">Limit</option></select></label>
              <label id="limit-price-field" hidden>Limit price<input name="limitPrice" type="number" min="0.000001" step="any"></label>
              <label>Time in force<select name="timeInForce"><option value="day">DAY</option><option value="gtc">GTC</option><option value="ioc">IOC</option><option value="fok">FOK</option></select></label>
              <div class="form-note">Admission inputs are sourced from the current trading context. No frontend risk calculation is performed.</div>
              <button type="submit" class="primary" ${busy ? "disabled" : ""}>SUBMIT ORDER</button>
              <div id="order-feedback"></div>
            </form>
          </section>

          <section class="positions panel">
            <div class="panel-title">POSITIONS / EXPOSURE</div>
            <div class="metrics">
              <div><span>Gross exposure</span><strong>${formatNumber(context.accountPortfolio.portfolio.grossExposure)}</strong></div>
              <div><span>Net exposure</span><strong>${formatNumber(context.accountPortfolio.portfolio.netExposure)}</strong></div>
              <div><span>Realized P&amp;L</span><strong>${formatNumber(context.accountPortfolio.portfolio.realizedPnl)}</strong></div>
            </div>
            <div class="table">
              <div class="row head"><span>SYMBOL</span><span>QTY</span><span>SIDE</span><span>AVG</span></div>
              ${positions.length === 0 ? '<div class="empty">No open positions</div>' : positions.map((position) => `
                <div class="row"><span>${escapeHtml(position.instrumentId)}</span><span>${formatNumber(position.quantity)}</span><span>${position.side.toUpperCase()}</span><span>${position.averagePrice === undefined ? "—" : formatNumber(position.averagePrice)}</span></div>
              `).join("")}
            </div>
          </section>

          <section class="orders panel">
            <div class="panel-title">ORDERS / ACTIVITY</div>
            <div class="table">
              <div class="row head"><span>ORDER</span><span>SYMBOL</span><span>SIDE</span><span>QTY</span><span>STATUS</span><span>ACTION</span></div>
              ${orders.length === 0 ? '<div class="empty">No orders</div>' : orders.map(({ order }) => `
                <div class="row">
                  <span title="${escapeHtml(order.id)}">${escapeHtml(order.id.slice(0, 8))}</span>
                  <span>${escapeHtml(order.instrumentId)}</span>
                  <span>${order.side.toUpperCase()}</span>
                  <span>${formatNumber(order.quantity)}</span>
                  <span>${order.status.toUpperCase()}</span>
                  <span>${["created","submitted","acknowledged","partially_filled"].includes(order.status) ? `<button class="cancel" data-order-id="${escapeHtml(order.id)}">CANCEL</button>` : "—"}</span>
                </div>
              `).join("")}
            </div>
          </section>
        </section>
      </main>
    `;

    bind();
  } catch (error) {
    app.innerHTML = `<main class="shell"><section class="panel fatal"><h1>TRADELEDGER</h1>${renderError(error instanceof Error ? error.message : "Unable to connect")}<button id="retry" class="primary">RETRY</button></section></main>`;
    document.querySelector<HTMLButtonElement>("#retry")?.addEventListener("click", () => void load());
  }
}

function bind(): void {
  const form = document.querySelector<HTMLFormElement>("#order-form");
  const type = form?.elements.namedItem("type") as HTMLSelectElement | null;
  const limitField = document.querySelector<HTMLElement>("#limit-price-field");
  const feedback = document.querySelector<HTMLDivElement>("#order-feedback");

  const updatePrice = () => {
    if (limitField && type) limitField.hidden = type.value !== "limit";
  };
  type?.addEventListener("change", updatePrice);
  updatePrice();

  form?.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (busy || feedback === null) return;
    busy = true;
    feedback.innerHTML = '<div class="muted">Submitting…</div>';

    const data = new FormData(form);
    const instrumentId = String(data.get("instrumentId") ?? "").trim();
    const side = String(data.get("side") ?? "buy") as "buy" | "sell";
    const orderType = String(data.get("type") ?? "market") as "market" | "limit";
    const quantity = Number(data.get("quantity"));
    const limitPrice = orderType === "limit" ? Number(data.get("limitPrice")) : undefined;

    try {
      const result = await api.submitOrder({
        accountId,
        instrumentId,
        side,
        type: orderType,
        quantity,
        ...(limitPrice === undefined ? {} : { limitPrice }),
        timeInForce: String(data.get("timeInForce") ?? "day") as "day" | "gtc" | "ioc" | "fok",
        orderNotional: orderType === "limit" && limitPrice !== undefined ? quantity * limitPrice : quantity,
        projectedPositionNotional: quantity,
        projectedGrossExposure: quantity,
        projectedNetExposure: side === "buy" ? quantity : -quantity,
        dailyLoss: 0,
      });
      feedback.innerHTML = result.admitted
        ? '<div class="success">Order admitted.</div>'
        : `<div class="error">Order rejected: ${escapeHtml(result.reason ?? "risk admission rejected the order")}</div>`;
      await load();
    } catch (error) {
      feedback.innerHTML = renderError(error instanceof Error ? error.message : "Order submission failed");
    } finally {
      busy = false;
    }
  });

  document.querySelectorAll<HTMLButtonElement>("[data-order-id]").forEach((button) => {
    button.addEventListener("click", async () => {
      const orderId = button.dataset.orderId;
      if (!orderId || busy) return;
      busy = true;
      button.disabled = true;
      try {
        await api.cancelOrder(accountId, orderId);
        await load();
      } catch (error) {
        window.alert(error instanceof Error ? error.message : "Cancellation failed");
        button.disabled = false;
        busy = false;
      }
    });
  });
}

void load();
