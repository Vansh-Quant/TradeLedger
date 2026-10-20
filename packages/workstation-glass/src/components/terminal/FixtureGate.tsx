import { useState, type ReactNode } from "react";
import { FlaskConical } from "lucide-react";
import { Panel } from "./primitives";

/**
 * Development fixture content must be requested explicitly. Nothing behind this
 * gate is presented as account data, and the caller states what is missing.
 */
export function FixtureGate({ title, reason, detail, fixture }: {
  title: string;
  reason: string;
  detail: ReactNode;
  fixture: ReactNode;
}) {
  const [open, setOpen] = useState(false);

  if (open) {
    return (
      <div>
        <div role="status" className="mb-3 flex flex-wrap items-center justify-between gap-2 border border-warning/35 bg-warning/8 px-3 py-2 text-[11px]">
          <span>
            <span className="font-semibold tracking-wide text-warning">DEMO / SIMULATED</span>
            <span className="ml-2 text-muted-foreground">{reason}</span>
          </span>
          <button type="button" onClick={() => setOpen(false)} className="text-[11px] font-medium text-primary hover:underline">
            Hide fixture
          </button>
        </div>
        {fixture}
      </div>
    );
  }

  return (
    <Panel title={title}>
      <div className="flex min-h-40 flex-col items-start gap-2 p-4">
        <FlaskConical className="size-5 text-muted-foreground" aria-hidden />
        <p className="text-[13px] font-medium">{reason}</p>
        <div className="max-w-xl type-meta">{detail}</div>
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="mt-1 h-7 rounded-sm border px-2.5 text-[11px] font-medium hover:bg-accent"
        >
          Show development fixture
        </button>
      </div>
    </Panel>
  );
}
