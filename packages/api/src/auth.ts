import { createPublicKey, createVerify, type KeyObject } from "node:crypto";
import { AuthenticationError } from "@tradeledger/application";
import type { ApplicationPrincipal } from "@tradeledger/application";
import { bearerToken } from "./security.js";
import type { ApiRequest } from "./types.js";

/**
 * Supabase access-token verification for the API boundary.
 *
 * The workstation's browser session is only a convenience: every protected
 * request is independently authenticated here against Supabase's published
 * JWKS, using node:crypto only (no new runtime dependency). The identity used
 * for authorization is the verified `sub` claim — never a client-supplied id.
 */

export interface Jwks {
  readonly keys: readonly { readonly kid?: string; readonly kty?: string; readonly alg?: string;
    readonly crv?: string; readonly x?: string; readonly y?: string;
    readonly n?: string; readonly e?: string }[];
}

export type FetchJwks = (url: string) => Promise<Jwks>;

export interface SupabaseJwtAuthenticatorOptions {
  /** Supabase project URL without a trailing slash, e.g. https://abc.supabase.co */
  readonly supabaseUrl: string;
  readonly audience?: string;
  readonly fetchJwks?: FetchJwks;
  readonly now?: () => number;
  /** Allowed clock skew in seconds when checking exp/nbf. */
  readonly clockToleranceSeconds?: number;
  /** How long a fetched JWKS document stays cached. */
  readonly jwksTtlMs?: number;
  /** Minimum interval between JWKS refetches triggered by an unknown kid. */
  readonly jwksMinRefreshMs?: number;
}

function base64UrlDecode(value: string): Buffer {
  return Buffer.from(value.replace(/-/g, "+").replace(/_/g, "/"), "base64");
}

function jwkToKey(jwk: { kty?: string; crv?: string; x?: string; y?: string; n?: string; e?: string }): KeyObject {
  if (jwk.kty === "EC" && jwk.crv === "P-256" && jwk.x !== undefined && jwk.y !== undefined) {
    return createPublicKey({ key: { kty: "EC", crv: "P-256", x: jwk.x, y: jwk.y }, format: "jwk" });
  }
  if (jwk.kty === "RSA" && jwk.n !== undefined && jwk.e !== undefined) {
    return createPublicKey({ key: { kty: "RSA", n: jwk.n, e: jwk.e }, format: "jwk" });
  }
  throw new Error("unsupported JWK key type");
}

const defaultFetchJwks: FetchJwks = async (url) => {
  const response = await fetch(url, {
    headers: { accept: "application/json" },
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw new Error(`JWKS endpoint returned ${response.status}`);
  return (await response.json()) as Jwks;
};

interface Claims {
  readonly sub: string;
  readonly iss: string;
  readonly aud: string | readonly string[];
  readonly exp?: number;
  readonly nbf?: number;
  readonly roles?: readonly string[];
}

/**
 * Returns a request authenticator that verifies Supabase JWT bearer tokens.
 * All failures raise `AuthenticationError` without echoing token material.
 */
export function supabaseJwtAuthenticator(options: SupabaseJwtAuthenticatorOptions) {
  const issuer = options.supabaseUrl.replace(/\/+$/, "") + "/auth/v1";
  const jwksUrl = issuer + "/.well-known/jwks.json";
  const audience = options.audience ?? "authenticated";
  const now = options.now ?? Date.now;
  const toleranceSeconds = options.clockToleranceSeconds ?? 30;
  const ttlMs = options.jwksTtlMs ?? 10 * 60_000;
  const minRefreshMs = options.jwksMinRefreshMs ?? 30_000;
  const fetchJwks = options.fetchJwks ?? defaultFetchJwks;

  let cached: { keys: Map<string, KeyObject>; fetchedAt: number } | undefined;
  let lastRefreshAttemptAt = 0;
  let inFlight: Promise<Map<string, KeyObject>> | undefined;

  const loadKeys = async (force: boolean): Promise<Map<string, KeyObject>> => {
    if (!force && cached !== undefined && now() - cached.fetchedAt < ttlMs) return cached.keys;
    if (inFlight !== undefined && !force) return inFlight;
    if (force && now() - lastRefreshAttemptAt < minRefreshMs && cached !== undefined) return cached.keys;
    lastRefreshAttemptAt = now();
    inFlight = (async () => {
      const document = await fetchJwks(jwksUrl);
      const keys = new Map<string, KeyObject>();
      for (const jwk of document.keys) {
        if (jwk.kid === undefined) continue;
        try {
          keys.set(jwk.kid, jwkToKey(jwk));
        } catch { /* skip unusable keys */ }
      }
      if (keys.size === 0) throw new Error("JWKS contained no usable keys");
      cached = { keys, fetchedAt: now() };
      return keys;
    })().finally(() => { inFlight = undefined; });
    return inFlight;
  };

  return async (request: ApiRequest): Promise<ApplicationPrincipal> => {
    const token = bearerToken(request.headers);
    if (token === undefined) throw new AuthenticationError();

    const parts = token.split(".");
    if (parts.length !== 3) throw new AuthenticationError();
    const [headerRaw, payloadRaw, signatureRaw] = parts as [string, string, string];

    let header: { alg?: string; kid?: string };
    let claims: Claims;
    try {
      header = JSON.parse(base64UrlDecode(headerRaw).toString("utf8"));
      claims = JSON.parse(base64UrlDecode(payloadRaw).toString("utf8"));
    } catch {
      throw new AuthenticationError();
    }
    if (header.alg !== "ES256" && header.alg !== "RS256") throw new AuthenticationError();
    if (header.kid === undefined) throw new AuthenticationError();

    let keys = await loadKeys(false);
    let key = keys.get(header.kid);
    if (key === undefined) {
      keys = await loadKeys(true);
      key = keys.get(header.kid);
    }
    if (key === undefined) throw new AuthenticationError();

    if (!verifySignature(header.alg, key, `${headerRaw}.${payloadRaw}`, base64UrlDecode(signatureRaw))) {
      throw new AuthenticationError();
    }

    const nowSeconds = Math.floor(now() / 1000);
    if (claims.iss !== issuer) throw new AuthenticationError();
    const aud = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
    if (!aud.includes(audience)) throw new AuthenticationError();
    if (typeof claims.exp === "number" && claims.exp + toleranceSeconds < nowSeconds) throw new AuthenticationError();
    if (typeof claims.nbf === "number" && claims.nbf - toleranceSeconds > nowSeconds) throw new AuthenticationError();
    if (typeof claims.sub !== "string" || claims.sub.length === 0) throw new AuthenticationError();

    const roles = Array.isArray(claims.roles)
      ? claims.roles.filter((role): role is string => typeof role === "string")
      : [];
    return { id: claims.sub, roles: roles.length > 0 ? roles : ["authenticated"] };
  };
}

function verifySignature(alg: string, key: KeyObject, data: string, signature: Buffer): boolean {
  const verify = createVerify(alg === "ES256" ? "SHA256" : "SHA256");
  verify.update(data);
  verify.end();
  if (alg === "ES256") {
    // JOSE encodes ECDSA signatures as raw r||s (IEEE P1363), not DER.
    return verify.verify({ key, dsaEncoding: "ieee-p1363" }, signature);
  }
  return verify.verify(key, signature);
}