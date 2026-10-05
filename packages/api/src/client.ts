import type { MarketDataState } from "@tradeledger/domain";
import type {
  CancelOrderResult,
  GetOrderResult,
  GetTradingContextResult,
  ListOrdersResult,
  SubmitOrderCommand,
  SubmitOrderResult,
  RecordExecutionCommand,
  RecordExecutionResult,
} from "@tradeledger/application";

export interface TradeLedgerApiClientOptions {
  readonly baseUrl: string;
  readonly getToken?: () => string | undefined;
}

export class TradeLedgerApiClient {
  private readonly baseUrl: string;
  private readonly getToken: () => string | undefined;

  constructor(options: TradeLedgerApiClientOptions) {
    const baseUrl = options.baseUrl.replace(/\/$/, "");
    if (baseUrl.length === 0) throw new Error("baseUrl is required");
    this.baseUrl = baseUrl;
    this.getToken = options.getToken ?? (() => undefined);
  }


  async listMarketData(accountId: string): Promise<{ readonly states: readonly MarketDataState[] }> {
    return this.request<{ readonly states: readonly MarketDataState[] }>(
      `/api/v1/market-data?accountId=${encodeURIComponent(accountId)}`,
    );
  }

  async getMarketData(accountId: string, instrumentId: string): Promise<MarketDataState> {
    return this.request<MarketDataState>(
      `/api/v1/market-data/${encodeURIComponent(instrumentId)}?accountId=${encodeURIComponent(accountId)}`,
    );
  }

  async getTradingContext(accountId: string): Promise<GetTradingContextResult> {
    return this.request<GetTradingContextResult>(
      `/api/v1/accounts/${encodeURIComponent(accountId)}/context`,
    );
  }

  async listOrders(accountId: string): Promise<ListOrdersResult> {
    return this.request<ListOrdersResult>(
      `/api/v1/accounts/${encodeURIComponent(accountId)}/orders`,
    );
  }

  async getOrder(accountId: string, orderId: string): Promise<GetOrderResult> {
    return this.request<GetOrderResult>(
      `/api/v1/orders/${encodeURIComponent(orderId)}?accountId=${encodeURIComponent(accountId)}`,
    );
  }

  async submitOrder(
    command: Omit<
      SubmitOrderCommand,
      "principal" | "requestId" | "orderNotional" | "projectedPositionNotional" |
      "projectedGrossExposure" | "projectedNetExposure" | "dailyLoss"
    >,
  ): Promise<SubmitOrderResult> {
    const { accountId, instrumentId, side, type, quantity, limitPrice, stopPrice, timeInForce } = command;
    return this.request<SubmitOrderResult>("/api/v1/orders", {
      method: "POST",
      headers: { "content-type": "application/json", "idempotency-key": command.idempotencyKey ?? crypto.randomUUID() },
      body: JSON.stringify({
        accountId, instrumentId, side, type, quantity, limitPrice, stopPrice, timeInForce,
      }),
    });
  }


  async recordExecution(
    command: Omit<RecordExecutionCommand, "principal" | "requestId">,
  ): Promise<RecordExecutionResult> {
    return this.request<RecordExecutionResult>("/api/v1/executions", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "idempotency-key": command.idempotencyKey ?? crypto.randomUUID(),
      },
      body: JSON.stringify({
        accountId: command.accountId,
        orderId: command.orderId,
        executionId: command.executionId,
        instrumentId: command.instrumentId,
        side: command.side,
        quantity: command.quantity,
        price: command.price,
        executedAt: command.executedAt,
        commission: command.commission,
      }),
    });
  }

  async cancelOrder(accountId: string, orderId: string, idempotencyKey = crypto.randomUUID()): Promise<CancelOrderResult> {
    return this.request<CancelOrderResult>(
      `/api/v1/orders/${encodeURIComponent(orderId)}?accountId=${encodeURIComponent(accountId)}`,
      { method: "POST", headers: { "idempotency-key": idempotencyKey } },
    );
  }

  async completeOrderCancellation(
    accountId: string,
    orderId: string,
    idempotencyKey = crypto.randomUUID(),
  ): Promise<CancelOrderResult> {
    return this.request<CancelOrderResult>(
      `/api/v1/orders/${encodeURIComponent(orderId)}/cancel/complete?accountId=${encodeURIComponent(accountId)}`,
      { method: "POST", headers: { "idempotency-key": idempotencyKey } },
    );
  }

  private async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const token = this.getToken();
    const headers = new Headers(init.headers);
    if (token !== undefined) headers.set("authorization", `Bearer ${token}`);
    const response = await fetch(this.baseUrl + path, { ...init, headers });
    const body: unknown = await response.json();
    if (!response.ok) {
      const message =
        body && typeof body === "object" && "error" in body &&
        body.error && typeof body.error === "object" && "message" in body.error &&
        typeof body.error.message === "string"
          ? body.error.message
          : "request failed";
      throw new Error(message);
    }
    return body as T;
  }
}
