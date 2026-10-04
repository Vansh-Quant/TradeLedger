import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { ApplicationPrincipal } from "@tradeledger/application";
import { AuthorizationError, ValidationError } from "@tradeledger/application";
import { mapError } from "./errors.js";
import { DEFAULT_MAX_BODY_BYTES, FixedWindowRateLimiter } from "./security.js";
import type { ApiDependencies, ApiRequest, ApiServerOptions } from "./types.js";

const DEFAULT_RATE_LIMIT = Object.freeze({ windowMs: 60_000, maxRequests: 120 });
const MAX_IDEMPOTENCY_KEY_LENGTH = 128;

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
  response.end(JSON.stringify(body));
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

  if (method === "POST" && path === "/api/v1/orders") {
    const body = await readJson(request, maxBodyBytes);
    const key = idempotencyKey(request);
    const limitPrice = optionalNumber(body, "limitPrice");
    const stopPrice = optionalNumber(body, "stopPrice");
    const result = deps.application.submitOrder({
      principal,
      accountId: requiredString(body, "accountId"),
      instrumentId: requiredString(body, "instrumentId"),
      side: enumValue(body, "side", ["buy", "sell"] as const),
      type: enumValue(body, "type", ["market", "limit", "stop", "stop-limit"] as const),
      quantity: requiredNumber(body, "quantity"),
      ...(limitPrice === undefined ? {} : { limitPrice }),
      ...(stopPrice === undefined ? {} : { stopPrice }),
      timeInForce: enumValue(body, "timeInForce", ["day", "gtc", "ioc", "fok"] as const),
      orderNotional: requiredNumber(body, "orderNotional"),
      projectedPositionNotional: requiredNumber(body, "projectedPositionNotional"),
      projectedGrossExposure: requiredNumber(body, "projectedGrossExposure"),
      projectedNetExposure: requiredNumber(body, "projectedNetExposure"),
      dailyLoss: requiredNumber(body, "dailyLoss"),
      requestId: id,
      idempotencyKey: key,
    });
    send(response, id, result.admitted ? 201 : 422, result, corsOrigin);
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
