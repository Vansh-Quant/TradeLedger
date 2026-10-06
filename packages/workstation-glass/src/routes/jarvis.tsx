import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { Panel } from "@/components/terminal/primitives";
import { JarvisPanel } from "@/components/terminal/JarvisPanel";

export const Route = createFileRoute("/jarvis")({
  validateSearch: z.object({ q: z.string().optional() }),
  head: () => ({
    meta: [
      { title: "JARVIS — TradeLedger" },
      { name: "description", content: "JARVIS orchestration assistant for TradeLedger." },
      { property: "og:title", content: "JARVIS — TradeLedger" },
      { property: "og:description", content: "JARVIS orchestration assistant for TradeLedger." },
    ],
  }),
  component: Jarvis,
});

function Jarvis() {
  const { q } = Route.useSearch();
  return (
    <Panel className="mx-auto h-[calc(100vh-5rem)] max-w-3xl">
      <JarvisPanel key={q} initial={q} full />
    </Panel>
  );
}
