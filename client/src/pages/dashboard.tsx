import { Link, useLocation } from "wouter";
import {
  ArrowRight,
  CircleAlert,
  FolderKanban,
  Gauge,
  Plus,
  ScanSearch,
  ShieldCheck,
} from "lucide-react";
import { AppShell, PageHeader } from "@/components/app-shell";
import { CategoryScoreBars, ScoreTrendChart, SeverityBar } from "@/components/charts";
import {
  DeltaPill,
  EmptyState,
  SampleDataNote,
  ScorePill,
  SectionHeader,
  StatTile,
  StatusPill,
} from "@/components/ui-bits";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useDashboard, useMe } from "@/hooks/useApi";
import { formatDate, hostFromUrl, relativeTime, truncate } from "@/lib/format";
import { cn } from "@/lib/utils";

export default function DashboardPage() {
  const { data, isLoading } = useDashboard();
  const { data: me } = useMe();
  const [, setLocation] = useLocation();
  const isDemo = me?.mode === "demo";

  if (isLoading || !data) {
    return (
      <AppShell>
        <Skeleton className="mb-6 h-16 w-2/3" />
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, index) => (
            <Skeleton key={index} className="h-[104px]" />
          ))}
        </div>
        <div className="mt-6 grid gap-4 lg:grid-cols-3">
          <Skeleton className="h-[300px] lg:col-span-2" />
          <Skeleton className="h-[300px]" />
        </div>
      </AppShell>
    );
  }

  const { totals } = data;
  const hasData = totals.projects > 0;
  const emptyWorkspace = !hasData && !isDemo;

  // Category averages arrive unordered; keep the canonical audit order.
  const order = ["accessibility", "usability", "visual-design", "responsive", "content", "performance", "consistency"];
  const categoryScores = [...data.categoryAverages]
    .sort((a, b) => order.indexOf(a.category) - order.indexOf(b.category))
    .map((entry) => ({ category: entry.category, score: entry.score }));

  return (
    <AppShell>
      <PageHeader
        eyebrow={isDemo ? "Demo workspace" : "Workspace overview"}
        title="Design quality at a glance"
        description={
          isDemo
            ? "Sample projects with authored audit history. Use them to see how scores, findings and reports connect — the numbers come from the stored records, not from a live capture."
            : "Every number below is derived from audits stored in this workspace. Open a project to see category breakdowns, findings and reports."
        }
        actions={
          !isDemo && (
            <Button onClick={() => setLocation("/audits/new")} className="h-9">
              <Plus className="h-4 w-4" />
              New audit
            </Button>
          )
        }
      />

      {emptyWorkspace ? (
        <EmptyState
          icon={<ScanSearch className="h-5 w-5" />}
          title="No projects yet"
          description="Create a project for a website or application, add the pages you care about, then run an audit. DesignLens measures seven dimensions of design quality and stores the history against that project."
          action={
            <div className="flex flex-wrap justify-center gap-2">
              <Button onClick={() => setLocation("/projects?new=1")}>
                <Plus className="h-4 w-4" />
                Create first project
              </Button>
              <Button variant="outline" onClick={() => setLocation("/methodology")}>
                How scoring works
              </Button>
            </div>
          }
        />
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <StatTile
              label="Projects"
              value={totals.projects}
              icon={<FolderKanban className="h-4 w-4" />}
              hint={`${totals.audits} audit${totals.audits === 1 ? "" : "s"} recorded`}
            />
            <StatTile
              label="Completed audits"
              value={totals.completedAudits}
              icon={<ShieldCheck className="h-4 w-4" />}
              hint={totals.audits - totals.completedAudits > 0 ? `${totals.audits - totals.completedAudits} in progress or failed` : "All audits complete"}
            />
            <StatTile
              label="Average UX score"
              value={
                <span className="flex items-baseline gap-2">
                  {totals.averageScore ?? "—"}
                  {totals.averageScore !== null && <span className="text-sm font-normal text-muted-foreground">/100</span>}
                </span>
              }
              icon={<Gauge className="h-4 w-4" />}
              hint={<DeltaPill delta={totals.scoreDelta} suffix=" vs earlier audits" />}
            />
            <StatTile
              label="Open findings"
              value={totals.openFindings}
              tone={totals.criticalFindings > 0 ? "critical" : "default"}
              icon={<CircleAlert className="h-4 w-4" />}
              hint={
                <span className="flex items-center gap-2">
                  <span>{totals.criticalFindings} critical</span>
                  <span className="text-border">·</span>
                  <span>{totals.resolvedFindings} resolved</span>
                </span>
              }
            />
          </div>

          <div className="mt-4 grid gap-4 lg:grid-cols-3">
            <section className="surface p-5 lg:col-span-2">
              <SectionHeader
                title="Quality score trend"
                description="Average score across completed audits, oldest to newest."
                action={
                  <Link href="/audits" className="text-[12px] font-medium text-accent-foreground hover:underline">
                    All audits
                  </Link>
                }
              />
              <ScoreTrendChart data={data.trend} />
            </section>

            <section className="surface p-5">
              <SectionHeader title="Findings by severity" description="All findings in this workspace." />
              <SeverityBar counts={data.severityDistribution} />
              <div className="mt-5 rounded-lg border border-dashed px-3 py-2.5">
                <p className="text-[11.5px] leading-relaxed text-muted-foreground">
                  Severity reflects impact on the user, not the effort to fix. Resolve critical and high items first.
                </p>
              </div>
            </section>
          </div>

          <div className="mt-4 grid gap-4 lg:grid-cols-3">
            <section className="surface p-5">
              <SectionHeader title="Category performance" description="Mean score per dimension." />
              {categoryScores.length > 0 ? (
                <CategoryScoreBars scores={categoryScores} compact />
              ) : (
                <p className="text-[13px] text-muted-foreground">No category data yet.</p>
              )}
            </section>

            <section className="surface p-5 lg:col-span-2">
              <SectionHeader
                title="Recent audits"
                description="Latest runs across every project."
                action={
                  <Link href="/audits" className="text-[12px] font-medium text-accent-foreground hover:underline">
                    View all
                  </Link>
                }
              />
              <div className="divide-y">
                {data.recentAudits.length === 0 && (
                  <p className="py-6 text-center text-[13px] text-muted-foreground">No audits recorded yet.</p>
                )}
                {data.recentAudits.map((audit) => (
                  <Link
                    key={audit.id}
                    href={`/audits/${audit.id}`}
                    className="group flex items-center gap-3 py-2.5 first:pt-0 last:pb-0"
                  >
                    <ScorePill score={audit.overallScore} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="truncate text-[13px] font-medium group-hover:underline">
                          {truncate(audit.name, 52)}
                        </span>
                        {audit.isSample && (
                          <span className="rounded-full border px-1.5 py-0.5 text-[10px] uppercase tracking-[0.06em] text-muted-foreground">
                            sample
                          </span>
                        )}
                      </div>
                      <div className="mt-0.5 truncate text-[11.5px] text-muted-foreground">
                        {hostFromUrl(audit.targetUrl)} · {relativeTime(audit.completedAt ?? audit.createdAt)}
                      </div>
                    </div>
                    <StatusPill status={audit.status} />
                    <ArrowRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
                  </Link>
                ))}
              </div>
            </section>
          </div>

          <section className="mt-4">
            <SectionHeader
              title="Projects"
              description="Each project keeps its own audit history and findings."
              action={
                <Link href="/projects" className="text-[12px] font-medium text-accent-foreground hover:underline">
                  All projects
                </Link>
              }
            />
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {data.projects.map((project) => (
                <Link
                  key={project.id}
                  href={`/projects/${project.id}`}
                  className="surface surface-hover group block p-4"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="truncate text-[13.5px] font-semibold group-hover:underline">{project.name}</div>
                      <div className="mt-0.5 text-[11.5px] text-muted-foreground">{project.projectTypeLabel}</div>
                    </div>
                    <ScorePill score={project.latestScore} />
                  </div>
                  <div className="mt-3 flex items-center gap-3 text-[11.5px] text-muted-foreground">
                    <span>{project.auditCount} audits</span>
                    <span className="text-border">·</span>
                    <span>{project.pageCount} pages</span>
                    {project.openFindings > 0 && (
                      <>
                        <span className="text-border">·</span>
                        <span className={cn(project.openFindings > 8 && "tone-fair")}>{project.openFindings} open</span>
                      </>
                    )}
                  </div>
                  <div className="mt-3 text-[11px] text-muted-foreground">
                    Last audit: {formatDate(project.lastAuditedAt)}
                  </div>
                </Link>
              ))}
            </div>
          </section>

          {isDemo && (
            <div className="mt-5">
              <SampleDataNote />
            </div>
          )}
        </>
      )}
    </AppShell>
  );
}
