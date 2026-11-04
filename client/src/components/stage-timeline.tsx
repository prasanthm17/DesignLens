import { Check, CircleDashed, Loader2, MinusCircle, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatDuration } from "@/lib/format";
import type { AuditStage } from "@/lib/types";

const STATUS_ICON = {
  done: <Check className="h-3.5 w-3.5" />,
  running: <Loader2 className="h-3.5 w-3.5 animate-spin" />,
  failed: <XCircle className="h-3.5 w-3.5" />,
  skipped: <MinusCircle className="h-3.5 w-3.5" />,
  pending: <CircleDashed className="h-3.5 w-3.5" />,
};

export function StageTimeline({ stages, compact = false }: { stages: AuditStage[]; compact?: boolean }) {
  if (stages.length === 0) {
    return <p className="text-[13px] text-muted-foreground">Waiting for the first stage to start…</p>;
  }

  return (
    <ol className="relative space-y-0">
      {stages.map((stage, index) => {
        const isLast = index === stages.length - 1;
        const tone =
          stage.status === "done"
            ? "bg-tone-strong"
            : stage.status === "running"
              ? "bg-accent text-accent-foreground"
              : stage.status === "failed"
                ? "bg-tone-weak"
                : "bg-muted text-muted-foreground";

        return (
          <li key={stage.key} className="relative flex gap-3 pb-4 last:pb-0">
            {!isLast && <span className="absolute left-[11px] top-6 h-full w-px bg-border" aria-hidden="true" />}
            <span className={cn("z-10 mt-0.5 flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-full", tone)}>
              {STATUS_ICON[stage.status]}
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <span
                  className={cn(
                    "text-[13px]",
                    stage.status === "pending" || stage.status === "skipped"
                      ? "text-muted-foreground"
                      : "font-medium text-foreground",
                  )}
                >
                  {stage.label}
                </span>
                {stage.durationMs != null && stage.durationMs > 0 && (
                  <span className="tnum text-[11px] text-muted-foreground">{formatDuration(stage.durationMs)}</span>
                )}
              </div>
              {!compact && stage.detail && (
                <p className="mt-0.5 break-words text-[11.5px] leading-relaxed text-muted-foreground">{stage.detail}</p>
              )}
              {stage.status === "skipped" && !stage.detail && (
                <p className="mt-0.5 text-[11.5px] text-muted-foreground">Not in this audit's scope</p>
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
