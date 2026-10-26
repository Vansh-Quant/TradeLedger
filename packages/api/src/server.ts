import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { ApplicationPrincipal } from "@tradeledger/application";
import type { ControlAction } from "@tradeledger/domain";
import {
  BAR_AGGREGATION_TARGETS, STRATEGY_SPECS, STRATEGY_SPEC_KINDS,
  aggregateDailyBars, alignAggregationRange, isBarAggregationTarget,
  runResearchBacktest, validateStrategySpec,
  type Bar, type InstrumentId, type IntervalHistoricalProvider, type MarketDataPoint,
} from "@tradeledger/domain";
import { AuthorizationError, ValidationError } from "@tradeledger/application";
import { mapError } from "./errors.js";
import { DEFAULT_MAX_BODY_BYTES, FixedWindowRateLimiter } from "./security.js";
import type { ApiDependencies, ApiRequest, ApiServerOptions } from "./types.js";

const DEFAULT_RATE_LIMIT = Object.freeze({ windowMs: 60_000, maxRequests: 120 });
const MAX_IDEMPOTENCY_KEY_LENGTH = 128;

function jsonSafe(value: unknown): unknown {
  if (value instanceof Map) return [...value.values()].map((item) => jsonSafe(item));
  if (value instanceof Set) return [...value].map((item) => jsonSafe(item));
  if (Array.isArray(value)) return value.map((item) => jsonSafe(item));
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, jsonSafe(item)]),
    );
  }
  return value;
}

function send(response: ServerResponse, id: string, status: number, body: unknown, corsOrigin?: string): void {
  response.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    "x-content-type-options": "nosniff",
    "x-frame-options": "DENY",
    "referrer-policy": "no-referrer",
    "content-security-policy": "default-src 'none'; frame-ancestors 'none'",
    "x-request-id": id,
    ...(corsOrigin === undefined ? {} : { "access-control-allow-origin": corsOrigin, "vary": "Origin" }),
  });
  response.end(JSON.stringify(jsonSafe(body)));
}

async function readJson(request: IncomingMessage, maxBytes: number): Promise<Record<string, unknown>> {
  const contentType = request.headers["content-type"];
  const mediaType = typeof contentType === "string"
    ? contentType.split(";", 1)[0]?.trim().toLowerCase()
    : undefined;
  if (mediaType !== "application/json") throw new ValidationError("content-type must be application/json");

  const contentLength = request.headers["content-length"];
  if (contentLength !== undefined) {
    const parsed = Number(contentLength);
    if (!Number.isSafeInteger(parsed) || parsed < 0 || parsed > maxBytes) {
      throw new ValidationError("request body is too large");
    }
  }

  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.length;
    if (size > maxBytes) {
      request.destroy();
      throw new ValidationError("request body is too large");
    }
    chunks.push(buffer);
  }
  if (size === 0) throw new ValidationError("request body is required");

  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new ValidationError("request body must contain valid JSON");
  }
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new ValidationError("request body must be a JSON object");
  }
  return parsed as Record<string, unknown>;
}

function requiredString(body: Record<string, unknown>, field: string): string {
  const value = body[field];
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new ValidationError(field + " must be a non-empty string");
  }
  return value.trim();
}

function requiredNumber(body: Record<string, unknown>, field: string): number {
  const value = body[field];
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new ValidationError(field + " must be a finite number");
  }
  return value;
}

function optionalNumber(body: Record<string, unknown>, field: string): number | undefined {
  const value = body[field];
  if (value === undefined) return undefined;
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new ValidationError(field + " must be a finite number");
  }
  return value;
}

function stringArray(body: Record<string, unknown>, field: string): string[] {
  const value = body[field];
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string" || item.trim().length === 0)) {
    throw new ValidationError(field + " must be a non-empty string array");
  }
  return value.map((item) => String(item).trim());
}

function enumValue<T extends string>(body: Record<string, unknown>, field: string, values: readonly T[]): T {
  const value = requiredString(body, field) as T;
  if (!values.includes(value)) throw new ValidationError(field + " has an invalid value");
  return value;
}

function idempotencyKey(request: IncomingMessage): string {
  const value = request.headers["idempotency-key"];
  if (typeof value !== "string" || value.length === 0) {
    throw new ValidationError("Idempotency-Key header is required");
  }
  if (value.length > MAX_IDEMPOTENCY_KEY_LENGTH || !/^[\x21-\x7e]+$/.test(value)) {
    throw new ValidationError("Idempotency-Key header is invalid");
  }
  return value;
}

