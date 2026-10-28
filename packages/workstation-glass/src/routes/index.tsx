import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { useAuth } from "@/lib/auth";

/**
 * Public entry boundary.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * INTEGRATION POINT FOR THE FUTURE LANDING PAGE (designed separately in
 * Google Stitch). Replace only this component's markup with the landing page;
 * the route stays `/`, remains public, and no other file needs to change.
 * The private dashboard lives at `/dashboard`.
 * ────────────────────────────────────────────────────────────────────────────
 *
 * Today this route only routes: signed-in visitors land on the workstation,
 * everyone else on the sign-in screen. It renders no private data and is the
 * only public page besides `/auth`.
 */
export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "TradeLedger — Deterministic Trading OS" },
      {
        name: "description",
        content:
          "Quantitative trading workstation with deterministic execution, research and risk engines.",
      },
      { name: "robots", content: "index, follow" },
      { property: "og:title", content: "TradeLedger — Deterministic Trading OS" },
      {
        property: "og:description",
        content:
          "Quantitative trading workstation with deterministic execution, research and risk engines.",
      },
      { property: "og:type", content: "website" },
    ],
    links: [{ rel: "canonical", href: canonicalUrl() }],
  }),
  component: IndexPage,
});

function canonicalUrl(): string {
  const site = (import.meta.env["VITE_SITE_URL"] as string | undefined)?.trim().replace(/\/+$/, "");
  if (site) return site + "/";
  // Without VITE_SITE_URL there is no trustworthy absolute origin at build
  // time; omit the canonical rather than shipping an incorrect one.
  return typeof window === "undefined" ? "/" : window.location.origin + "/";
}

function IndexPage() {
  const { ready, configured, session } = useAuth();
  const navigate = useNavigate();

  const signedIn = configured ? ready && session !== null : true;
  const resolved = !configured || ready;

  useEffect(() => {
    if (resolved && signedIn) void navigate({ to: "/dashboard", replace: true });
  }, [resolved, signedIn, navigate]);

  if (!resolved || signedIn) {
    return (
      <div
        className="grid min-h-screen place-items-center bg-background text-muted-foreground"
        role="status"
        aria-label="Loading"
      >
        <span className="text-xs">Loading…</span>
      </div>
    );
  }

  return (
    <main className="grid min-h-screen place-items-center bg-background px-4">
      <div className="w-full max-w-sm text-center">
        <svg viewBox="0 0 32 32" className="mx-auto size-10" aria-hidden>
          <path d="M16 2 30 16 16 30 2 16Z" fill="none" stroke="var(--primary)" strokeWidth="2" />
          <path d="M16 9 23 16 16 23 9 16Z" fill="var(--primary)" />
        </svg>
        <h1 className="mt-4 text-xl font-bold tracking-tight">TradeLedger</h1>
        <p className="mt-1 text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
          Deterministic trading OS
        </p>
        <Link
          to="/auth"
          search={{ mode: "signin" }}
          className="mt-6 inline-flex h-9 w-full items-center justify-center rounded-sm bg-primary px-4 text-xs font-semibold text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary"
        >
          Open your workstation
        </Link>
        <p className="mt-3 text-[11px] text-muted-foreground">
          New here?{" "}
          <Link to="/auth" search={{ mode: "signup" }} className="text-primary underline">
            Create an account
          </Link>
        </p>
      </div>
    </main>
  );
}
