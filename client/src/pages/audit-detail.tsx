import { useMemo, useState } from "react";
import { Link, useParams } from "wouter";
import {
  ArrowLeft,
  Download,
  ExternalLink,
  FileJson,
  FileText,
  Loader2,
  RotateCcw,
  XCircle,
} from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { CategoryScoreBars, SeverityBar } from "@/components/charts";
import { FindingCard } from "@/components/finding-card";
import { StageTimeline } from "@/components/stage-timeline";
import {
  DeltaPill,
  SampleDataNote,
  ScoreRing,
  SectionHeader,
  SeverityBadge,
  StatTile,
  StatusPill,
} from "@/components/ui-bits";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAudit, useAuditStatus, useMe, useRerunAudit } from "@/hooks/useApi";
import { CATEGORY_LABELS, SEVERITY_ORDER, formatDate, formatDuration, hostFromUrl, signed, toneClass } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { AuditCategory, Severity } from "@/lib/types";

type Tab = "overview" | "findings" | "checks" | "evidence";

export default function AuditDetailPage() {
  const params = useParams<{ id: string }>();
  const { data, isLoading } = useAudit(params.id);
  const { data: me } = useMe();
  const isDemo = me?.mode === "demo";
  const [tab, setTab] = useState<Tab>("overview");
  const [severityFilter, setSeverityFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");

  const inFlight = data?.audit.status === "running" || data?.audit.status === "queued";
  const statusQuery = useAuditStatus(params.id, inFlight);
  const rerun = useRerunAudit(params.id);

  const liveStages = statusQuery.data?.stages ?? data?.stages ?? [];
  const liveStatus = statusQuery.data?.status ?? data?.audit.status;

  const findings = useMemo(() => {
    return (data?.findings ?? [])
      .filter((finding) => (severityFilter === "all" ? true : finding.severity === severityFilter))
      .filter((finding) => (statusFilter === "all" ? true : finding.status === statusFilter))
      .filter((finding) => (categoryFilter === "all" ? true : finding.category === categoryFilter))
      .sort((a, b) => SEVERITY_ORDER.indexOf(a.severity) - SEVERITY_ORDER.indexOf(b.severity));
  }, [data?.findings, severityFilter, statusFilter, categoryFilter]);

  if (isLoading || !data) {
    return (
      <AppShell>
        <Skeleton className="mb-6 h-16 w-2/3" />
        <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
          <Skeleton className="h-[260px]" />
          <Skeleton className="h-[260px]" />
        </div>
        <Skeleton className="mt-4 h-[300px]" />
      </AppShell>
    );
  }

  const { audit, project, categoryScores, metrics, comparison, scope, context, grade } = data;
  const scoreEntries = scope
    .map((category) => categoryScores[category])
    .filter(Boolean)
    .map((entry) => ({ category: entry.category, score: entry.score }));

  const severityCounts = (data.findings ?? []).reduce<Record<string, number>>((acc, finding) => {
    acc[finding.severity] = (acc[finding.severity] ?? 0) + 1;
    return acc;
  }, {});
  const openCount = (data.findings ?? []).filter((f) => f.status === "open" || f.status === "in-review").length;
  const resolvedCount = (data.findings ?? []).filter((f) => f.status === "resolved").length;

  const perf = metrics.performance as
    | { loadEventMs?: number | null; domContentLoadedMs?: number | null; requestCount?: number; transferKb?: number | null }
    | undefined;
  const axe = metrics.axe as { violations?: number; nodes?: number; rules?: Array<{ id: string; help: string; impact: string | null; nodes: number; wcag: string[] }> } | undefined;
  const responsive = metrics.responsive as Array<{ preset: string; width: number; overflow: boolean; overflowPx: number }> | undefined;
  const readability = metrics.readability as { fleschReadingEase?: number | null; words?: number; averageSentenceLength?: number } | undefined;
  const typography = metrics.typography as { families?: Array<{ value: string; count: number }>; sizes?: Array<{ value: string; count: number }> } | undefined;
  const palette = metrics.palette as { text?: Array<{ value: string; count: number }>; radius?: Array<{ value: string; count: number }> } | undefined;

  const allChecks = scope.flatMap((category) => categoryScores[category]?.checks ?? []);
  const manualChecks = allChecks.filter((check) => check.detection === "manual");
  const weakest = [...scoreEntries].filter((entry) => entry.score !== null).sort((a, b) => (a.score ?? 0) - (b.score ?? 0))[0];

  const priorities = [
    {
      label: "Now",
      items: (data.findings ?? []).filter((f) => f.severity === "critical" || f.severity === "high").slice(0, 4),
    },
    { label: "Next", items: (data.findings ?? []).filter((f) => f.severity === "medium").slice(0, 4) },
    {
      label: "Later",
      items: (data.findings ?? []).filter((f) => f.severity === "low" || f.severity === "informational").slice(0, 4),
    },
  ].filter((group) => group.items.length > 0);

  return (
    <AppShell>
      <Link href={`/projects/${project.id}`} className="mb-4 inline-flex items-center gap-1.5 text-[12.5px] text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-3.5 w-3.5" />
        {project.name}
      </Link>

      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="mb-1.5 flex flex-wrap items-center gap-2">
            <span className="label-caps">Audit</span>
            <StatusPill status={liveStatus ?? audit.status} />
            {audit.isSample && (
              <span className="rounded-full border px-1.5 py-0.5 text-[10px] uppercase tracking-[0.06em] text-muted-foreground">
                sample data
              </span>
            )}
          </div>
          <h1 className="text-[22px] font-semibold leading-tight tracking-[-0.025em] sm:text-[24px]">{audit.name}</h1>
          <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px] text-muted-foreground">
            <a
              href={audit.targetUrl}
              target="_blank"
              rel="noreferrer noopener"
              className="inline-flex items-center gap-1 hover:text-foreground"
            >
              <ExternalLink className="h-3 w-3" />
              {hostFromUrl(audit.targetUrl)}
            </a>
            <span>{formatDate(audit.completedAt ?? audit.createdAt, true)}</span>
            {audit.durationMs ? <span>{formatDuration(audit.durationMs)}</span> : null}
            <span>{scope.length} categories</span>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {!isDemo && (
            <Button variant="outline" className="h-9" onClick={() => rerun.mutate()} disabled={inFlight || rerun.isPending}>
              {rerun.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />}
              Re-run
            </Button>
          )}
          {audit.status === "completed" && (
            <>
              <Button variant="outline" className="h-9" asChild>
                <a href={`/audits/${audit.id}/report`}>View report</a>
              </Button>
              <Button className="h-9" asChild>
                <a href={`/api/audits/${audit.id}/report.pdf`}>
                  <Download className="h-4 w-4" />
                  PDF
                </a>
              </Button>
            </>
          )}
        </div>
      </div>

      {liveStatus === "failed" && (
        <div className="surface mb-4 border-[hsl(var(--score-weak))]/40 p-4">
          <div className="flex items-start gap-3">
            <XCircle className="mt-0.5 h-4 w-4 text-[hsl(var(--score-weak))]" />
            <div>
              <div className="text-[13px] font-semibold">This audit did not complete</div>
              <p className="mt-1 text-[12.5px] leading-relaxed text-muted-foreground">{audit.error}</p>
              <p className="mt-2 text-[11.5px] text-muted-foreground">
                Common causes: the target blocks headless browsers, requires authentication, or timed out. Re-run after
                checking the URL is publicly reachable.
              </p>
            </div>
          </div>
        </div>
      )}

      {inFlight && (
        <div className="surface mb-4 p-5">
          <div className="mb-4 flex items-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            <span className="text-[13px] font-medium">Audit in progress</span>
            <span className="text-[11.5px] text-muted-foreground">
              {liveStages.filter((stage) => stage.status === "done").length} of {liveStages.length || 10} stages complete
            </span>
          </div>
          <StageTimeline stages={liveStages} />
        </div>
      )}

      {audit.status === "completed" && (
        <>
          <div className="grid gap-4 lg:grid-cols-[300px_1fr]">
            <section className="surface flex flex-col items-center justify-center p-6">
              <ScoreRing score={audit.overallScore} size={148} showGrade={false} />
              <div className="mt-3 text-center">
                <div className="text-[13px] font-medium">{grade}</div>
                {comparison?.delta !== undefined && comparison?.delta !== null && (
                  <div className="mt-1 flex items-center justify-center gap-1.5 text-[11.5px] text-muted-foreground">
                    <DeltaPill delta={comparison.delta} /> vs {comparison.previousAuditName ?? "previous audit"}
                  </div>
                )}
              </div>
              <div className="mt-5 grid w-full grid-cols-3 gap-2 border-t pt-4 text-center">
                <div>
                  <div className="tnum text-[15px] font-semibold">{data.findings.length}</div>
                  <div className="text-[10.5px] uppercase tracking-[0.06em] text-muted-foreground">Findings</div>
                </div>
                <div>
                  <div className="tnum text-[15px] font-semibold">{openCount}</div>
                  <div className="text-[10.5px] uppercase tracking-[0.06em] text-muted-foreground">Open</div>
                </div>
                <div>
                  <div className="tnum text-[15px] font-semibold">{resolvedCount}</div>
                  <div className="text-[10.5px] uppercase tracking-[0.06em] text-muted-foreground">Resolved</div>
                </div>
              </div>
            </section>

            <section className="surface p-5">
              <SectionHeader
                title="Category scores"
                description="Each score is the weighted pass rate of the checks that ran in that category."
              />
              <CategoryScoreBars
                scores={scoreEntries.map((entry) => ({
                  ...entry,
                  weight: categoryScores[entry.category] ? undefined : undefined,
                }))}
              />
              <div className="mt-4 grid grid-cols-2 gap-3 border-t pt-4 sm:grid-cols-4">
                <div>
                  <div className="label-caps">Evaluated</div>
                  <div className="tnum mt-0.5 text-[15px] font-semibold">
                    {scoreEntries.filter((entry) => entry.score !== null).length}/{scope.length}
                  </div>
                </div>
                <div>
                  <div className="label-caps">Checks run</div>
                  <div className="tnum mt-0.5 text-[15px] font-semibold">{allChecks.filter((c) => c.detection === "automated").length}</div>
                </div>
                <div>
                  <div className="label-caps">Manual prompts</div>
                  <div className="tnum mt-0.5 text-[15px] font-semibold">{manualChecks.length}</div>
                </div>
                <div>
                  <div className="label-caps">Weakest</div>
                  <div className="mt-0.5 truncate text-[13px] font-semibold">
                    {weakest ? CATEGORY_LABELS[weakest.category] : "—"}
                  </div>
                </div>
              </div>
            </section>
          </div>

          <div className="mt-4 flex gap-1 overflow-x-auto border-b">
            {(
              [
                { key: "overview", label: "Overview" },
                { key: "findings", label: `Findings (${data.findings.length})` },
                { key: "checks", label: "Checks & methodology" },
                { key: "evidence", label: "Evidence" },
              ] as const
            ).map((item) => (
              <button
                key={item.key}
                onClick={() => setTab(item.key as Tab)}
                className={cn(
                  "-mb-px whitespace-nowrap border-b-2 px-3 py-2 text-[12.5px] transition-colors",
                  tab === item.key
                    ? "border-foreground font-medium text-foreground"
                    : "border-transparent text-muted-foreground hover:text-foreground",
                )}
              >
                {item.label}
              </button>
            ))}
          </div>

          <div className="mt-4">
            {tab === "overview" && (
              <div className="grid gap-4 lg:grid-cols-[1.5fr_1fr]">
                <div className="space-y-4">
                  <section className="surface p-5">
                    <SectionHeader title="What the measurements show" />
                    <div className="space-y-2.5 text-[13px] leading-relaxed text-muted-foreground">
                      {audit.overallScore !== null && (
                        <p>
                          The page scores <strong className={toneClass(audit.overallScore)}>{audit.overallScore}/100</strong>{" "}
                          ({grade.toLowerCase()}) across {scoreEntries.filter((entry) => entry.score !== null).length}{" "}
                          evaluated {scoreEntries.length === 1 ? "category" : "categories"}. {data.findings.length} findings
                          were recorded, of which {(severityCounts.critical ?? 0) + (severityCounts.high ?? 0)} are critical or
                          high severity.
                        </p>
                      )}
                      {weakest && (
                        <p>
                          {CATEGORY_LABELS[weakest.category]} is the weakest dimension at{" "}
                          <strong className={toneClass(weakest.score)}>{weakest.score}</strong>, which is where remediation
                          effort returns the most.
                        </p>
                      )}
                      {axe?.violations !== undefined && axe.violations > 0 && (
                        <p>
                          axe-core reported {axe.violations} rule violations affecting {axe.nodes ?? 0} elements. Automated
                          rules cover roughly a third of WCAG success criteria — the manual prompts below cover the rest.
                        </p>
                      )}
                      {perf?.loadEventMs != null && (
                        <p>
                          The page loaded in {perf.loadEventMs}ms with {perf.requestCount ?? 0}{" "}
                          {(perf.requestCount ?? 0) === 1 ? "request" : "requests"}
                          {perf.transferKb ? ` and ${Math.round(perf.transferKb)} KB transferred` : ""}.
                        </p>
                      )}
                      {data.findings.length === 0 && (
                        <p>No automated checks failed in the categories that ran. Review the manual prompts in Checks below.</p>
                      )}
                    </div>
                  </section>

                  <section className="surface p-5">
                    <SectionHeader title="Suggested priorities" description="Derived from finding severity." />
                    {priorities.length === 0 ? (
                      <p className="text-[13px] text-muted-foreground">No prioritised actions — no findings were raised.</p>
                    ) : (
                      <div className="grid gap-3 sm:grid-cols-3">
                        {priorities.map((group) => (
                          <div key={group.label}>
                            <div className="label-caps mb-1.5">{group.label}</div>
                            <ul className="space-y-1.5">
                              {group.items.map((finding) => (
                                <li key={finding.id} className="text-[12px] leading-snug text-muted-foreground">
                                  {finding.title}
                                </li>
                              ))}
                            </ul>
                          </div>
                        ))}
                      </div>
                    )}
                  </section>

                  {comparison?.categories && comparison.categories.length > 0 && (
                    <section className="surface p-5">
                      <SectionHeader
                        title="Compared with the previous audit"
                        description={`${comparison.previousAuditName ?? "Previous audit"} · previous overall ${comparison.previousScore ?? "—"}`}
                      />
                      <table className="w-full text-[12.5px]">
                        <thead>
                          <tr className="text-left text-[10.5px] uppercase tracking-[0.06em] text-muted-foreground">
                            <th className="pb-2 font-medium">Category</th>
                            <th className="pb-2 text-right font-medium">Previous</th>
                            <th className="pb-2 text-right font-medium">Current</th>
                            <th className="pb-2 text-right font-medium">Change</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y">
                          {comparison.categories.map((entry) => (
                            <tr key={entry.category}>
                              <td className="py-1.5">{CATEGORY_LABELS[entry.category]}</td>
                              <td className="tnum py-1.5 text-right text-muted-foreground">{entry.previous ?? "—"}</td>
                              <td className="tnum py-1.5 text-right font-medium">{entry.current ?? "—"}</td>
                              <td className={cn("tnum py-1.5 text-right font-semibold", toneClass(entry.delta))}>
                                {signed(entry.delta)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </section>
                  )}
                </div>

                <div className="space-y-4">
                  <section className="surface p-5">
                    <SectionHeader title="Findings by severity" />
                    <SeverityBar counts={severityCounts} />
                  </section>

                  <section className="surface p-5">
                    <SectionHeader title="Audit brief" />
                    <div className="space-y-2.5 text-[12.5px]">
                      <div>
                        <div className="label-caps mb-0.5">Target audience</div>
                        <p className="text-muted-foreground">{context.targetAudience || project.targetAudience || "Not specified"}</p>
                      </div>
                      <div>
                        <div className="label-caps mb-0.5">Objectives</div>
                        {context.objectives && context.objectives.length ? (
                          <ul className="list-inside list-disc text-muted-foreground">
                            {context.objectives.map((objective) => (
                              <li key={objective}>{objective}</li>
                            ))}
                          </ul>
                        ) : (
                          <p className="text-muted-foreground">None recorded</p>
                        )}
                      </div>
                      <div>
                        <div className="label-caps mb-0.5">Viewport coverage</div>
                        <p className="capitalize text-muted-foreground">
                          {context.viewport === "all" ? "Desktop, tablet and mobile" : (context.viewport ?? "—")}
                        </p>
                      </div>
                    </div>
                  </section>

                  {audit.screenshotUrl && (
                    <section className="surface overflow-hidden">
                      <div className="border-b px-4 py-3">
                        <div className="text-[12.5px] font-medium">Captured page</div>
                        <div className="text-[11px] text-muted-foreground">1440×900 viewport at audit time</div>
                      </div>
                      <img src={audit.screenshotUrl} alt={`Screenshot of ${audit.targetUrl}`} className="w-full" />
                    </section>
                  )}
                </div>
              </div>
            )}

            {tab === "findings" && (
              <div>
                <div className="mb-3 flex flex-wrap items-center gap-2">
                  <Select value={severityFilter} onValueChange={setSeverityFilter}>
                    <SelectTrigger className="h-8 w-[136px] text-[12px]">
                      <SelectValue placeholder="Severity" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all" className="text-[12.5px]">All severities</SelectItem>
                      {SEVERITY_ORDER.map((severity) => (
                        <SelectItem key={severity} value={severity} className="text-[12.5px] capitalize">
                          {severity}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Select value={statusFilter} onValueChange={setStatusFilter}>
                    <SelectTrigger className="h-8 w-[136px] text-[12px]">
                      <SelectValue placeholder="Status" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all" className="text-[12.5px]">All statuses</SelectItem>
                      <SelectItem value="open" className="text-[12.5px]">Open</SelectItem>
                      <SelectItem value="in-review" className="text-[12.5px]">In review</SelectItem>
                      <SelectItem value="resolved" className="text-[12.5px]">Resolved</SelectItem>
                      <SelectItem value="wont-fix" className="text-[12.5px]">Won't fix</SelectItem>
                    </SelectContent>
                  </Select>
                  <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                    <SelectTrigger className="h-8 w-[170px] text-[12px]">
                      <SelectValue placeholder="Category" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all" className="text-[12.5px]">All categories</SelectItem>
                      {scope.map((category) => (
                        <SelectItem key={category} value={category} className="text-[12.5px]">
                          {CATEGORY_LABELS[category]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <span className="ml-auto text-[11.5px] text-muted-foreground">
                    {findings.length} of {data.findings.length} findings
                  </span>
                </div>

                {data.findings.length === 0 ? (
                  <div className="surface px-5 py-10 text-center text-[13px] text-muted-foreground">
                    No findings were raised by the checks that ran. Manual review is still recommended.
                  </div>
                ) : findings.length === 0 ? (
                  <div className="surface px-5 py-10 text-center text-[13px] text-muted-foreground">
                    No findings match these filters.
                  </div>
                ) : (
                  <div className="space-y-2">
                    {findings.map((finding) => (
                      <FindingCard key={finding.id} finding={finding} readOnly={isDemo} />
                    ))}
                  </div>
                )}

                {audit.isSample && (
                  <div className="mt-4">
                    <SampleDataNote />
                  </div>
                )}
              </div>
            )}

            {tab === "checks" && (
              <div className="space-y-4">
                <div className="surface p-5">
                  <SectionHeader
                    title="How this score was produced"
                    description="Automated checks feed the score. Manual prompts are listed so nothing is silently assumed."
                  />
                  <ul className="space-y-1.5 text-[12.5px] leading-relaxed text-muted-foreground">
                    <li>Each category score is the weighted pass rate of its automated checks (pass = 1, warning = 0.5, fail = 0).</li>
                    <li>Checks that could not be measured are marked not applicable and excluded from the denominator.</li>
                    <li>The overall score is the weight-normalised mean of evaluated categories only, so a narrow audit cannot outrank a broad one by omission.</li>
                    <li>Manual prompts never contribute to the score.</li>
                  </ul>
                </div>

                {scope.map((category) => {
                  const entry = categoryScores[category];
                  if (!entry) return null;
                  return (
                    <section key={category} className="surface overflow-hidden">
                      <div className="flex items-center justify-between border-b px-5 py-3">
                        <div>
                          <div className="text-[13px] font-semibold">{CATEGORY_LABELS[category]}</div>
                          <div className="text-[11px] text-muted-foreground">
                            {entry.automatedChecks} automated · {entry.manualChecks} manual prompts
                          </div>
                        </div>
                        <div className={cn("tnum text-[18px] font-semibold", toneClass(entry.score))}>
                          {entry.score === null ? "n/e" : entry.score}
                        </div>
                      </div>
                      {entry.checks.length === 0 ? (
                        <div className="px-5 py-6 text-[12.5px] text-muted-foreground">
                          Check register not captured for this audit.
                        </div>
                      ) : (
                        <table className="w-full text-[12px]">
                          <thead>
                            <tr className="border-b text-left text-[10px] uppercase tracking-[0.06em] text-muted-foreground">
                              <th className="px-5 py-2 font-medium">Check &amp; observed value</th>
                              <th className="px-3 py-2 font-medium">Expected</th>
                              <th className="px-5 py-2 text-right font-medium">Result</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y">
                            {entry.checks.map((check) => (
                              <tr key={check.id} className="align-top">
                                <td className="w-[46%] px-5 py-2.5">
                                  <div className="flex items-center gap-2">
                                    <span
                                      className={cn(
                                        "inline-flex h-1.5 w-1.5 shrink-0 rounded-full",
                                        check.status === "pass"
                                          ? "bg-[hsl(var(--score-strong))]"
                                          : check.status === "warn"
                                            ? "bg-[hsl(var(--score-fair))]"
                                            : check.status === "fail"
                                              ? "bg-[hsl(var(--score-weak))]"
                                              : "bg-border",
                                      )}
                                    />
                                    <span className="font-medium">{check.label}</span>
                                    {check.detection === "manual" && (
                                      <span className="rounded-full border px-1.5 py-0.5 text-[9.5px] uppercase tracking-[0.06em] text-muted-foreground">
                                        manual
                                      </span>
                                    )}
                                  </div>
                                  <div className="mt-0.5 pl-3.5 text-[11px] leading-relaxed text-muted-foreground">{check.observed}</div>
                                </td>
                                <td className="px-3 py-2.5 text-[11px] text-muted-foreground">{check.expected}</td>
                                <td className="w-[70px] px-5 py-2.5 text-right">
                                  <span
                                    className={cn(
                                      "rounded-full px-1.5 py-0.5 text-[10px] font-semibold uppercase",
                                      check.status === "pass"
                                        ? "bg-tone-strong"
                                        : check.status === "warn"
                                          ? "bg-tone-fair"
                                          : check.status === "fail"
                                            ? "bg-tone-weak"
                                            : "bg-muted text-muted-foreground",
                                    )}
                                  >
                                    {check.status}
                                  </span>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      )}
                    </section>
                  );
                })}

                <section className="surface p-5">
                  <SectionHeader title="Manual review prompts" description="These need a human. They are never scored." />
                  {manualChecks.length === 0 ? (
                    <p className="text-[12.5px] text-muted-foreground">No manual prompts attached to this audit's scope.</p>
                  ) : (
                    <ul className="space-y-1.5">
                      {manualChecks.map((check) => (
                        <li key={check.id} className="text-[12.5px] leading-relaxed text-muted-foreground">
                          <span className="font-medium text-foreground">{check.label}</span> — {check.expected}
                        </li>
                      ))}
                    </ul>
                  )}
                </section>
              </div>
            )}

            {tab === "evidence" && (
              <div className="grid gap-4 lg:grid-cols-2">
                <section className="surface p-5">
                  <SectionHeader title="Performance" description="Navigation timing from the audit run." />
                  <div className="grid grid-cols-2 gap-3">
                    <StatTile label="Load" value={perf?.loadEventMs != null ? `${perf.loadEventMs}ms` : "—"} />
                    <StatTile label="DOM ready" value={perf?.domContentLoadedMs != null ? `${perf.domContentLoadedMs}ms` : "—"} />
                    <StatTile label="Requests" value={perf?.requestCount ?? "—"} />
                    <StatTile label="Transferred" value={perf?.transferKb != null ? `${Math.round(perf.transferKb)} KB` : "—"} />
                  </div>
                  <div className="mt-4 border-t pt-3 text-[12px] text-muted-foreground">
                    Reading ease {readability?.fleschReadingEase ?? "—"} · {readability?.words ?? "—"} words ·{" "}
                    {readability?.averageSentenceLength ?? "—"} words/sentence
                  </div>
                </section>

                <section className="surface p-5">
                  <SectionHeader title="Accessibility rules" description="axe-core results, WCAG 2.0/2.1/2.2 A–AA." />
                  {(axe?.rules ?? []).length === 0 ? (
                    <p className="text-[12.5px] text-muted-foreground">
                      {metrics.axe ? "No rule violations were reported." : "Accessibility was not in scope for this audit."}
                    </p>
                  ) : (
                    <ul className="space-y-2">
                      {(axe?.rules ?? []).slice(0, 8).map((rule) => (
                        <li key={rule.id} className="flex items-start justify-between gap-3 text-[12px]">
                          <div>
                            <div className="font-medium">{rule.help}</div>
                            <div className="text-[11px] text-muted-foreground">
                              {rule.id} · {rule.nodes} node{rule.nodes === 1 ? "" : "s"}
                              {rule.wcag.length ? ` · ${rule.wcag.join(", ")}` : ""}
                            </div>
                          </div>
                          {rule.impact && <SeverityBadge severity={rule.impact === "serious" ? "high" : rule.impact === "critical" ? "critical" : rule.impact === "moderate" ? "medium" : "low"} />}
                        </li>
                      ))}
                    </ul>
                  )}
                </section>

                <section className="surface p-5">
                  <SectionHeader title="Breakpoints" description="Overflow measured at each width." />
                  {responsive && responsive.length > 0 ? (
                    <table className="w-full text-[12.5px]">
                      <tbody className="divide-y">
                        {responsive.map((entry) => (
                          <tr key={entry.preset}>
                            <td className="py-1.5 capitalize">{entry.preset}</td>
                            <td className="tnum py-1.5 text-right text-muted-foreground">{entry.width}px</td>
                            <td className="py-1.5 text-right">
                              {entry.overflow ? (
                                <span className="font-medium text-[hsl(var(--score-weak))]">+{entry.overflowPx}px overflow</span>
                              ) : (
                                <span className="text-muted-foreground">fits</span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  ) : (
                    <p className="text-[12.5px] text-muted-foreground">Responsive measurement was not in scope.</p>
                  )}
                </section>

                <section className="surface p-5">
                  <SectionHeader title="Design tokens in use" />
                  <div className="space-y-3 text-[12px]">
                    <div>
                      <div className="label-caps mb-1">Type families</div>
                      <div className="text-muted-foreground">
                        {(typography?.families ?? []).map((entry) => `${entry.value} ×${entry.count}`).join(", ") || "—"}
                      </div>
                    </div>
                    <div>
                      <div className="label-caps mb-1">Font sizes</div>
                      <div className="text-muted-foreground">
                        {(typography?.sizes ?? []).map((entry) => entry.value).join(", ") || "—"}
                      </div>
                    </div>
                    <div>
                      <div className="label-caps mb-1">Radii</div>
                      <div className="text-muted-foreground">
                        {(palette?.radius ?? []).map((entry) => entry.value).join(", ") || "—"}
                      </div>
                    </div>
                  </div>
                </section>

                {audit.screenshotUrl && (
                  <section className="surface overflow-hidden lg:col-span-2">
                    <div className="border-b px-5 py-3">
                      <div className="text-[12.5px] font-medium">Captured evidence</div>
                      <div className="text-[11px] text-muted-foreground">{audit.targetUrl}</div>
                    </div>
                    <img src={audit.screenshotUrl} alt={`Screenshot of ${audit.targetUrl}`} className="w-full" />
                  </section>
                )}

                <section className="surface p-5 lg:col-span-2">
                  <SectionHeader title="Export" description="Every export is generated from the same stored dataset." />
                  <div className="flex flex-wrap gap-2">
                    <Button variant="outline" asChild>
                      <a href={`/api/audits/${audit.id}/report.pdf`}>
                        <Download className="h-4 w-4" />
                        PDF report
                      </a>
                    </Button>
                    <Button variant="outline" asChild>
                      <a href={`/api/audits/${audit.id}/report`} target="_blank" rel="noreferrer">
                        <FileText className="h-4 w-4" />
                        HTML report
                      </a>
                    </Button>
                    <Button variant="outline" asChild>
                      <a href={`/api/audits/${audit.id}/report.json`}>
                        <FileJson className="h-4 w-4" />
                        JSON
                      </a>
                    </Button>
                  </div>
                </section>
              </div>
            )}
          </div>
        </>
      )}

      {audit.status !== "completed" && !inFlight && (
        <div className="surface mt-4 p-5">
          <SectionHeader title="Execution log" description="The stages this audit attempted." />
          <StageTimeline stages={liveStages} />
        </div>
      )}
    </AppShell>
  );
}
