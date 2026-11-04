import { useState } from "react";
import { Link, useLocation, useParams } from "wouter";
import { ArrowLeft, ExternalLink, Plus, Trash2 } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { CategoryScoreBars, ScoreTrendChart, SeverityBar } from "@/components/charts";
import { EmptyState, ScorePill, SectionHeader, StatTile, StatusPill } from "@/components/ui-bits";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { useAddPage, useMe, useProject } from "@/hooks/useApi";
import { CATEGORY_LABELS, formatDate, hostFromUrl, relativeTime, truncate } from "@/lib/format";
import { cn } from "@/lib/utils";

export default function ProjectDetailPage() {
  const params = useParams<{ id: string }>();
  const { data, isLoading } = useProject(params.id);
  const { data: me } = useMe();
  const addPage = useAddPage(params.id);
  const [, setLocation] = useLocation();
  const isDemo = me?.mode === "demo";

  const [pageOpen, setPageOpen] = useState(false);
  const [pageName, setPageName] = useState("");
  const [pageUrl, setPageUrl] = useState("");
  const [pageError, setPageError] = useState<string | null>(null);

  if (isLoading || !data) {
    return (
      <AppShell>
        <Skeleton className="mb-6 h-20 w-2/3" />
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, index) => (
            <Skeleton key={index} className="h-[104px]" />
          ))}
        </div>
        <Skeleton className="mt-4 h-[320px]" />
      </AppShell>
    );
  }

  const { project, pages, audits, stats, findings, history, objectives, priorities } = data;
  const completed = audits.filter((audit) => audit.status === "completed");

  const createPage = async () => {
    setPageError(null);
    try {
      await addPage.mutateAsync({ name: pageName, url: pageUrl });
      setPageOpen(false);
      setPageName("");
      setPageUrl("");
    } catch (error) {
      setPageError(error instanceof Error ? error.message : "Could not add the page");
    }
  };

  return (
    <AppShell>
      <Link href="/projects" className="mb-4 inline-flex items-center gap-1.5 text-[12.5px] text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-3.5 w-3.5" />
        All projects
      </Link>

      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="label-caps mb-1.5">{project.projectTypeLabel}</div>
          <h1 className="text-[24px] font-semibold leading-tight tracking-[-0.025em]">{project.name}</h1>
          <p className="mt-2 max-w-2xl text-[13.5px] leading-relaxed text-muted-foreground">
            {project.description ?? "No description yet."}
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px] text-muted-foreground">
            {project.websiteUrl && (
              <a
                href={project.websiteUrl}
                target="_blank"
                rel="noreferrer noopener"
                className="inline-flex items-center gap-1 hover:text-foreground"
              >
                <ExternalLink className="h-3 w-3" />
                {hostFromUrl(project.websiteUrl)}
              </a>
            )}
            {project.targetAudience && <span>Audience: {project.targetAudience}</span>}
            {project.industry && <span>Industry: {project.industry}</span>}
          </div>
        </div>
        {!isDemo && (
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" className="h-9" onClick={() => setPageOpen(true)}>
              <Plus className="h-4 w-4" />
              Add page
            </Button>
            <Button className="h-9" onClick={() => setLocation(`/audits/new?project=${project.id}`)}>
              New audit
            </Button>
          </div>
        )}
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile label="Audits" value={stats.auditCount} hint={`${stats.completedAudits} completed`} />
        <StatTile
          label="Average score"
          value={
            <span className="flex items-baseline gap-2">
              {stats.averageScore ?? "—"}
              {stats.averageScore !== null && <span className="text-sm font-normal text-muted-foreground">/100</span>}
            </span>
          }
          hint="Across completed audits"
        />
        <StatTile label="Best score" value={stats.bestScore ?? "—"} hint="Highest recorded result" />
        <StatTile
          label="Open findings"
          value={findings.open}
          tone={(findings.bySeverity.critical ?? 0) > 0 ? "critical" : "default"}
          hint={`${findings.bySeverity.critical ?? 0} critical · ${findings.resolved} resolved`}
        />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <section className="surface p-5 lg:col-span-2">
          <SectionHeader title="Score history" description="Every completed audit for this project." />
          <ScoreTrendChart
            data={history.map((entry) => ({ date: entry.date ?? "", score: entry.score ?? 0, auditName: entry.name }))}
          />
        </section>
        <section className="surface p-5">
          <SectionHeader title="Findings" description="All findings raised in this project." />
          <SeverityBar counts={findings.bySeverity} />
        </section>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-[1.6fr_1fr]">
        <section className="surface overflow-hidden">
          <div className="border-b px-5 py-4">
            <SectionHeader title="Audits" description="Ordered newest first." />
          </div>
          {audits.length === 0 ? (
            <div className="px-5 py-10 text-center text-[13px] text-muted-foreground">
              No audits yet for this project.
            </div>
          ) : (
            <div className="divide-y">
              {audits.map((audit) => (
                <Link key={audit.id} href={`/audits/${audit.id}`} className="group flex items-center gap-3 px-5 py-3">
                  <ScorePill score={audit.overallScore} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="truncate text-[13px] font-medium group-hover:underline">{truncate(audit.name, 48)}</span>
                      {audit.isSample && (
                        <span className="rounded-full border px-1.5 py-0.5 text-[10px] uppercase tracking-[0.06em] text-muted-foreground">
                          sample
                        </span>
                      )}
                    </div>
                    <div className="mt-0.5 text-[11.5px] text-muted-foreground">
                      {relativeTime(audit.completedAt ?? audit.createdAt)} · {audit.scope.length} categories
                    </div>
                  </div>
                  <StatusPill status={audit.status} />
                </Link>
              ))}
            </div>
          )}
        </section>

        <div className="space-y-4">
          <section className="surface p-5">
            <SectionHeader title="Pages" description="Auditable entry points." />
            <div className="space-y-2">
              {pages.map((page) => (
                <div key={page.id} className="flex items-start justify-between gap-2 rounded-md border px-3 py-2">
                  <div className="min-w-0">
                    <div className="truncate text-[12.5px] font-medium">{page.name}</div>
                    <div className="truncate text-[11px] text-muted-foreground">{page.url}</div>
                    <div className="mt-1 text-[11px] text-muted-foreground">
                      {page.audits} audits · {page.latestScore !== null ? `latest ${page.latestScore}` : "no result"}
                    </div>
                  </div>
                  {!isDemo && pages.length > 1 && (
                    <button
                      className="mt-0.5 text-muted-foreground hover:text-foreground"
                      aria-label={`Remove ${page.name}`}
                      onClick={async () => {
                        await fetch(`/api/projects/${project.id}/pages/${page.id}`, { method: "DELETE" });
                        window.location.reload();
                      }}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              ))}
              {pages.length === 0 && <p className="text-[12.5px] text-muted-foreground">No pages yet.</p>}
            </div>
          </section>

          <section className="surface p-5">
            <SectionHeader title="Audit brief" />
            <div className="space-y-3 text-[12.5px]">
              <div>
                <div className="label-caps mb-1">Objectives</div>
                {objectives.length ? (
                  <ul className="list-inside list-disc space-y-0.5 text-muted-foreground">
                    {objectives.map((objective) => (
                      <li key={objective}>{objective}</li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-muted-foreground">No objectives captured.</p>
                )}
              </div>
              <div>
                <div className="label-caps mb-1.5">Priorities</div>
                <div className="flex flex-wrap gap-1">
                  {priorities.length ? (
                    priorities.map((priority) => (
                      <span key={priority} className="rounded-full bg-accent px-2 py-0.5 text-[11px] font-medium text-accent-foreground">
                        {CATEGORY_LABELS[priority]}
                      </span>
                    ))
                  ) : (
                    <span className="text-muted-foreground">None set</span>
                  )}
                </div>
              </div>
              <div>
                <div className="label-caps mb-1">Last activity</div>
                <p className="text-muted-foreground">{formatDate(project.updatedAt, true)}</p>
              </div>
            </div>
          </section>
        </div>
      </div>

      <Dialog open={pageOpen} onOpenChange={setPageOpen}>
        <DialogContent className="max-w-[460px]">
          <DialogHeader>
            <DialogTitle>Add a page</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label className="text-[12.5px]">Page name</Label>
              <Input value={pageName} onChange={(event) => setPageName(event.target.value)} placeholder="Pricing" className="h-9" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-[12.5px]">URL</Label>
              <Input value={pageUrl} onChange={(event) => setPageUrl(event.target.value)} placeholder="https://example.com/pricing" className="h-9" />
            </div>
            {pageError && <p className="text-[12.5px] text-[hsl(var(--score-weak))]">{pageError}</p>}
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setPageOpen(false)}>
              Cancel
            </Button>
            <Button onClick={createPage} disabled={addPage.isPending}>
              {addPage.isPending ? "Adding…" : "Add page"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}