function principalOrThrow(principal: ApplicationPrincipal | undefined): ApplicationPrincipal {
  if (principal === undefined) throw new AuthorizationError();
  return principal;
}

/** Narrows a provider to the optional explicit-interval extension. */
function asIntervalProvider(provider: import("@tradeledger/domain").MarketDataProvider):
  (import("@tradeledger/domain").MarketDataProvider & IntervalHistoricalProvider) | undefined {
  const candidate = provider as Partial<IntervalHistoricalProvider>;
  return typeof candidate.historicalWithInterval === "function" && Array.isArray(candidate.supportedIntervals)
    ? provider as import("@tradeledger/domain").MarketDataProvider & IntervalHistoricalProvider
    : undefined;
}

function providerIntervals(provider: import("@tradeledger/domain").MarketDataProvider): readonly string[] {
  return asIntervalProvider(provider)?.supportedIntervals ?? [];
}

/**
 * Loads bars for an explicit chart interval. Native provider intervals are
 * requested directly; `1w`/`1M` are calendar-aggregated from native daily
 * bars (never from intraday data). Throws `ValidationError` for intervals the
 * configured provider cannot serve, so the client gets an honest 400 with the
 * list of valid intervals instead of silently repeated candles.
 */
async function loadHistoryBars(
  provider: import("@tradeledger/domain").MarketDataProvider,
  instrumentId: InstrumentId,
  interval: string,
  startAt: string,
  endAt: string,
): Promise<{ readonly bars: readonly Bar[]; readonly sourceInterval: string; readonly aggregated: boolean }> {
  const intervalProvider = asIntervalProvider(provider);
  const native = intervalProvider?.supportedIntervals ?? [];
  const asBars = (points: readonly MarketDataPoint[]): readonly Bar[] =>
    points.filter((point): point is Bar => point.kind === "bar");

  const startMs = Date.parse(startAt);
  const endMs = Date.parse(endAt);
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) {
    throw new ValidationError("startAt and endAt must be valid timestamps with endAt after startAt");
  }
  const startIso = new Date(startMs).toISOString();
  const endIso = new Date(endMs).toISOString();

  if (native.includes(interval)) {
    if (intervalProvider === undefined) {
      throw new ValidationError(`the configured provider cannot serve an explicit interval "${interval}"`);
    }
    const bars = await intervalProvider.historicalWithInterval(instrumentId, "bar", interval, startIso, endIso);
    return { bars: asBars(bars), sourceInterval: interval, aggregated: false };
  }

  if (isBarAggregationTarget(interval)) {
    if (intervalProvider === undefined || !native.includes("1d")) {
      throw new ValidationError(`the configured provider cannot aggregate "${interval}" because native daily bars are unavailable`);
    }
    const { fetchFrom, alignedFrom } = alignAggregationRange(interval, startIso, endIso);
    const daily = await intervalProvider.historicalWithInterval(instrumentId, "bar", "1d", fetchFrom, endIso);
    const alignedMs = Date.parse(alignedFrom);
    const bars = aggregateDailyBars(daily.filter((point): point is Bar => point.kind === "bar"), interval).filter((bar) => {
      const start = Date.parse(bar.startAt);
      return start >= alignedMs && start < endMs;
    });
    return { bars, sourceInterval: "1d", aggregated: true };
  }

  throw new ValidationError(
    `interval "${interval}" is not supported; valid intervals: ${[...native, ...BAR_AGGREGATION_TARGETS].join(", ")}`,
  );
}

function coverageOf(bars: readonly Bar[], requestedFrom: string, requestedTo: string): Record<string, unknown> {
  if (bars.length === 0) {
    return { requestedFrom, requestedTo, returnedFrom: null, returnedTo: null, count: 0 };
  }
  return {
    requestedFrom,
    requestedTo,
    returnedFrom: bars[0]!.startAt,
    returnedTo: bars[bars.length - 1]!.endAt,
    count: bars.length,
  };
}

function decodeOrderId(match: RegExpExecArray): string {
  const value = match[1];
  if (value === undefined || value.length === 0) throw new ValidationError("order id is required");
  try {
    return decodeURIComponent(value);
  } catch {
    throw new ValidationError("order id is invalid");
  }
}

