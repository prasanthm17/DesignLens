import { Link, useParams } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Download, FileJson, FileText, Printer } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { ScoreRing, SeverityBadge } from "@/components/ui-bits";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import { formatDate, gradeFor } from "@/lib/format";
import { cn } from "@/lib/utils";

interface ReportFinding {
  title: string;
  severity: string;
  categoryLabel: string;
  evidence: string | null;
  whyItMatters: string | null;
  recommendation: string | null;
  implementation: string | null;
  wcagCriterion?: string | null;
}

interface ReportModel {
  product: { name: string; tagline: string; generatedAt: string };
  project: { name: string; typeLabel: string; targetAudience: string | null; description: string | null };
  audit: { id: string; name: string; targetUrl: string; finalUrl: string; completedAt: string | null; durationMs: number | null };
  overview: {
    overallScore: number | null;
    grade: string;
    evaluatedCategories: number;
    selectedCategories: number;
    findings: number;
    severityCounts: Record<string, number>;
    estimatedHeadroom: number;
  };
  scores: Array<{ category: string; label: string; score: number | null; weight: number; automatedChecks: number; findings: number }>;
  methodology: string[];
  executiveSummary: string[];
  keyFindings: ReportFinding[];
  criticalIssues: ReportFinding[];
  recommendations: Array<{ title: string; action: string; category: string; severity: string }>;
  priorities: Array<{ horizon: string; items: string[] }>;
  roadmap: Array<{ phase: string; timeframe: string; focus: string; items: string[] }>;
  comparison: {
    previousAuditName: string;
    previousScore: number | null;
    delta: number | null;
    categories: Array<{ category: string; label: string; current: number | null; previous: number | null; delta: number | null }>;
  } | null;
  evidence: { screenshotUrl: string | null };
}

