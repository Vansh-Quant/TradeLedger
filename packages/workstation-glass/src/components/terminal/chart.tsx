import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Bar,
  Brush,
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { CandlestickChart } from "lucide-react";
import { api } from "@/api/client";
import { isConfigured, useApiConfig } from "@/api/config";
import type { CandleView } from "@/lib/chart-view";
import {
  DEFAULT_RANGE_ID,
  DEFAULT_TIMEFRAME_ID,
  RANGES,
  TIMEFRAMES,
  describeAge,
  describeCoverage,
  formatPriceFixed,
  historyWindow,
  pricePrecision,
  timeframe,
  toCandles,
} from "@/lib/chart-view";
import { cn } from "@/lib/utils";
import { LoadingState, NotConnectedState } from "./primitives";

interface CandleShapeProps {
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  payload?: CandleView;
}

/** Draws one candle: wick across [low, high], body between open and close. */
function CandleShape({ x = 0, y = 0, width = 0, height = 0, payload }: CandleShapeProps) {
  if (!payload) return null;
  const { high, low, open, close, up } = payload;
  const color = up ? "var(--positive)" : "var(--negative)";
  const span = high - low;
  const center = x + width / 2;
  const bodyWidth = Math.max(1, width * 0.62);
  let top = y;
  let bottom = y + height;
  if (span > 0 && height > 0) {
    top = y + ((high - Math.max(open, close)) / span) * height;
    bottom = y + ((high - Math.min(open, close)) / span) * height;
  }
  const bodyHeight = Math.max(1, bottom - top);
  return (
    <g>
      <line x1={center} x2={center} y1={y} y2={y + height} stroke={color} strokeWidth={1} />
      <rect
        x={x + (width - bodyWidth) / 2}
        y={top}
        width={bodyWidth}
        height={bodyHeight}
        fill={color}
      />
    </g>
  );
}

function ChartTooltip({
  active,
  payload,
  precision,
}: {
  active?: boolean;
  payload?: Array<{ payload?: CandleView }>;
  precision: number;
}) {
  const candle = active && payload && payload.length > 0 ? payload[0]?.payload : undefined;
  if (!candle) return null;
  const rows: Array<[string, number]> = [
    ["O", candle.open],
    ["H", candle.high],
    ["L", candle.low],
    ["C", candle.close],
  ];
  return (
    <div className="rounded-sm border border-border bg-panel px-2 py-1.5 text-[11px] shadow-md">
      <div className="mb-1 text-muted-foreground">{candle.label} UTC</div>
      <div className="num grid grid-cols-4 gap-2">
        {rows.map(([key, value]) => (
          <span key={key} className="text-right">
            <span className="text-muted-foreground">{key}</span>{" "}
            {formatPriceFixed(value, precision)}
          </span>
        ))}
      </div>
    </div>
  );
}

/**
 * Historical chart for the Trading workspace. Every candle comes from the
 * backend history endpoint; timeframe buttons map to real provider intervals
 * (1W/1M are calendar-aggregated from daily bars server-side).
 */