async function route(
  request: IncomingMessage,
  response: ServerResponse,
  deps: ApiDependencies,
  maxBodyBytes: number,
  id: string,
  corsOrigin?: string,
): Promise<void> {
  const method = request.method ?? "GET";
  let parsed: URL;
  try {
    parsed = new URL(request.url ?? "/", "http://tradeledger.local");
  } catch {
    throw new ValidationError("request URL is invalid");
  }
  const path = parsed.pathname;
  const apiRequest: ApiRequest = {
    method,
    url: request.url ?? "/",
    headers: request.headers,
    ...(request.socket.remoteAddress === undefined ? {} : { remoteAddress: request.socket.remoteAddress }),
    raw: request,
  };

  if (method === "GET" && path === "/health") {
    send(response, id, 200, { status: "ok" }, corsOrigin);
    return;
  }
  if (method === "GET" && path === "/ready") {
    send(response, id, 200, { status: "ready" }, corsOrigin);
    return;
  }

  const principal = principalOrThrow(await deps.authenticate(apiRequest));

  const competition = deps.competition;
  if (competition !== undefined) {
    if (method === "GET" && path === "/api/v1/competition/events") {
      const headerAfter = request.headers["last-event-id"];
      const queryAfter = parsed.searchParams.get("after");
      const afterRaw = queryAfter ?? (typeof headerAfter === "string" ? headerAfter : "0");
      const after = Number(afterRaw);
      if (!Number.isSafeInteger(after) || after < 0) throw new ValidationError("after must be a non-negative integer");
      const origin = corsOrigin;
      if (origin === undefined && request.headers.origin !== undefined) throw new AuthorizationError("event stream origin is not allowed");

      const backlog = competition.listEventsAfter(principal, after);
      response.writeHead(200, {
        "content-type": "text/event-stream; charset=utf-8",
        "cache-control": "no-cache, no-store, must-revalidate",
        "connection": "keep-alive",
        "x-accel-buffering": "no",
        "x-content-type-options": "nosniff",
        "x-request-id": id,
        ...(origin === undefined ? {} : { "access-control-allow-origin": origin, "vary": "Origin" }),
      });

      let closed = false;
      let replaying = true;
      let queued: import("@tradeledger/application").CompetitionEvent[] = [];

      const writeEvent = (event: import("@tradeledger/application").CompetitionEvent): void => {
        if (closed || response.writableEnded || response.destroyed) return;
        response.write(`id: ${event.sequence}\nevent: ${event.type}\ndata: ${JSON.stringify(jsonSafe(event))}\n\n`);
        if (response.writableLength > 1024 * 1024) response.destroy();
      };

      const unsubscribe = competition.subscribeToEvents(principal, (event) => {
        if (replaying) queued.push(event);
        else writeEvent(event);
      });

      const close = (): void => {
        if (closed) return;
        closed = true;
        unsubscribe();
        clearInterval(heartbeat);
        queued = [];
      };

      const heartbeat = setInterval(() => {
        if (closed || response.writableEnded || response.destroyed) {
          close();
          return;
        }
        response.write(": heartbeat\n\n");
      }, 20_000);

      request.on("close", close);
      response.on("close", close);

      for (const event of backlog) writeEvent(event);
      replaying = false;
      for (const event of queued) writeEvent(event);
      queued = [];

      response.write(": connected\\n\\n");
      return;
    }

    if (method === "GET" && path === "/api/v1/competition") {
      send(response, id, 200, competition.get(principal), corsOrigin);
      return;
    }

    if (method === "POST" && path === "/api/v1/competition") {
      const body = await readJson(request, maxBodyBytes);
      const instruments = stringArray(body, "allowedInstruments");
      const config = {
        id: requiredString(body, "id"),
        name: requiredString(body, "name"),
        maxParticipants: requiredNumber(body, "maxParticipants"),
        allowedInstruments: instruments,
        maxOrderNotional: requiredNumber(body, "maxOrderNotional"),
        maxOrdersPerParticipantPerSecond: requiredNumber(body, "maxOrdersPerParticipantPerSecond"),
        startingEquity: requiredNumber(body, "startingEquity"),
      };
      send(response, id, 201, competition.create({ principal, config }), corsOrigin);
      return;
    }

    if (method === "POST" && path === "/api/v1/competition/register") {
      const body = await readJson(request, maxBodyBytes);
      send(response, id, 200, competition.register({
        principal,
        participantId: requiredString(body, "participantId"),
        accountId: requiredString(body, "accountId"),
        ...(typeof body.registeredAt === "string" ? { registeredAt: body.registeredAt } : {}),
      }), corsOrigin);
      return;
    }

    if (method === "POST" && path === "/api/v1/competition/prepare") {
      const body = await readJson(request, maxBodyBytes);
      send(response, id, 200, competition.prepare(principal, requiredString(body, "requestId")), corsOrigin);
      return;
    }

    if (method === "POST" && path === "/api/v1/competition/control") {
      const body = await readJson(request, maxBodyBytes);
      const action = enumValue(body, "action", ["start","pause","resume","complete","halt","suspend_participant","resume_participant","liquidate_participant"] as const) as ControlAction;
      const participantId = typeof body.participantId === "string" ? body.participantId : undefined;
      send(response, id, 200, competition.control({
        principal,
        action,
        expectedVersion: requiredNumber(body, "expectedVersion"),
        requestId: requiredString(body, "requestId"),
        ...(participantId === undefined ? {} : { participantId }),
      }), corsOrigin);
      return;
    }

    if (method === "POST" && path === "/api/v1/competition/policy") {
      const body = await readJson(request, maxBodyBytes);
      const patch: Record<string, unknown> = {};
      if (typeof body.tradingEnabled === "boolean") patch.tradingEnabled = body.tradingEnabled;
      if (typeof body.emergencyHalt === "boolean") patch.emergencyHalt = body.emergencyHalt;
      if (body.allowedInstruments !== undefined) patch.allowedInstruments = stringArray(body, "allowedInstruments");
      if (body.maxOrderNotional !== undefined) patch.maxOrderNotional = requiredNumber(body, "maxOrderNotional");
      if (body.maxOrdersPerParticipantPerSecond !== undefined) patch.maxOrdersPerParticipantPerSecond = requiredNumber(body, "maxOrdersPerParticipantPerSecond");
      send(response, id, 200, competition.updatePolicy({ principal, patch: patch as never }), corsOrigin);
      return;
    }

    if (method === "POST" && path === "/api/v1/competition/orders") {
      const body = await readJson(request, maxBodyBytes);
      const result = competition.submitParticipantOrder({
        principal,
        participantId: requiredString(body, "participantId"),
        instrumentId: requiredString(body, "instrumentId"),
        side: enumValue(body, "side", ["buy", "sell"] as const),
        type: enumValue(body, "type", ["market", "limit", "stop", "stop-limit"] as const),
        quantity: requiredNumber(body, "quantity"),
        ...(body.limitPrice === undefined ? {} : { limitPrice: requiredNumber(body, "limitPrice") }),
        ...(body.stopPrice === undefined ? {} : { stopPrice: requiredNumber(body, "stopPrice") }),
        timeInForce: enumValue(body, "timeInForce", ["day", "gtc", "ioc", "fok"] as const),
        second: requiredNumber(body, "second"),
        ...(request.headers["idempotency-key"] === undefined ? {} : { idempotencyKey: idempotencyKey(request) }),
      });
      send(response, id, result.tradingResult.admitted ? 201 : 422, result, corsOrigin);
      return;
    }

    if (method === "POST" && path === "/api/v1/competition/authorize-order") {
      const body = await readJson(request, maxBodyBytes);
      send(response, id, 200, competition.authorizeOrder({
        principal,
        participantId: requiredString(body, "participantId"),
        instrumentId: requiredString(body, "instrumentId"),
        orderNotional: requiredNumber(body, "orderNotional"),
        second: requiredNumber(body, "second"),
      }), corsOrigin);
      return;
    }

    if (method === "POST" && path === "/api/v1/competition/performance") {
      const body = await readJson(request, maxBodyBytes);
      send(response, id, 200, competition.updatePerformance({
        principal,
        participantId: requiredString(body, "participantId"),
        realizedPnl: requiredNumber(body, "realizedPnl"),
        unrealizedPnl: requiredNumber(body, "unrealizedPnl"),
      }), corsOrigin);
      return;
    }
  }

  // Research / backtesting: declarative strategy specs executed against real
  // historical bars. No submitted code is ever evaluated.
  if (method === "GET" && path === "/api/v1/research/strategies") {
    // Static capability metadata: authentication is enough to read it.
    send(response, id, 200, { strategies: STRATEGY_SPECS, kinds: STRATEGY_SPEC_KINDS }, corsOrigin);
    return;
  }

  const researchList = path === "/api/v1/research/backtests";
  const researchRunMatch = /^\/api\/v1\/research\/backtests\/([^/]+)$/.exec(path);
  if (researchList || researchRunMatch !== null) {
    const store = deps.researchRuns;
    if (store === undefined) {
      send(response, id, 503, {
        error: { code: "RESEARCH_UNAVAILABLE", message: "research persistence is not configured on this server" },
      }, corsOrigin);
      return;
    }

    if (method === "GET" && researchList) {
      const accountId = requiredString(Object.fromEntries(parsed.searchParams), "accountId");
      deps.application.authorizeResearchRun({ principal, accountId });
      const runs = store.list()
        .filter((run) => run.accountId === accountId)
        .sort((left, right) => (left.createdAt < right.createdAt ? 1 : -1));
      send(response, id, 200, { runs }, corsOrigin);
      return;
    }

    if (method === "POST" && researchList) {
      const body = await readJson(request, maxBodyBytes);
      const accountId = requiredString(body, "accountId");
      deps.application.authorizeResearchRun({ principal, accountId });
      const instrumentId = requiredString(body, "instrumentId");
      const interval = requiredString(body, "interval");
      const startAt = requiredString(body, "startAt");
      const endAt = requiredString(body, "endAt");
      const initialCapital = optionalNumber(body, "initialCapital") ?? 100_000;
      const quantity = optionalNumber(body, "quantity") ?? 1;
      const commissionPerTrade = optionalNumber(body, "commissionPerTrade") ?? 0;
      const slippageBps = optionalNumber(body, "slippageBps") ?? 0;
      if (!(initialCapital > 0)) throw new ValidationError("initialCapital must be a positive number");
      if (!(quantity > 0)) throw new ValidationError("quantity must be a positive number");
      if (commissionPerTrade < 0) throw new ValidationError("commissionPerTrade must not be negative");
      if (slippageBps < 0) throw new ValidationError("slippageBps must not be negative");
      if (!Number.isFinite(Date.parse(startAt)) || !Number.isFinite(Date.parse(endAt)) || Date.parse(endAt) <= Date.parse(startAt)) {
        throw new ValidationError("startAt and endAt must be valid timestamps with endAt after startAt");
      }
      let spec;
      try {
        spec = validateStrategySpec(body.strategy);
      } catch (error) {
        throw new ValidationError(error instanceof Error ? error.message : "strategy specification is invalid");
      }
      if (deps.historicalMarketDataProvider === undefined) {
        send(response, id, 503, {
          error: { code: "MARKET_DATA_PROVIDER_UNAVAILABLE", message: "historical market-data provider is not configured" },
        }, corsOrigin);
        return;
      }
      const loaded = await loadHistoryBars(deps.historicalMarketDataProvider, instrumentId as InstrumentId, interval, startAt, endAt);
      if (loaded.bars.length === 0) {
        throw new ValidationError(`provider returned no historical bars for ${instrumentId} at interval "${interval}" in the requested range`);
      }
      let run;
      try {
        run = runResearchBacktest({
          runId: crypto.randomUUID(),
          createdAt: new Date().toISOString(),
          accountId,
          instrumentId,
          interval,
          requestedFrom: startAt,
          requestedTo: endAt,
          spec,
          bars: loaded.bars,
          initialCapital,
          quantity,
          commissionPerTrade,
          slippageBps,
        });
      } catch (error) {
        throw new ValidationError(error instanceof Error ? error.message : "backtest could not be executed");
      }
      if (body.save === true) store.save(run);
      send(response, id, 201, run, corsOrigin);
      return;
    }

    if (method === "GET" && researchRunMatch) {
      const accountId = requiredString(Object.fromEntries(parsed.searchParams), "accountId");
      deps.application.authorizeResearchRun({ principal, accountId });
      const runId = decodeOrderId(researchRunMatch);
      if (!/^[A-Za-z0-9._-]{1,128}$/.test(runId)) {
        send(response, id, 404, { error: { code: "NOT_FOUND", message: "research run not found" } }, corsOrigin);
        return;
      }
      const run = store.get(runId);
      if (run === undefined || run.accountId !== accountId) {
        send(response, id, 404, { error: { code: "NOT_FOUND", message: "research run not found" } }, corsOrigin);
        return;
      }
      send(response, id, 200, run, corsOrigin);
      return;
    }
  }

  const eventStream = path === "/api/v1/events";
  if (method === "GET" && eventStream) {
    const accountId = requiredString(Object.fromEntries(parsed.searchParams), "accountId");
    const afterRaw = parsed.searchParams.get("after") ?? "0";
    const after = Number(afterRaw);
    if (!Number.isSafeInteger(after) || after < 0) throw new ValidationError("after must be a non-negative integer");

    const origin = corsOrigin;
    if (origin === undefined && request.headers.origin !== undefined) {
      throw new AuthorizationError("event stream origin is not allowed");
    }

    const backlog = deps.application.listEventsAfter(principal, accountId, after);
    response.writeHead(200, {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-cache, no-store, must-revalidate",
      "connection": "keep-alive",
      "x-accel-buffering": "no",
      "x-content-type-options": "nosniff",
      "x-request-id": id,
      ...(origin === undefined ? {} : { "access-control-allow-origin": origin, "vary": "Origin" }),
    });

    let closed = false;
    let replaying = true;
    let queued: import("@tradeledger/application").ApplicationEvent[] = [];

    const writeEvent = (event: import("@tradeledger/application").ApplicationEvent): void => {
      if (closed || response.writableEnded || response.destroyed) return;
      response.write(`id: ${event.sequence}\nevent: ${event.type}\ndata: ${JSON.stringify(jsonSafe(event))}\n\n`);
      if (response.writableLength > 1024 * 1024) response.destroy();
    };

    const unsubscribe = deps.application.subscribeToEvents(principal, accountId, (event) => {
      if (replaying) queued.push(event);
      else writeEvent(event);
    });

    const close = (): void => {
      if (closed) return;
      closed = true;
      unsubscribe();
      clearInterval(heartbeat);
      queued = [];
    };

    const heartbeat = setInterval(() => {
      if (closed || response.writableEnded || response.destroyed) {
        close();
        return;
      }
      response.write(": heartbeat\n\n");
    }, 20_000);

    request.on("close", close);
    response.on("close", close);

    for (const event of backlog) writeEvent(event);
    replaying = false;
    for (const event of queued) writeEvent(event);
    queued = [];

    response.write(": connected\n\n");
    return;
  }

  if (method === "POST" && path === "/api/v1/executions") {
    const body = await readJson(request, maxBodyBytes);
    const key = idempotencyKey(request);
    const result = deps.application.recordExecution({
      principal,
      accountId: requiredString(body, "accountId"),
      orderId: requiredString(body, "orderId"),
      executionId: requiredString(body, "executionId"),
      instrumentId: requiredString(body, "instrumentId"),
      side: enumValue(body, "side", ["buy", "sell"] as const),
      quantity: requiredNumber(body, "quantity"),
      price: requiredNumber(body, "price"),
      executedAt: requiredString(body, "executedAt"),
      commission: requiredNumber(body, "commission"),
      requestId: id,
      idempotencyKey: key,
    });
    send(response, id, result.applied ? 201 : 200, result, corsOrigin);
    return;
  }

  if (method === "POST" && path === "/api/v1/orders") {
    const body = await readJson(request, maxBodyBytes);
    const key = idempotencyKey(request);
    const limitPrice = optionalNumber(body, "limitPrice");
    const stopPrice = optionalNumber(body, "stopPrice");
    const result = deps.application.submitOrderFromIntent({
      principal,
      accountId: requiredString(body, "accountId"),
      instrumentId: requiredString(body, "instrumentId"),
      side: enumValue(body, "side", ["buy", "sell"] as const),
      type: enumValue(body, "type", ["market", "limit", "stop", "stop-limit"] as const),
      quantity: requiredNumber(body, "quantity"),
      ...(limitPrice === undefined ? {} : { limitPrice }),
      ...(stopPrice === undefined ? {} : { stopPrice }),
      timeInForce: enumValue(body, "timeInForce", ["day", "gtc", "ioc", "fok"] as const),
      requestId: id,
      idempotencyKey: key,
    });
    send(response, id, result.admitted ? 201 : 422, result, corsOrigin);
    return;
  }

  const expiry = /^\/api\/v1\/orders\/([^/]+)\/expire$/.exec(path);
  if (method === "POST" && expiry) {
    const result = deps.application.expireOrder({
      principal,
      accountId: requiredString(Object.fromEntries(parsed.searchParams), "accountId"),
      orderId: decodeOrderId(expiry),
      requestId: id,
      idempotencyKey: idempotencyKey(request),
    });
    send(response, id, 200, result, corsOrigin);
    return;
  }

  const completion = /^\/api\/v1\/orders\/([^/]+)\/cancel\/complete$/.exec(path);
  if (method === "POST" && completion) {
    const result = deps.application.completeOrderCancellation({
      principal,
      accountId: requiredString(Object.fromEntries(parsed.searchParams), "accountId"),
      orderId: decodeOrderId(completion),
      requestId: id,
      idempotencyKey: idempotencyKey(request),
    });
    send(response, id, 200, result, corsOrigin);
    return;
  }

  const context = /^\/api\/v1\/accounts\/([^/]+)\/context$/.exec(path);
  if (method === "GET" && context) {
    const accountId = decodeOrderId(context);
    const result = deps.application.getTradingContext({
      principal,
      accountId,
    });
    send(response, id, 200, result, corsOrigin);
    return;
  }

  const historicalMarketData = /^\/api\/v1\/market-data\/([^/]+)\/history$/.exec(path);
  if (method === "GET" && historicalMarketData) {
    const query = Object.fromEntries(parsed.searchParams);
    const accountId = requiredString(query, "accountId");
    const startAt = requiredString(query, "startAt");
    const endAt = requiredString(query, "endAt");
    // Reuse the application authorization boundary before accessing provider data.
    deps.application.listMarketData({ principal, accountId });
    if (deps.historicalMarketDataProvider === undefined) {
      send(response, id, 503, {
        error: { code: "MARKET_DATA_PROVIDER_UNAVAILABLE", message: "historical market-data provider is not configured" },
      }, corsOrigin);
      return;
    }
    const provider = deps.historicalMarketDataProvider;
    const instrumentId = decodeOrderId(historicalMarketData) as InstrumentId;
    const interval = typeof query.interval === "string" ? query.interval.trim() : "";
    if (interval === "") {
      // Legacy path: provider-default interval, unchanged contract.
      const bars = await provider.historical(instrumentId, "bar", startAt, endAt);
      send(response, id, 200, { instrumentId, provider: provider.providerId, bars }, corsOrigin);
      return;
    }
    const loaded = await loadHistoryBars(provider, instrumentId, interval, startAt, endAt);
    send(response, id, 200, {
      instrumentId,
      provider: provider.providerId,
      interval,
      sourceInterval: loaded.sourceInterval,
      aggregated: loaded.aggregated,
      bars: loaded.bars,
      coverage: coverageOf(loaded.bars, startAt, endAt),
    }, corsOrigin);
    return;
  }

  // Instrument search: provider-backed resolution, never an invented symbol.
  const marketDataResolve = /^\/api\/v1\/market-data\/([^/]+)\/resolve$/.exec(path);
  if (method === "GET" && marketDataResolve) {
    const query = Object.fromEntries(parsed.searchParams);
    const accountId = requiredString(query, "accountId");
    deps.application.listMarketData({ principal, accountId });
    if (deps.historicalMarketDataProvider === undefined) {
      send(response, id, 503, {
        error: { code: "MARKET_DATA_PROVIDER_UNAVAILABLE", message: "historical market-data provider is not configured" },
      }, corsOrigin);
      return;
    }
    const provider = deps.historicalMarketDataProvider;
    const symbol = decodeOrderId(marketDataResolve).trim().toUpperCase();
    if (!/^[A-Z0-9._-]+$/.test(symbol)) {
      throw new ValidationError("symbol must contain only letters, digits, dot, underscore or dash");
    }
    const probeWindowMs = 7 * 24 * 60 * 60 * 1000;
    const now = Date.now();
    const probeInterval = providerIntervals(provider).includes("1d") ? "1d" : providerIntervals(provider)[0];
    let supported: boolean;
    let detail: string;
    let latestBar: Bar | undefined;
    let intervalUsed = probeInterval ?? "default";
    try {
      if (probeInterval === undefined) {
        const bars = await provider.historical(symbol as InstrumentId, "bar", new Date(now - probeWindowMs).toISOString(), new Date(now).toISOString());
        supported = bars.length > 0;
        latestBar = bars.filter((bar): bar is Bar => bar.kind === "bar").at(-1);
      } else {
        const loaded = await loadHistoryBars(provider, symbol as InstrumentId, probeInterval,
          new Date(now - probeWindowMs).toISOString(), new Date(now).toISOString());
        supported = loaded.bars.length > 0;
        latestBar = loaded.bars.at(-1);
        intervalUsed = loaded.sourceInterval;
      }
      detail = supported
        ? `provider returned data for interval ${intervalUsed} within the last 7 days`
        : "provider returned no data for this symbol in the last 7 days; it is not tradable through this provider";
    } catch (error) {
      send(response, id, 503, {
        error: { code: "MARKET_DATA_PROVIDER_ERROR", message: error instanceof Error ? error.message : "provider probe failed" },
      }, corsOrigin);
      return;
    }
    send(response, id, 200, {
      symbol,
      provider: provider.providerId,
      interval: intervalUsed,
      supported,
      detail,
      ...(latestBar === undefined ? {} : { latestBar }),
    }, corsOrigin);
    return;
  }

  // Provider + ingestion health behind the same authorization boundary.
  if (method === "GET" && path === "/api/v1/market-data/status") {
    const query = Object.fromEntries(parsed.searchParams);
    const accountId = requiredString(query, "accountId");
    deps.application.listMarketData({ principal, accountId });
    const provider = deps.historicalMarketDataProvider;
    const health = provider === undefined
      ? { providerId: "unconfigured", healthy: false, checkedAt: new Date().toISOString(), message: "historical market-data provider is not configured" }
      : await provider.health();
    send(response, id, 200, {
      provider: health,
      ingestion: deps.marketDataIngestionStatus?.() ?? null,
    }, corsOrigin);
    return;
  }

  const marketDataInstrument = /^\/api\/v1\/market-data\/([^/]+)$/.exec(path);
  if (method === "GET" && marketDataInstrument) {
    const result = deps.application.getMarketData({
      principal,
      accountId: requiredString(Object.fromEntries(parsed.searchParams), "accountId"),
      instrumentId: decodeOrderId(marketDataInstrument),
    });
    send(
      response,
      id,
      result === undefined ? 404 : 200,
      result ?? { error: { code: "NOT_FOUND", message: "market data not found" } },
      corsOrigin,
    );
    return;
  }

  if (method === "GET" && path === "/api/v1/market-data") {
    const result = deps.application.listMarketData({
      principal,
      accountId: requiredString(Object.fromEntries(parsed.searchParams), "accountId"),
    });
    send(response, id, 200, { states: result }, corsOrigin);
    return;
  }

  const accountOrders = /^\/api\/v1\/accounts\/([^/]+)\/orders$/.exec(path);
  if (method === "GET" && accountOrders) {
    const accountId = decodeOrderId(accountOrders);
    const result = deps.application.listOrders({
      principal,
      accountId,
    });
    send(response, id, 200, result, corsOrigin);
    return;
  }

  const order = /^\/api\/v1\/orders\/([^/]+)$/.exec(path);
  if (order && method === "GET") {
    const result = deps.application.getOrder({
      principal,
      accountId: requiredString(Object.fromEntries(parsed.searchParams), "accountId"),
      orderId: decodeOrderId(order),
    });
    send(response, id, 200, result, corsOrigin);
    return;
  }

  if (order && method === "POST") {
    const result = deps.application.cancelOrder({
      principal,
      accountId: requiredString(Object.fromEntries(parsed.searchParams), "accountId"),
      orderId: decodeOrderId(order),
      requestId: id,
      idempotencyKey: idempotencyKey(request),
    });
    send(response, id, 202, result, corsOrigin);
    return;
  }

  send(response, id, 404, { error: { code: "NOT_FOUND", message: "resource not found" } }, corsOrigin);
}

