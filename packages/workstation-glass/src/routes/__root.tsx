import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useNavigate,
  useRouter,
  useRouterState,
  HeadContent,
  Scripts,
  type ErrorComponentProps,
} from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";

import appCss from "../styles.css?url";
import { reportLovableError } from "../lib/lovable-error-reporting";
import { AppShell } from "@/components/terminal/AppShell";
import { Toaster } from "@/components/ui/sonner";
import { AuthProvider, useAuth } from "@/lib/auth";
import { authGate } from "@/lib/auth-policy";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">Page not found</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          The page you're looking for doesn't exist or has been moved.
        </p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Go home
          </Link>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: ErrorComponentProps) {
  console.error("[TradeLedger Glass render error]", error);
  const router = useRouter();
  useEffect(() => {
    reportLovableError(error, { boundary: "tanstack_root_error_component" });
  }, [error]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          This page didn't load
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Something went wrong on our end. You can try refreshing or head back home.
        </p>
        {import.meta.env.DEV && (
          <pre className="mt-4 max-h-72 overflow-auto rounded border border-destructive/30 bg-black/40 p-3 text-left text-[10px] leading-4 text-destructive">
            {error instanceof Error ? (error.stack ?? error.message) : String(error)}
          </pre>
        )}
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            onClick={() => {
              router.invalidate();
              reset();
            }}
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Try again
          </button>
          <a
            href="/"
            className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
          >
            Go home
          </a>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "TradeLedger — Deterministic Trading OS" },
      {
        name: "description",
        content:
          "Institutional trading workstation for the TradeLedger deterministic trading engine.",
      },
      // Default deny for crawlers: every private route inherits this. The
      // public entry page (routes/index.tsx) opts back in with index,follow;
      // sitemap.xml lists only public pages.
      { name: "robots", content: "noindex, nofollow" },
      { property: "og:title", content: "TradeLedger — Deterministic Trading OS" },
      {
        property: "og:description",
        content:
          "Institutional trading workstation for the TradeLedger deterministic trading engine.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
    links: [
      {
        rel: "stylesheet",
        href: appCss,
      },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;600&family=Space+Grotesk:wght@400;500;600;700&display=swap",
      },
      { rel: "icon", href: "/favicon.ico", type: "image/x-icon" },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className="dark">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();

  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <RouteGate />
        <Toaster theme="dark" position="bottom-right" />
      </AuthProvider>
    </QueryClientProvider>
  );
}

/**
 * Decides what renders for the current URL:
 *
 * - public paths (`/` entry boundary, `/auth`) → the page itself, no shell
 * - private paths with a session → the workstation shell
 * - private paths without a session → redirect to sign-in (preserving the
 *   intended destination) or, while restoring, a loading screen
 * - production builds without Supabase configuration → a hard stop notice
 *
 * This is UX gating only: the API authenticates and authorizes every request
 * independently (packages/api/src/auth.ts + authorization.ts).
 */
function RouteGate() {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const { ready, configured, session, expired } = useAuth();
  const navigate = useNavigate();
  const decision = authGate({
    pathname,
    ready,
    configured,
    hasSession: session !== null,
    isProduction: import.meta.env.PROD,
  });

  const redirectTo = decision.kind === "sign-in" ? decision.redirect : undefined;
  useEffect(() => {
    if (redirectTo !== undefined) {
      void navigate({
        to: "/auth",
        search: { mode: "signin", redirect: redirectTo },
        replace: true,
      });
    }
  }, [redirectTo, navigate]);

  if (decision.kind === "public") return <Outlet />;
  if (decision.kind === "blocked") {
    return (
      <div className="grid min-h-screen place-items-center bg-background px-4">
        <div className="max-w-md text-center">
          <h1 className="text-lg font-semibold">Authentication is not configured</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            This build has no Supabase project configured, so the workstation stays locked. Set{" "}
            <span className="num">VITE_SUPABASE_URL</span> and{" "}
            <span className="num">VITE_SUPABASE_ANON_KEY</span>, rebuild, and sign in. See
            DEPLOYMENT.md.
          </p>
        </div>
      </div>
    );
  }
  if (decision.kind === "sign-in") {
    return (
      <div
        className="grid min-h-screen place-items-center bg-background text-muted-foreground"
        role="status"
        aria-label="Redirecting to sign in"
      >
        <span className="text-xs">
          Redirecting to sign in…{expired ? " (session expired)" : ""}
        </span>
      </div>
    );
  }
  if (decision.kind === "loading") {
    return (
      <div
        className="grid min-h-screen place-items-center bg-background text-muted-foreground"
        role="status"
        aria-label="Restoring session"
      >
        <span className="text-xs animate-pulse">Restoring your session…</span>
      </div>
    );
  }
  // Required: nested routes render inside the workstation shell.
  return (
    <AppShell>
      <Outlet />
    </AppShell>
  );
}
