import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { useAuth } from "@/lib/auth";
import { LandingPage } from "@/components/landing/LandingPage";

/**
 * Public entry boundary.
 *
 * Signed-out visitors see the public landing page. Signed-in visitors are
 * sent directly to the private workstation. Keep auth policy here; the
 * landing page itself stays presentational and does not touch private data.
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

  return <LandingPage />;
}