export function createHttpApi(deps: ApiDependencies, options: ApiServerOptions = {}): Server {
  const maxBodyBytes = options.maxBodyBytes ?? deps.maxBodyBytes ?? DEFAULT_MAX_BODY_BYTES;
  if (!Number.isSafeInteger(maxBodyBytes) || maxBodyBytes <= 0) throw new Error("invalid maxBodyBytes");

  const limiter = new FixedWindowRateLimiter(options.rateLimit ?? deps.rateLimit ?? DEFAULT_RATE_LIMIT);
  const corsOrigins = new Set(options.corsOrigins ?? []);
  for (const origin of corsOrigins) {
    if (origin.length === 0 || origin === "*") throw new Error("cors origin must be explicit");
  }

  return createServer({ maxHeaderSize: 16 * 1024 }, async (request, response) => {
    const id = crypto.randomUUID();
    const key = request.socket.remoteAddress ?? "unknown";
    const requestOrigin = request.headers.origin;
    const corsOrigin = typeof requestOrigin === "string" && corsOrigins.has(requestOrigin) ? requestOrigin : undefined;
    if (requestOrigin !== undefined && corsOrigin === undefined) {
      send(response, id, 403, { error: { code: "CORS_FORBIDDEN", message: "origin is not allowed" } });
      return;
    }
    if (request.method === "OPTIONS") {
      if (corsOrigin === undefined) {
        send(response, id, 204, {});
      } else {
        response.writeHead(204, {
          "access-control-allow-origin": corsOrigin,
          "access-control-allow-methods": "GET,POST,OPTIONS",
          "access-control-allow-headers": "authorization,content-type,idempotency-key",
          "access-control-max-age": "600",
          "vary": "Origin",
          "cache-control": "no-store",
          "x-request-id": id,
        });
        response.end();
      }
      return;
    }

    if (!limiter.allow(key)) {
      send(response, id, 429, { error: { code: "RATE_LIMITED", message: "too many requests" } });
      return;
    }

    try {
      await route(request, response, deps, maxBodyBytes, id, corsOrigin);
    } catch (error) {
      const mapped = mapError(error);
      send(response, id, mapped.status, mapped.body, corsOrigin);
    }
  });
}
