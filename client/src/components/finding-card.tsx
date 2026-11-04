import { useState } from "react";
import { Check, ChevronDown, Copy, ExternalLink, ShieldAlert } from "lucide-react";
import { cn } from "@/lib/utils";
import { CATEGORY_LABELS, SEVERITY_LABELS, relativeTime } from "@/lib/format";
import type { Finding } from "@/lib/types";
import { SeverityBadge } from "@/components/ui-bits";
import { useUpdateFinding } from "@/hooks/useApi";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const STATUS_OPTIONS = [
  { value: "open", label: "Open" },
  { value: "in-review", label: "In review" },
  { value: "resolved", label: "Resolved" },
  { value: "wont-fix", label: "Won't fix" },
];

export function FindingCard({
  finding,
  defaultOpen = false,
  readOnly = false,
  onNavigateProject,
}: {
  finding: Finding;
  defaultOpen?: boolean;
  readOnly?: boolean;
  onNavigateProject?: () => void;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const [copied, setCopied] = useState(false);
  const updateFinding = useUpdateFinding();

  const copyImplementation = async () => {
    if (!finding.implementation) return;
    await navigator.clipboard.writeText(finding.implementation);
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  };

  return (
    <article className={cn("surface overflow-hidden", open && "shadow-sm")}>
      <div className="flex items-start gap-3 p-4">
        <button
          className="mt-0.5 flex-1 text-left"
          onClick={() => setOpen((value) => !value)}
          aria-expanded={open}
        >
          <div className="flex flex-wrap items-center gap-1.5">
            <SeverityBadge severity={finding.severity} />
            <span className="rounded-full border px-2 py-0.5 text-[11px] text-muted-foreground">
              {CATEGORY_LABELS[finding.category] ?? finding.category}
            </span>
            {finding.wcagCriterion && (
              <span className="rounded-full border px-2 py-0.5 text-[11px] text-muted-foreground">
                {finding.wcagCriterion}
              </span>
            )}
            {finding.status !== "open" && (
              <span
                className={cn(
                  "rounded-full px-2 py-0.5 text-[11px] font-medium",
                  finding.status === "resolved" ? "bg-tone-strong" : "bg-muted text-muted-foreground",
                )}
              >
                {finding.status === "resolved" ? "Resolved" : finding.status === "in-review" ? "In review" : "Won't fix"}
              </span>
            )}
          </div>
          <h3 className="mt-2 text-[14px] font-semibold leading-snug tracking-[-0.01em]">{finding.title}</h3>
          <p className="mt-1 line-clamp-2 text-[13px] leading-relaxed text-muted-foreground">{finding.description}</p>
          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11.5px] text-muted-foreground">
            {finding.affectedCount ? <span>{finding.affectedCount} affected elements</span> : null}
            <span>{relativeTime(finding.createdAt)}</span>
            {finding.projectName && <span>· {finding.projectName}</span>}
          </div>
        </button>

        <div className="flex shrink-0 items-center gap-2">
          {!readOnly && (
            <Select
              value={finding.status}
              onValueChange={(value) => updateFinding.mutate({ id: finding.id, status: value })}
            >
              <SelectTrigger className="h-8 w-[112px] text-[12px]" aria-label="Finding status">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {STATUS_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value} className="text-[12.5px]">
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <button
            onClick={() => setOpen((value) => !value)}
            className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted"
            aria-label={open ? "Collapse finding" : "Expand finding"}
          >
            <ChevronDown className={cn("h-4 w-4 transition-transform", open && "rotate-180")} />
          </button>
        </div>
      </div>

      {open && (
        <div className="animate-in-soft border-t bg-muted/30 px-4 py-4">
          <div className="grid gap-4 lg:grid-cols-2">
            <div className="space-y-3">
              {finding.evidence && (
                <div>
                  <div className="label-caps mb-1">Evidence</div>
                  <p className="rounded-md border border-dashed bg-background px-3 py-2 font-mono text-[11.5px] leading-relaxed text-foreground">
                    {finding.evidence}
                  </p>
                </div>
              )}
              {finding.whyItMatters && (
                <div>
                  <div className="label-caps mb-1">Why it matters</div>
                  <p className="text-[13px] leading-relaxed text-muted-foreground">{finding.whyItMatters}</p>
                </div>
              )}
            </div>
            <div className="space-y-3">
              {finding.recommendation && (
                <div>
                  <div className="label-caps mb-1">Recommendation</div>
                  <p className="text-[13px] leading-relaxed text-muted-foreground">{finding.recommendation}</p>
                </div>
              )}
              {finding.implementation && (
                <div>
                  <div className="mb-1 flex items-center justify-between">
                    <div className="label-caps">Suggested implementation</div>
                    <button
                      onClick={copyImplementation}
                      className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground"
                    >
                      {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                      {copied ? "Copied" : "Copy"}
                    </button>
                  </div>
                  <pre className="overflow-x-auto rounded-md bg-foreground px-3 py-2.5 text-[11.5px] leading-relaxed text-background">
                    <code>{finding.implementation}</code>
                  </pre>
                </div>
              )}
            </div>
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 border-t pt-3 text-[11.5px] text-muted-foreground">
            <span className="inline-flex items-center gap-1">
              <ShieldAlert className="h-3.5 w-3.5" />
              {finding.detection === "automated" ? "Automated detection" : "Manual review"} · {SEVERITY_LABELS[finding.severity]}
            </span>
            {finding.pageUrl && (
              <a
                href={finding.pageUrl}
                target="_blank"
                rel="noreferrer noopener"
                className="inline-flex items-center gap-1 hover:text-foreground"
              >
                <ExternalLink className="h-3 w-3" />
                {finding.pageUrl}
              </a>
            )}
            {onNavigateProject && (
              <button onClick={onNavigateProject} className="hover:text-foreground">
                View project
              </button>
            )}
          </div>
        </div>
      )}
    </article>
  );
}
