import { useMemo, useState } from "react";
import { ScanEye, Search } from "lucide-react";
import { AppShell, PageHeader } from "@/components/app-shell";
import { FindingCard } from "@/components/finding-card";
import { EmptyState, StatTile } from "@/components/ui-bits";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useCatalog, useFindings, useMe, useProjects } from "@/hooks/useApi";
import { SEVERITY_ORDER } from "@/lib/format";

export default function FindingsPage() {
  const { data: findings, isLoading } = useFindings();
  const { data: projects } = useProjects();
  const { data: catalog } = useCatalog();
  const { data: me } = useMe();
  const isDemo = me?.mode === "demo";

  const [query, setQuery] = useState("");
  const [severity, setSeverity] = useState("all");
  const [status, setStatus] = useState("open");
  const [category, setCategory] = useState("all");
  const [projectId, setProjectId] = useState("all");

  const rows = useMemo(() => {
    return (findings ?? [])
      .filter((finding) => (severity === "all" ? true : finding.severity === severity))
      .filter((finding) => (status === "all" ? true : finding.status === status))
      .filter((finding) => (category === "all" ? true : finding.category === category))
      .filter((finding) => (projectId === "all" ? true : finding.projectId === projectId))
      .filter((finding) => (query ? `${finding.title} ${finding.description}`.toLowerCase().includes(query.toLowerCase()) : true))
      .sort((a, b) => SEVERITY_ORDER.indexOf(a.severity) - SEVERITY_ORDER.indexOf(b.severity));
  }, [findings, severity, status, category, projectId, query]);

  const totals = useMemo(() => {
    const all = findings ?? [];
    return {
      total: all.length,
      open: all.filter((finding) => finding.status === "open" || finding.status === "in-review").length,
      resolved: all.filter((finding) => finding.status === "resolved").length,
      critical: all.filter((finding) => (finding.severity === "critical" || finding.severity === "high") && finding.status !== "resolved").length,
    };
  }, [findings]);

  return (
    <AppShell>
      <PageHeader
        eyebrow="Findings"
        title="Every issue across the workspace"
        description="Findings are grouped by severity and carry the evidence that raised them. Status changes are per finding, so resolution progress is visible."
      />

      <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile label="Total findings" value={totals.total} hint="Across all audits" />
        <StatTile label="Open" value={totals.open} hint="Includes in-review" />
        <StatTile label="High & critical" value={totals.critical} tone={totals.critical > 0 ? "critical" : "default"} hint="Unresolved" />
        <StatTile label="Resolved" value={totals.resolved} hint="Marked done" />
      </div>

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search findings"
            className="h-8 w-[210px] pl-8 text-[12.5px]"
          />
        </div>
        <Select value={severity} onValueChange={setSeverity}>
          <SelectTrigger className="h-8 w-[132px] text-[12px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all" className="text-[12.5px]">All severities</SelectItem>
            {SEVERITY_ORDER.map((value) => (
              <SelectItem key={value} value={value} className="text-[12.5px] capitalize">
                {value}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="h-8 w-[128px] text-[12px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all" className="text-[12.5px]">All statuses</SelectItem>
            <SelectItem value="open" className="text-[12.5px]">Open</SelectItem>
            <SelectItem value="in-review" className="text-[12.5px]">In review</SelectItem>
            <SelectItem value="resolved" className="text-[12.5px]">Resolved</SelectItem>
            <SelectItem value="wont-fix" className="text-[12.5px]">Won't fix</SelectItem>
          </SelectContent>
        </Select>
        <Select value={category} onValueChange={setCategory}>
          <SelectTrigger className="h-8 w-[168px] text-[12px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all" className="text-[12.5px]">All categories</SelectItem>
            {(catalog?.categories ?? []).map((entry) => (
              <SelectItem key={entry.key} value={entry.key} className="text-[12.5px]">
                {entry.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={projectId} onValueChange={setProjectId}>
          <SelectTrigger className="h-8 w-[170px] text-[12px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all" className="text-[12.5px]">All projects</SelectItem>
            {(projects ?? []).map((project) => (
              <SelectItem key={project.id} value={project.id} className="text-[12.5px]">
                {project.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <span className="ml-auto text-[11.5px] text-muted-foreground">{rows.length} shown</span>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, index) => (
            <div key={index} className="surface h-[104px] animate-pulse" />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <EmptyState
          icon={<ScanEye className="h-5 w-5" />}
          title="No findings match"
          description={
            totals.total === 0
              ? "Run an audit to generate findings. Each finding includes evidence, impact and a suggested implementation."
              : "Try widening the filters — the default view only shows open items."
          }
        />
      ) : (
        <div className="space-y-2">
          {rows.map((finding) => (
            <FindingCard key={finding.id} finding={finding} readOnly={isDemo} />
          ))}
        </div>
      )}

      {isDemo && (
        <p className="mt-4 text-[11.5px] text-muted-foreground">
          Demo findings are sample content and cannot be modified. Create an account to track resolution progress.
        </p>
      )}
    </AppShell>
  );
}
