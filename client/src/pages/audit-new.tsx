import { useEffect, useMemo, useState } from "react";
import { Link, useLocation, useParams, useSearch } from "wouter";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCircle2,
  CircleDashed,
  Download,
  ExternalLink,
  Loader2,
  Play,
  RotateCcw,
  XCircle,
} from "lucide-react";
import { AppShell, PageHeader } from "@/components/app-shell";
import { CategoryScoreBars } from "@/components/charts";
import { EmptyState, ScoreRing, SectionHeader, StatTile } from "@/components/ui-bits";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useCatalog, useCreateAudit, useMe, useProject, useProjects, useAuditStatus } from "@/hooks/useApi";
import { CATEGORY_LABELS, hostFromUrl, pluralize } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { AuditCategory } from "@/lib/types";

const STEPS = [
  { key: "project", label: "Project" },
  { key: "target", label: "Target" },
  { key: "scope", label: "Scope" },
  { key: "configure", label: "Configure" },
  { key: "review", label: "Review" },
  { key: "execute", label: "Execute" },
  { key: "results", label: "Results" },
];

export default function AuditNewPage() {
  const { data: projects } = useProjects();
  const { data: catalog } = useCatalog();
  const { data: me } = useMe();
  const createAudit = useCreateAudit();
  const [, setLocation] = useLocation();
  const search = useSearch();
  const params = useParams<{ id?: string }>();

  const preselected = new URLSearchParams(search).get("project") ?? "";
  const [step, setStep] = useState(0);
  const [projectId, setProjectId] = useState(preselected);
  const [targetMode, setTargetMode] = useState<"url" | "page">("page");
  const [pageId, setPageId] = useState("");
  const [targetUrl, setTargetUrl] = useState("");
  const [scope, setScope] = useState<AuditCategory[]>([
    "accessibility",
    "usability",
    "visual-design",
    "responsive",
    "content",
    "performance",
  ]);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [audience, setAudience] = useState("");
  const [objectives, setObjectives] = useState("");
  const [priorities, setPriorities] = useState<AuditCategory[]>([]);
  const [viewport, setViewport] = useState("all");
  const [error, setError] = useState<string | null>(null);
  const [auditId, setAuditId] = useState<string | null>(null);

  const { data: project } = useProject(projectId);
  const isDemo = me?.mode === "demo";

  const resolvedUrl = useMemo(() => {
    if (targetMode === "page" && project) {
      return project.pages.find((page) => page.id === pageId)?.url ?? "";
    }
    return targetUrl;
  }, [targetMode, project, pageId, targetUrl]);

  /** Suggested name; the field falls back to it until the user types their own. */
  const suggestedName = useMemo(() => {
    const pageName = targetMode === "page" ? project?.pages.find((page) => page.id === pageId)?.name : null;
    const label = pageName || (resolvedUrl ? hostFromUrl(resolvedUrl) : project?.project.name ?? "");
    return label ? `${label} · UX audit` : "";
  }, [project, pageId, targetMode, resolvedUrl]);

  const effectiveName = name.trim() || suggestedName;

  useEffect(() => {
    if (project && !audience) setAudience(project.project.targetAudience ?? "");
    if (project && priorities.length === 0) setPriorities(project.priorities);
  }, [project, audience, priorities.length]);

  useEffect(() => {
    if (project && !pageId && project.pages[0]) setPageId(project.pages[0].id);
  }, [project, pageId]);

  const statusQuery = useAuditStatus(auditId ?? "", Boolean(auditId) && step >= 5);
  const status = statusQuery.data;
  const advance = async () => {
    setError(null);
    if (step === 0 && !projectId) return setError("Choose a project to continue.");
    if (step === 1 && !resolvedUrl) return setError("Choose a page or enter a URL to audit.");
    if (step === 2 && scope.length === 0) return setError("Select at least one audit category.");
    if (step === 3 && effectiveName.trim().length < 2) return setError("Give the audit a name.");

    if (step === 4) {
      try {
        const created = await createAudit.mutateAsync({
          projectId,
          pageId: targetMode === "page" ? pageId : null,
          name: effectiveName,
          description,
          targetUrl: resolvedUrl,
          scope,
          targetAudience: audience || null,
          objectives: objectives
            .split("\n")
            .map((line) => line.trim())
            .filter(Boolean),
          priorities,
          viewport,
        });
        setAuditId(created.audit.id);
        setStep(5);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not start the audit");
      }
      return;
    }

    setStep((value) => Math.min(value + 1, STEPS.length - 1));
  };

  useEffect(() => {
    if (step === 5 && status?.status === "completed") setStep(6);
  }, [step, status?.status]);

  if (isDemo) {
    return (
      <AppShell>
        <EmptyState
          title="The demo workspace is read-only"
          description="Create an account to run audits against your own projects. The demo includes eight completed audits you can explore."
          action={<Button onClick={() => setLocation("/audits")}>Browse demo audits</Button>}
        />
      </AppShell>
    );
  }


  return (
    <AppShell>
      <Link href={projectId ? `/projects/${projectId}` : "/projects"} className="mb-4 inline-flex items-center gap-1.5 text-[12.5px] text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-3.5 w-3.5" />
        {projectId ? "Back to project" : "All projects"}
      </Link>

      <PageHeader
        eyebrow="New audit"
        title="Run a UX audit"
        description="A short configuration, then the run itself. The audit renders the page in a headless browser and measures it — nothing is inferred from a thumbnail."
      />

      <div className="grid gap-6 lg:grid-cols-[190px_1fr]">
        {/* Step rail */}
        <ol className="hidden space-y-1 lg:block">
          {STEPS.map((item, index) => {
            const state = index < step ? "done" : index === step ? "current" : "todo";
            return (
              <li key={item.key}>
                <div
                  className={cn(
                    "flex items-center gap-2.5 rounded-md px-2 py-1.5 text-[12.5px]",
                    state === "current" && "bg-accent font-medium text-accent-foreground",
                    state === "done" && "text-muted-foreground",
                    state === "todo" && "text-muted-foreground/70",
                  )}
                >
                  <span
                    className={cn(
                      "flex h-5 w-5 items-center justify-center rounded-full border text-[10.5px] font-semibold",
                      state === "done" && "border-transparent bg-tone-strong",
                      state === "current" && "border-foreground bg-foreground text-background",
                    )}
                  >
                    {state === "done" ? <Check className="h-3 w-3" /> : index + 1}
                  </span>
                  {item.label}
                </div>
              </li>
            );
          })}
        </ol>

        <div className="surface p-5 sm:p-6">
          {step === 0 && (
            <div>
              <SectionHeader
                title="Which project is this audit for?"
                description="Every audit belongs to a project so results stay comparable over time."
              />
              <div className="grid gap-2 sm:grid-cols-2">
                {(projects ?? []).map((item) => (
                  <button
                    key={item.id}
                    onClick={() => {
                      setProjectId(item.id);
                      setPageId("");
                      setName("");
                    }}
                    className={cn(
                      "rounded-lg border px-3.5 py-3 text-left transition-colors",
                      projectId === item.id
                        ? "border-foreground bg-accent/60"
                        : "hover:border-foreground/30 hover:bg-muted/50",
                    )}
                  >
                    <div className="text-[13px] font-medium">{item.name}</div>
                    <div className="mt-0.5 text-[11.5px] text-muted-foreground">
                      {item.projectTypeLabel} · {item.pageCount} pages
                    </div>
                  </button>
                ))}
                {(projects ?? []).length === 0 && (
                  <p className="text-[13px] text-muted-foreground">
                    You need a project first.{" "}
                    <Link href="/projects?new=1" className="link">
                      Create one
                    </Link>
                    .
                  </p>
                )}
              </div>
            </div>
          )}

          {step === 1 && project && (
            <div>
              <SectionHeader
                title="What should be audited?"
                description="Pick a saved page, or audit any URL in this project's scope."
              />
              <div className="mb-4 flex rounded-lg border p-0.5">
                {(["page", "url"] as const).map((mode) => (
                  <button
                    key={mode}
                    onClick={() => setTargetMode(mode)}
                    className={cn(
                      "flex-1 rounded-md px-3 py-1.5 text-[12.5px] font-medium transition-colors",
                      targetMode === mode ? "bg-secondary text-foreground" : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {mode === "page" ? "Saved page" : "Custom URL"}
                  </button>
                ))}
              </div>

              {targetMode === "page" ? (
                <div className="space-y-2">
                  {project.pages.map((page) => (
                    <button
                      key={page.id}
                      onClick={() => setPageId(page.id)}
                      className={cn(
                        "flex w-full items-center justify-between gap-3 rounded-lg border px-3.5 py-2.5 text-left transition-colors",
                        pageId === page.id ? "border-foreground bg-accent/60" : "hover:border-foreground/30",
                      )}
                    >
                      <div className="min-w-0">
                        <div className="text-[13px] font-medium">{page.name}</div>
                        <div className="truncate text-[11.5px] text-muted-foreground">{page.url}</div>
                      </div>
                      {pageId === page.id && <CheckCircle2 className="h-4 w-4 shrink-0" />}
                    </button>
                  ))}
                  {project.pages.length === 0 && (
                    <p className="text-[13px] text-muted-foreground">This project has no pages yet — use a custom URL.</p>
                  )}
                </div>
              ) : (
                <div className="space-y-1.5">
                  <Label className="text-[12.5px]">URL to audit</Label>
                  <Input
                    value={targetUrl}
                    onChange={(event) => setTargetUrl(event.target.value)}
                    placeholder="https://example.com/pricing"
                    className="h-10"
                  />
                  <p className="text-[11.5px] text-muted-foreground">
                    Publicly reachable http(s) URLs only. Authenticated areas are out of scope.
                  </p>
                </div>
              )}
            </div>
          )}

          {step === 2 && (
            <div>
              <SectionHeader
                title="Which dimensions should run?"
                description="Each category is scored independently. Selecting fewer categories produces a faster run and a narrower report."
              />
              <div className="grid gap-2 sm:grid-cols-2">
                {(catalog?.categories ?? []).map((category) => {
                  const selected = scope.includes(category.key);
                  return (
                    <button
                      key={category.key}
                      onClick={() =>
                        setScope((prev) =>
                          prev.includes(category.key) ? prev.filter((key) => key !== category.key) : [...prev, category.key],
                        )
                      }
                      className={cn(
                        "rounded-lg border px-3.5 py-3 text-left transition-colors",
                        selected ? "border-foreground bg-accent/50" : "hover:border-foreground/30",
                      )}
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-[13px] font-medium">{category.label}</span>
                        <span
                          className={cn(
                            "flex h-4 w-4 items-center justify-center rounded border",
                            selected ? "border-foreground bg-foreground text-background" : "border-border",
                          )}
                        >
                          {selected && <Check className="h-3 w-3" />}
                        </span>
                      </div>
                      <p className="mt-1 text-[11.5px] leading-relaxed text-muted-foreground">{category.description}</p>
                      <div className="mt-1.5 text-[10.5px] uppercase tracking-[0.06em] text-muted-foreground/80">
                        {Math.round(category.weight * 100)}% of overall
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {step === 3 && (
            <div>
              <SectionHeader
                title="Configure the run"
                description="Context is stored with the audit so the report can explain what it was evaluating against."
              />
              <div className="grid gap-3.5">
                <div className="space-y-1.5">
                  <Label className="text-[12.5px]">Audit name</Label>
                  <Input
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                    placeholder={suggestedName}
                    className="h-9"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-[12.5px]">Description</Label>
                  <Textarea
                    value={description}
                    onChange={(event) => setDescription(event.target.value)}
                    rows={2}
                    placeholder="What changed since the last run, and what the team wants to learn."
                    className="text-[13px]"
                  />
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label className="text-[12.5px]">Target audience</Label>
                    <Input
                      value={audience}
                      onChange={(event) => setAudience(event.target.value)}
                      className="h-9"
                      placeholder="Retail customers"
                      list="audience-options"
                    />
                    <datalist id="audience-options">
                      {(catalog?.audiences ?? []).map((option) => (
                        <option key={option} value={option} />
                      ))}
                    </datalist>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-[12.5px]">Viewport coverage</Label>
                    <Select value={viewport} onValueChange={setViewport}>
                      <SelectTrigger className="h-9">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {(catalog?.viewports ?? []).map((option) => (
                          <SelectItem key={option.key} value={option.key} className="text-[13px]">
                            {option.label} — {option.detail}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-[12.5px]">Audit objectives</Label>
                  <Textarea
                    value={objectives}
                    onChange={(event) => setObjectives(event.target.value)}
                    rows={3}
                    placeholder={"One objective per line, e.g.\nConfirm checkout is usable on mobile\nVerify WCAG 2.2 AA on the form"}
                    className="text-[13px]"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-[12.5px]">Priority areas</Label>
                  <div className="flex flex-wrap gap-1.5">
                    {(catalog?.categories ?? []).map((category) => {
                      const selected = priorities.includes(category.key);
                      return (
                        <button
                          key={category.key}
                          onClick={() =>
                            setPriorities((prev) =>
                              prev.includes(category.key)
                                ? prev.filter((key) => key !== category.key)
                                : [...prev, category.key],
                            )
                          }
                          className={cn(
                            "rounded-full border px-2.5 py-1 text-[11.5px] transition-colors",
                            selected
                              ? "border-transparent bg-accent font-medium text-accent-foreground"
                              : "text-muted-foreground hover:bg-muted",
                          )}
                        >
                          {CATEGORY_LABELS[category.key]}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>
          )}

          {step === 4 && (
            <div>
              <SectionHeader title="Review the configuration" description="Nothing runs until you start the audit." />
              <dl className="divide-y rounded-lg border">
                {[
                  { label: "Project", value: project?.project.name ?? "—" },
                  { label: "Target URL", value: resolvedUrl || "—" },
                  { label: "Audit name", value: effectiveName },
                  { label: "Categories", value: scope.map((key) => CATEGORY_LABELS[key]).join(", ") || "—" },
                  { label: "Viewport", value: catalog?.viewports.find((option) => option.key === viewport)?.label ?? viewport },
                  { label: "Audience", value: audience || "Not specified" },
                  { label: "Priorities", value: priorities.map((key) => CATEGORY_LABELS[key]).join(", ") || "None set" },
                  {
                    label: "Objectives",
                    value: objectives.trim() ? objectives.split("\n").filter(Boolean).length + " recorded" : "None",
                  },
                ].map((row) => (
                  <div key={row.label} className="grid grid-cols-[130px_1fr] gap-3 px-3.5 py-2.5 text-[12.5px]">
                    <dt className="text-muted-foreground">{row.label}</dt>
                    <dd className="break-words font-medium">{row.value}</dd>
                  </div>
                ))}
              </dl>
              <div className="mt-4 rounded-lg border border-dashed px-3.5 py-3 text-[12px] leading-relaxed text-muted-foreground">
                The run takes roughly 10–40 seconds depending on the site. It loads the page in a headless browser,
                measures the DOM, runs axe-core, and repeats at each breakpoint when responsive is in scope.
              </div>
            </div>
          )}

          {step === 5 && (
            <div>
              <SectionHeader
                title="Auditing the page"
                description="Stages below reflect work actually performed by the engine."
              />
              <div className="grid gap-6 sm:grid-cols-[220px_1fr] sm:items-start">
                <div className="flex flex-col items-center justify-center rounded-lg border bg-muted/30 py-6">
                  {status?.status === "failed" ? (
                    <XCircle className="h-7 w-7 text-[hsl(var(--score-weak))]" />
                  ) : status?.status === "completed" ? (
                    <CheckCircle2 className="h-7 w-7 text-[hsl(var(--score-strong))]" />
                  ) : (
                    <Loader2 className="h-7 w-7 animate-spin text-muted-foreground" />
                  )}
                  <div className="mt-2 text-[12.5px] font-medium">
                    {status?.status === "failed" ? "Audit failed" : status?.status === "completed" ? "Audit complete" : "Running"}
                  </div>
                  <div className="mt-0.5 text-[11px] text-muted-foreground">
                    {(status?.stages ?? []).filter((stage) => stage.status === "done").length} of{" "}
                    {(status?.stages ?? []).length || 10} stages
                  </div>
                </div>
                <ol className="space-y-2.5">
                  {(status?.stages ?? []).map((stage) => (
                    <li key={stage.key} className="flex items-start gap-2.5 text-[12.5px]">
                      <span className="mt-0.5">
                        {stage.status === "done" ? (
                          <Check className="h-3.5 w-3.5 text-[hsl(var(--score-strong))]" />
                        ) : stage.status === "running" ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
                        ) : stage.status === "failed" ? (
                          <XCircle className="h-3.5 w-3.5 text-[hsl(var(--score-weak))]" />
                        ) : (
                          <CircleDashed className="h-3.5 w-3.5 text-muted-foreground/50" />
                        )}
                      </span>
                      <div className="min-w-0">
                        <div className={cn(stage.status === "pending" && "text-muted-foreground")}>{stage.label}</div>
                        {stage.detail && <div className="text-[11px] text-muted-foreground">{stage.detail}</div>}
                      </div>
                    </li>
                  ))}
                  {(status?.stages ?? []).length === 0 && (
                    <li className="text-[12.5px] text-muted-foreground">Starting the browser…</li>
                  )}
                </ol>
              </div>
              {status?.error && (
                <p className="mt-4 rounded-md border border-[hsl(var(--score-weak))]/40 bg-[hsl(var(--score-weak))]/5 px-3 py-2 text-[12px] text-[hsl(var(--score-weak))]">
                  {status.error}
                </p>
              )}
            </div>
          )}

          {step === 6 && auditId && (
            <div>
              <SectionHeader
                title="Audit complete"
                description="Scores are derived from the checks that ran. Open the full audit for evidence and recommendations."
              />
              <div className="flex flex-wrap items-center gap-6">
                <ScoreRing score={status?.overallScore ?? null} />
                <div className="grid flex-1 grid-cols-2 gap-3 sm:grid-cols-3">
                  <StatTile label="Target" value={hostFromUrl(resolvedUrl)} hint={scope.length + " categories"} />
                  <StatTile label="Duration" value={status?.durationMs ? `${(status.durationMs / 1000).toFixed(1)}s` : "—"} hint="End-to-end run" />
                  <StatTile label="Categories" value={scope.length} hint="Evaluated" />
                </div>
              </div>
              <div className="mt-6 flex flex-wrap gap-2">
                <Button onClick={() => setLocation(`/audits/${auditId}`)}>
                  Open full audit
                  <ArrowRight className="h-4 w-4" />
                </Button>
                <Button variant="outline" asChild>
                  <a href={`/api/audits/${auditId}/report.pdf`}>
                    <Download className="h-4 w-4" />
                    Download PDF
                  </a>
                </Button>
                <Button
                  variant="ghost"
                  onClick={() => {
                    setAuditId(null);
                    setStep(0);
                  }}
                >
                  <RotateCcw className="h-4 w-4" />
                  Run another
                </Button>
              </div>
            </div>
          )}

          {error && <p className="mt-4 text-[12.5px] font-medium text-[hsl(var(--score-weak))]">{error}</p>}

          {step < 5 && (
            <div className="mt-6 flex items-center justify-between border-t pt-4">
              <Button variant="ghost" onClick={() => setStep((value) => Math.max(0, value - 1))} disabled={step === 0}>
                <ArrowLeft className="h-4 w-4" />
                Back
              </Button>
              <Button onClick={advance} disabled={createAudit.isPending}>
                {step === 4 ? (
                  <>
                    <Play className="h-4 w-4" />
                    {createAudit.isPending ? "Starting…" : "Start audit"}
                  </>
                ) : (
                  <>
                    Continue
                    <ArrowRight className="h-4 w-4" />
                  </>
                )}
              </Button>
            </div>
          )}

          {step === 5 && status?.status === "completed" && (
            <div className="mt-6 flex justify-end border-t pt-4">
              <Button onClick={() => setStep(6)}>
                See results
                <ArrowRight className="h-4 w-4" />
              </Button>
            </div>
          )}

          {step === 5 && status?.status === "failed" && (
            <div className="mt-6 flex justify-end gap-2 border-t pt-4">
              <Button
                variant="outline"
                onClick={() => {
                  setAuditId(null);
                  setStep(1);
                }}
              >
                Change target
              </Button>
              {auditId && (
                <Button asChild variant="ghost">
                  <a href={`/audits/${auditId}`} target="_blank" rel="noreferrer">
                    <ExternalLink className="h-4 w-4" />
                    Open audit log
                  </a>
                </Button>
              )}
            </div>
          )}
        </div>
      </div>
    </AppShell>
  );
}