export function TradingChart({ symbol }: { symbol: string }) {
  const cfg = useApiConfig();
  const [timeframeId, setTimeframeId] = useState(DEFAULT_TIMEFRAME_ID);
  const [rangeId, setRangeId] = useState(DEFAULT_RANGE_ID);
  const [mode, setMode] = useState<"candles" | "line">("candles");
  const [tick, setTick] = useState(() => Date.now());

  useEffect(() => {
    const timer = window.setInterval(() => setTick(Date.now()), 15_000);
    return () => window.clearInterval(timer);
  }, []);

  const selected = timeframe(timeframeId);
  const hasSymbol = symbol.trim().length > 0;

  const q = useQuery({
    queryKey: [
      "market-history",
      cfg.baseUrl,
      cfg.token,
      cfg.accountId,
      symbol,
      selected.interval,
      rangeId,
    ],
    queryFn: () => {
      const window = historyWindow(rangeId, Date.now());
      return api.marketDataHistory(
        cfg.accountId,
        symbol,
        selected.interval,
        window.startAt,
        window.endAt,
      );
    },
    enabled: isConfigured(cfg) && hasSymbol,
    refetchInterval: 30_000,
    retry: 1,
    staleTime: 5_000,
  });

  const candles = useMemo(() => toCandles(q.data?.bars ?? []), [q.data]);
  const precision = useMemo(
    () => pricePrecision(candles.flatMap((candle) => [candle.high, candle.low])),
    [candles],
  );
  const bounds = useMemo(() => {
    if (candles.length === 0) return { min: 0, max: 1 };
    let min = Number.POSITIVE_INFINITY;
    let max = Number.NEGATIVE_INFINITY;
    for (const candle of candles) {
      min = Math.min(min, candle.low);
      max = Math.max(max, candle.high);
    }
    const pad = (max - min) * 0.06 || Math.abs(max) * 0.01 || 1;
    return { min: min - pad, max: max + pad };
  }, [candles]);

  const coverage = describeCoverage(q.data?.coverage);
  const fetchedAge = q.dataUpdatedAt > 0 ? describeAge(tick - q.dataUpdatedAt) : null;

  return (
    <div className="flex h-full flex-col">
      <div className="flex min-h-10 flex-wrap items-center gap-3 border-b px-3 py-1.5">
        <span className="text-base font-semibold">{hasSymbol ? symbol : "—"}</span>
        <span className="text-xs text-muted-foreground">
          {q.data ? `BiQuote · ${selected.label} · ${fetchedAge ?? ""}` : "no candles loaded"}
        </span>
        <div className="ml-auto flex items-center gap-2">
          <div className="flex gap-0.5" role="group" aria-label="Chart type">
            {(["candles", "line"] as const).map((value) => (
              <button
                key={value}
                type="button"
                onClick={() => setMode(value)}
                className={cn(
                  "rounded-sm px-2 py-0.5 text-[11px] capitalize",
                  mode === value
                    ? "bg-accent text-foreground"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {value}
              </button>
            ))}
          </div>
          <div className="flex gap-0.5" role="group" aria-label="Chart timeframe">
            {TIMEFRAMES.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setTimeframeId(item.id)}
                title={
                  item.aggregated
                    ? `${item.label} candles are calendar-aggregated from daily history`
                    : `Native provider interval ${item.interval}`
                }
                className={cn(
                  "rounded-sm px-2 py-0.5 text-[11px]",
                  item.id === timeframeId
                    ? "bg-accent text-foreground"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {item.label}
              </button>
            ))}
          </div>
          <label className="flex items-center gap-1 text-[11px] text-muted-foreground">
            Range
            <select
              value={rangeId}
              onChange={(event) => setRangeId(event.target.value)}
              aria-label="Visible history range"
              className="field-control num h-6 rounded-sm px-1 text-[11px]"
            >
              {RANGES.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.label}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>

      <div className="relative min-h-0 flex-1">
        {!hasSymbol ? (
          <Placeholder
            icon
            title="No instrument selected"
            detail="Search a symbol in the watchlist to load its chart."
          />
        ) : !isConfigured(cfg) ? (
          <NotConnectedState />
        ) : q.isLoading ? (
          <LoadingState label={`Loading ${selected.label} candles…`} />
        ) : q.isError ? (
          <Placeholder
            icon
            title="History request failed"
            detail={
              q.error instanceof Error
                ? q.error.message
                : "The backend could not load candles for this symbol."
            }
            action={{ label: "Retry", onClick: () => void q.refetch() }}
          />
        ) : candles.length === 0 ? (
          <Placeholder
            icon
            title={`No ${selected.label} data for ${symbol}`}
            detail={
              `The provider returned no candles for this symbol and interval in the requested window. ` +
              `The symbol may be unsupported, or this interval may have no history yet — the watchlist search reports provider-verified support.`
            }
            action={{ label: "Retry", onClick: () => void q.refetch() }}
          />
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={candles} margin={{ top: 8, right: 8, bottom: 4, left: 8 }}>
              <CartesianGrid stroke="var(--border)" strokeDasharray="2 4" vertical={false} />
              <XAxis
                dataKey="label"
                minTickGap={56}
                tick={{ fontSize: 10, fill: "var(--muted-foreground)" }}
                tickLine={false}
                axisLine={{ stroke: "var(--border)" }}
              />
              <YAxis
                orientation="right"
                width={78}
                domain={[bounds.min, bounds.max]}
                tickFormatter={(value: number) => formatPriceFixed(Number(value), precision)}
                tick={{ fontSize: 10, fill: "var(--muted-foreground)" }}
                tickLine={false}
                axisLine={false}
              />
              <Tooltip
                content={<ChartTooltip precision={precision} />}
                cursor={{ stroke: "var(--muted-foreground)", strokeDasharray: "3 3" }}
              />
              {mode === "candles" ? (
                <Bar dataKey="range" isAnimationActive={false} shape={<CandleShape />} />
              ) : (
                <Line
                  dataKey="close"
                  dot={false}
                  strokeWidth={1.5}
                  stroke="var(--primary)"
                  isAnimationActive={false}
                />
              )}
              <Brush dataKey="label" height={18} stroke="var(--border)" travellerWidth={8} />
            </ComposedChart>
          </ResponsiveContainer>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t px-3 py-1.5 text-[10px] text-muted-foreground">
        <span className="flex items-center gap-1">
          <CandlestickChart className="size-3.5 text-primary/70" />
          Provider: <span className="num text-foreground">{q.data?.provider ?? "—"}</span>
        </span>
        <span>
          Interval: <span className="num text-foreground">{selected.interval}</span>
          {q.data?.aggregated ? (
            <span
              className="ml-1 rounded-sm border border-border px-1"
              title={`Aggregated from native ${q.data.sourceInterval} bars on the server`}
            >
              aggregated from {q.data.sourceInterval}
            </span>
          ) : null}
        </span>
        <span className="num">{coverage.summary}</span>
        {fetchedAge !== null && <span>Fetched {fetchedAge} · refreshes every 30s</span>}
        {q.isFetching && !q.isLoading ? <span className="text-foreground">refreshing…</span> : null}
      </div>
    </div>
  );
}

function Placeholder({
  icon,
  title,
  detail,
  action,
}: {
  icon?: boolean;
  title: string;
  detail: string;
  action?: { label: string; onClick: () => void };
}) {
  return (
    <div className="absolute inset-0 grid place-items-center">
      <div className="flex max-w-md flex-col items-center gap-2 text-center">
        {icon ? <CandlestickChart className="size-8 text-primary/70" /> : null}
        <p className="text-xs font-semibold">{title}</p>
        <p className="text-[11px] leading-snug text-muted-foreground">{detail}</p>
        {action ? (
          <button
            type="button"
            onClick={action.onClick}
            className="h-7 rounded-sm border px-3 text-[11px] hover:border-primary"
          >
            {action.label}
          </button>
        ) : null}
      </div>
    </div>
  );
}
