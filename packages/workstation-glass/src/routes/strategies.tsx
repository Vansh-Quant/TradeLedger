import { createFileRoute, redirect } from "@tanstack/react-router";

/**
 * Strategies was merged into the combined Research workspace. The route stays
 * so existing bookmarks and deep links keep working; it hands the visitor to
 * the Strategy Library tab instead of showing a second, divergent view.
 */
export const Route = createFileRoute("/strategies")({
  beforeLoad: () => {
    throw redirect({ to: "/research", search: { tab: "library" } });
  },
  component: () => null,
});
