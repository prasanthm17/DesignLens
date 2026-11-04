import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { SEVERITY_LABELS, gradeFor, signed, statusLabel, toneBgClass, toneClass } from "@/lib/format";
import type { Severity } from "@/lib/types";
import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";

/* ------------------------------- score ring ------------------------------- */

export function ScoreRing({
  score,
  size = 132,
  stroke = 9,
  label,
  showGrade = true,
}: {
  score: number | null;
  size?: number;
  stroke?: number;
  label?: string;
  showGrade?: boolean;
}) {
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const progress = score === null ? 0 : Math.max(0, Math.min(100, score)) / 100;
  const color =
    score === null
      ? "hsl(var(--muted-foreground))"
      : score >= 78
        ? "hsl(var(--score-strong))"
        : score >= 62
          ? "hsl(var(--score-fair))"
          : "hsl(var(--score-weak))";

  return (
    <div className="flex flex-col items-center">
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size} className="-rotate-90" aria-hidden="true">
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke="hsl(var(--border))"
            strokeWidth={stroke}
          />
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke={color}
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={circumference - progress * circumference}
            style={{ transition: "stroke-dashoffset 700ms cubic-bezier(0.22,1,0.36,1)" }}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="tnum font-semibold leading-none tracking-[-0.03em]" style={{ color, fontSize: size * 0.3 }}>
            {score === null ? "—" : score}
          </span>
          <span className="mt-1 text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
            {score === null ? "not scored" : "of 100"}
          </span>
        </div>
      </div>
      {showGrade && <div className="mt-2 text-xs font-medium text-muted-foreground">{label ?? gradeFor(score)}</div>}
    </div>
  );
}

/* --------------------------------- badges --------------------------------- */

export function ScorePill({ score }: { score: number | null }) {
  return (
    <span
      className={cn(
        "tnum inline-flex min-w-[42px] items-center justify-center rounded-md px-2 py-1 text-sm font-semibold",
        toneBgClass(score),
      )}
    >
      {score === null ? "—" : score}
    </span>
  );
}

export function SeverityBadge({ severity, className }: { severity: Severity; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold capitalize",
        `sev-${severity}`,
        className,
      )}
    >
      {SEVERITY_LABELS[severity] ?? severity}
    </span>
  );
}

export function StatusPill({ status, className }: { status: string; className?: string }) {
  const tone =
    status === "resolved" || status === "completed"
      ? "border-transparent bg-tone-strong"
      : status === "failed"
        ? "border-transparent bg-tone-weak"
        : status === "running"
          ? "border-transparent bg-accent text-accent-foreground"
          : "border-transparent bg-muted text-muted-foreground";

  return (
    <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold", tone, className)}>
      {statusLabel(status)}
    </span>
  );
}

export function DeltaPill({ delta, suffix = "" }: { delta: number | null | undefined; suffix?: string }) {
  if (delta === null || delta === undefined || Number.isNaN(delta)) {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
        <Minus className="h-3 w-3" /> no baseline
      </span>
    );
  }
  const Icon = delta > 0 ? ArrowUpRight : delta < 0 ? ArrowDownRight : Minus;
  return (
    <span className={cn("tnum inline-flex items-center gap-0.5 text-xs font-semibold", toneClass(delta))}>
      <Icon className="h-3.5 w-3.5" />
      {signed(delta)}
      {suffix}
    </span>
  );
}

/* --------------------------------- layout --------------------------------- */

export function StatTile({
  label,
  value,
  hint,
  tone,
  icon,
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  tone?: "default" | "critical";
  icon?: ReactNode;
}) {
  return (
    <div className="surface p-4">
      <div className="flex items-start justify-between gap-2">
        <span className="label-caps">{label}</span>
        {icon && <span className="text-muted-foreground">{icon}</span>}
      </div>
      <div
        className={cn(
          "tnum mt-2 text-[26px] font-semibold leading-none tracking-[-0.03em]",
          tone === "critical" && "tone-weak",
        )}
      >
        {value}
      </div>
      {hint && <div className="mt-2 text-xs text-muted-foreground">{hint}</div>}
    </div>
  );
}

export function SectionHeader({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h2 className="text-[15px] font-semibold tracking-[-0.01em]">{title}</h2>
        {description && <p className="mt-1 max-w-2xl text-[13px] text-muted-foreground">{description}</p>}
      </div>
      {action}
    </div>
  );
}

export function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="surface flex flex-col items-center justify-center px-6 py-14 text-center">
      {icon && <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-xl bg-muted text-muted-foreground">{icon}</div>}
      <h3 className="text-sm font-semibold">{title}</h3>
      {description && <p className="mt-1.5 max-w-md text-[13px] leading-relaxed text-muted-foreground">{description}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function SampleDataNote() {
  return (
    <div className="flex items-start gap-2 rounded-lg border border-dashed px-3 py-2 text-[12px] text-muted-foreground">
      <span className="mt-[3px] inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-muted-foreground/60" />
      <span>
        <strong className="font-semibold text-foreground">Sample dataset.</strong> These audits are authored examples for
        demonstration — not live captures. Run a new audit to measure a real page.
      </span>
    </div>
  );
}
