import { useEffect, useRef, useState } from "react";
import { CartesianGrid, Line, LineChart, Tooltip, XAxis, YAxis } from "recharts";
import { CATEGORY_LABELS } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { AuditCategory, Severity } from "@/lib/types";

/**
 * Measures the container instead of relying on ResponsiveContainer, whose first
 * measurement inside a CSS grid can be stale and clip the series.
 */
function useMeasuredWidth<T extends HTMLElement>() {
  const ref = useRef<T | null>(null);
  const [width, setWidth] = useState(0);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const observer = new ResizeObserver((entries) => {
      const next = Math.floor(entries[0]?.contentRect.width ?? 0);
      setWidth((previous) => (Math.abs(previous - next) > 1 ? next : previous));
    });
    observer.observe(element);
    setWidth(Math.floor(element.getBoundingClientRect().width));
    return () => observer.disconnect();
  }, []);

  return { ref, width };
}

export function ScoreTrendChart({
  data,
  height = 190,
}: {
  data: Array<{ date: string; score: number; auditName: string }>;
  height?: number;
}) {
  const { ref, width } = useMeasuredWidth<HTMLDivElement>();

  if (data.length === 0) {
    return (
      <div className="flex h-[190px] items-center justify-center text-[13px] text-muted-foreground">
        No completed audits yet — the trend appears after the first result.
      </div>
    );
  }

  const points = data.map((entry, index) => ({
    ...entry,
    key: String(index),
    label: new Date(entry.date).toLocaleDateString("en-GB", { day: "2-digit", month: "short" }),
  }));

  const tickValues =
    points.length <= 6 ? points.map((point) => point.key) : [points[0].key, points[points.length - 1].key];

  return (
    <div ref={ref} style={{ height }} className="w-full min-w-0">
      {width > 0 && (
        <LineChart width={width} height={height} data={points} margin={{ top: 8, right: 26, bottom: 0, left: 0 }}>
          <CartesianGrid stroke="hsl(var(--border))" strokeDasharray="2 4" vertical={false} />
          <XAxis
            dataKey="key"
            ticks={tickValues}
            tickFormatter={(value: string) => points.find((point) => point.key === value)?.label ?? ""}
            tick={{ fontSize: 10.5, fill: "hsl(var(--muted-foreground))" }}
            tickLine={false}
            axisLine={false}
            height={22}
            interval={0}
          />
          <YAxis
            domain={[0, 100]}
            ticks={[0, 25, 50, 75, 100]}
            tick={{ fontSize: 10.5, fill: "hsl(var(--muted-foreground))" }}
            tickLine={false}
            axisLine={false}
            width={32}
          />
          <Tooltip
            contentStyle={{
              background: "hsl(var(--popover))",
              border: "1px solid hsl(var(--popover-border))",
              borderRadius: 10,
              fontSize: 12,
              boxShadow: "var(--shadow-md)",
            }}
            labelStyle={{ color: "hsl(var(--muted-foreground))", fontSize: 11 }}
            labelFormatter={(value: string) => points.find((point) => point.key === value)?.auditName ?? ""}
            formatter={(value: number) => [`${value}/100`, "Score"]}
          />
          <Line
            type="monotone"
            dataKey="score"
            stroke="hsl(var(--chart-1))"
            strokeWidth={2}
            dot={{ r: 3, strokeWidth: 2, fill: "hsl(var(--card))" }}
            activeDot={{ r: 4 }}
            isAnimationActive={false}
          />
        </LineChart>
      )}
    </div>
  );
}

export function CategoryScoreBars({
  scores,
  showWeight = false,
  compact = false,
}: {
  scores: Array<{ category: AuditCategory; score: number | null; weight?: number }>;
  showWeight?: boolean;
  compact?: boolean;
}) {
  return (
    <div className={cn("space-y-3", compact && "space-y-2")}>
      {scores.map((entry) => {
        const value = entry.score;
        const width = value === null ? 0 : Math.max(2, value);
        const color =
          value === null
            ? "hsl(var(--border))"
            : value >= 78
              ? "hsl(var(--score-strong))"
              : value >= 62
                ? "hsl(var(--score-fair))"
                : "hsl(var(--score-weak))";

        return (
          <div key={entry.category} className="grid grid-cols-[1fr_auto] items-center gap-x-3">
            <div className="text-[12.5px] text-muted-foreground">{CATEGORY_LABELS[entry.category]}</div>
            <div className="tnum text-[12.5px] font-semibold" style={{ color }}>
              {value === null ? "n/e" : value}
            </div>
            <div className={cn("col-span-2 mt-1 h-1.5 w-full overflow-hidden rounded-full bg-muted", compact && "mt-0.5")}>
              <div
                className="h-full rounded-full transition-[width] duration-700 ease-out"
                style={{ width: `${width}%`, background: color }}
              />
            </div>
            {showWeight && entry.weight !== undefined && (
              <div className="col-span-2 text-[10.5px] text-muted-foreground">
                {Math.round((entry.weight ?? 0) * 100)}% of overall score
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

const SEVERITY_FILL: Record<Severity, string> = {
  critical: "hsl(var(--critical))",
  high: "hsl(var(--high))",
  medium: "hsl(var(--medium))",
  low: "hsl(var(--low))",
  informational: "hsl(var(--informational))",
};

export function SeverityBar({ counts }: { counts: Record<string, number> }) {
  const order: Severity[] = ["critical", "high", "medium", "low", "informational"];
  const total = order.reduce((sum, key) => sum + (counts[key] ?? 0), 0);

  if (total === 0) {
    return <div className="text-[13px] text-muted-foreground">No findings recorded.</div>;
  }

  return (
    <div>
      <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-muted">
        {order.map((key) => {
          const count = counts[key] ?? 0;
          if (count === 0) return null;
          return (
            <div
              key={key}
              style={{ width: `${(count / total) * 100}%`, background: SEVERITY_FILL[key] }}
              title={`${key}: ${count}`}
            />
          );
        })}
      </div>
      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5">
        {order.map((key) =>
          (counts[key] ?? 0) > 0 ? (
            <div key={key} className="flex items-center gap-1.5 text-[11.5px] text-muted-foreground">
              <span className="h-1.5 w-1.5 rounded-full" style={{ background: SEVERITY_FILL[key] }} />
              <span className="capitalize">{key}</span>
              <span className="tnum font-semibold text-foreground">{counts[key]}</span>
            </div>
          ) : null,
        )}
      </div>
    </div>
  );
}