export default function ReportPage() {
  const params = useParams<{ id: string }>();
  const { data, isLoading, error } = useQuery({
    queryKey: ["report", params.id],
    queryFn: () => api.get<ReportModel>(`/api/audits/${params.id}/report.json`),
  });

  if (isLoading || !data) {
    return (
      <AppShell>
        <Skeleton className="h-[600px] w-full" />
      </AppShell>
    );
  }

  if (error) {
    return (
      <AppShell>
        <p className="text-[13px] text-muted-foreground">This audit has no report yet — it may still be running.</p>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3 print:hidden">
        <Link href={`/audits/${data.audit.id}`} className="inline-flex items-center gap-1.5 text-[12.5px] text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-3.5 w-3.5" />
          Back to audit
        </Link>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={() => window.print()}>
            <Printer className="h-3.5 w-3.5" />
            Print
          </Button>
          <Button variant="outline" size="sm" asChild>
            <a href={`/api/audits/${data.audit.id}/report`} target="_blank" rel="noreferrer">
              <FileText className="h-3.5 w-3.5" />
              HTML
            </a>
          </Button>
          <Button variant="outline" size="sm" asChild>
            <a href={`/api/audits/${data.audit.id}/report.json`}>
              <FileJson className="h-3.5 w-3.5" />
              JSON
            </a>
          </Button>
          <Button size="sm" asChild>
            <a href={`/api/audits/${data.audit.id}/report.pdf`}>
              <Download className="h-3.5 w-3.5" />
              PDF
            </a>
          </Button>
        </div>
      </div>

      <article className="surface mx-auto max-w-[860px] px-6 py-8 sm:px-10 sm:py-10">
        <header className="border-b pb-6">
          <div className="flex items-center gap-2">
            <span className="flex h-6 w-6 items-center justify-center rounded-md bg-foreground text-[10px] font-bold text-background">
              DL
            </span>
            <span className="text-[12px] font-semibold tracking-[0.02em]">DesignLens</span>
            <span className="text-[11px] text-muted-foreground">· {data.product.tagline}</span>
          </div>
          <h1 className="mt-6 text-[28px] font-semibold leading-tight tracking-[-0.03em]">{data.audit.name}</h1>
          <p className="mt-1.5 text-[13px] text-muted-foreground">
            {data.project.name} · {data.project.typeLabel} · {formatDate(data.audit.completedAt)}
          </p>
          <div className="mt-4 grid grid-cols-2 gap-4 text-[12px] sm:grid-cols-4">
            <div>
              <div className="label-caps">Target</div>
              <div className="mt-0.5 truncate font-medium">{data.audit.finalUrl.replace(/^https?:\/\//, "")}</div>
            </div>
            <div>
              <div className="label-caps">Categories</div>
              <div className="mt-0.5 font-medium">
                {data.overview.evaluatedCategories} of {data.overview.selectedCategories}
              </div>
            </div>
            <div>
              <div className="label-caps">Findings</div>
              <div className="mt-0.5 font-medium">{data.overview.findings}</div>
            </div>
            <div>
              <div className="label-caps">Grade</div>
              <div className="mt-0.5 font-medium">{gradeFor(data.overview.overallScore)}</div>
            </div>
          </div>
        </header>

        <section className="mt-7 grid gap-6 sm:grid-cols-[150px_1fr]">
          <ScoreRing score={data.overview.overallScore} size={140} showGrade={false} />
          <div>
            <h2 className="text-[13px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">Executive summary</h2>
            <div className="mt-2 space-y-2 text-[13px] leading-relaxed">
              {data.executiveSummary.map((line, index) => (
                <p key={index}>{line}</p>
              ))}
            </div>
          </div>
        </section>

        <section className="mt-8">
          <h2 className="text-[13px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">Category scores</h2>
          <table className="mt-2 w-full text-[12.5px]">
            <thead>
              <tr className="border-b text-left text-[10.5px] uppercase tracking-[0.06em] text-muted-foreground">
                <th className="py-1.5 font-medium">Category</th>
                <th className="py-1.5 text-right font-medium">Score</th>
                <th className="py-1.5 text-right font-medium">Weight</th>
                <th className="py-1.5 text-right font-medium">Findings</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {data.scores.map((score) => (
                <tr key={score.category}>
                  <td className="py-2">
                    <div className="font-medium">{score.label}</div>
                    <div className="text-[11px] text-muted-foreground">{score.automatedChecks} automated checks</div>
                  </td>
                  <td className="tnum py-2 text-right font-semibold">{score.score === null ? "n/e" : score.score}</td>
                  <td className="tnum py-2 text-right text-muted-foreground">{Math.round(score.weight * 100)}%</td>
                  <td className="tnum py-2 text-right text-muted-foreground">{score.findings}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        {data.keyFindings.length > 0 && (
          <section className="mt-8">
            <h2 className="text-[13px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">Key findings</h2>
            <div className="mt-2 space-y-3">
              {data.keyFindings.map((finding, index) => (
                <div key={index} className="rounded-lg border p-3.5">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <SeverityBadge severity={finding.severity as never} />
                    <span className="text-[11px] text-muted-foreground">{finding.categoryLabel}</span>
                    {finding.wcagCriterion && <span className="text-[11px] text-muted-foreground">· {finding.wcagCriterion}</span>}
                  </div>
                  <h3 className="mt-1.5 text-[13px] font-semibold">{finding.title}</h3>
                  {finding.evidence && (
                    <p className="mt-1.5 rounded border-l-2 bg-muted/50 px-2.5 py-1.5 font-mono text-[11px] leading-relaxed">
                      {finding.evidence}
                    </p>
                  )}
                  {finding.whyItMatters && <p className="mt-1.5 text-[12px] leading-relaxed text-muted-foreground">{finding.whyItMatters}</p>}
                  {finding.recommendation && (
                    <p className="mt-1.5 text-[12px] leading-relaxed">
                      <span className="font-medium">Recommendation: </span>
                      {finding.recommendation}
                    </p>
                  )}
                  {finding.implementation && (
                    <pre className="mt-2 overflow-x-auto rounded bg-foreground px-2.5 py-2 text-[10.5px] leading-relaxed text-background">
                      <code>{finding.implementation}</code>
                    </pre>
                  )}
                </div>
              ))}
            </div>
          </section>
        )}

        {data.roadmap.length > 0 && (
          <section className="mt-8">
            <h2 className="text-[13px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">Improvement roadmap</h2>
            <div className="mt-2 overflow-x-auto">
              <table className="w-full text-[12px]">
                <thead>
                  <tr className="border-b text-left text-[10.5px] uppercase tracking-[0.06em] text-muted-foreground">
                    <th className="py-1.5 font-medium">Phase</th>
                    <th className="py-1.5 font-medium">Timeframe</th>
                    <th className="py-1.5 font-medium">Focus</th>
                    <th className="py-1.5 text-right font-medium">Items</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {data.roadmap.map((phase) => (
                    <tr key={phase.phase}>
                      <td className="py-1.5 font-medium">{phase.phase}</td>
                      <td className="py-1.5 text-muted-foreground">{phase.timeframe}</td>
                      <td className="py-1.5 text-muted-foreground">{phase.focus}</td>
                      <td className="tnum py-1.5 text-right">{phase.items.length}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {data.comparison && (
          <section className="mt-8">
            <h2 className="text-[13px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
              Comparison with previous audit
            </h2>
            <p className="mt-2 text-[12.5px] text-muted-foreground">
              Compared with <strong className="text-foreground">{data.comparison.previousAuditName}</strong> (previous overall{" "}
              {data.comparison.previousScore ?? "—"}). Change:{" "}
              <strong
                className={cn(
                  data.comparison.delta && data.comparison.delta > 0
                    ? "text-[hsl(var(--score-strong))]"
                    : data.comparison.delta && data.comparison.delta < 0
                      ? "text-[hsl(var(--score-weak))]"
                      : "text-foreground",
                )}
              >
                {data.comparison.delta === null ? "not comparable" : `${data.comparison.delta > 0 ? "+" : ""}${data.comparison.delta}`}
              </strong>
            </p>
            <div className="mt-2 grid gap-1.5 sm:grid-cols-2">
              {data.comparison.categories.map((entry) => (
                <div key={entry.category} className="flex items-center justify-between border-b py-1 text-[12px]">
                  <span>{entry.label}</span>
                  <span className="tnum text-muted-foreground">
                    {entry.previous ?? "—"} → <strong className="text-foreground">{entry.current ?? "—"}</strong>
                  </span>
                </div>
              ))}
            </div>
          </section>
        )}

        <section className="mt-8">
          <h2 className="text-[13px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">Methodology</h2>
          <ul className="mt-2 list-inside list-disc space-y-1 text-[12px] leading-relaxed text-muted-foreground">
            {data.methodology.map((line, index) => (
              <li key={index}>{line}</li>
            ))}
          </ul>
        </section>

        <footer className="mt-8 border-t pt-3 text-[10.5px] text-muted-foreground">
          Generated by DesignLens on {formatDate(data.product.generatedAt)}. Scores derive from measurements taken on the
          rendered page at audit time; re-running the audit after changes produces a new report.
        </footer>
      </article>
    </AppShell>
  );
}
