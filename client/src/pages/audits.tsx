import { useMemo, useState } from "react";
import { Link, useLocation } from "wouter";
import { Download, FileSearch, Plus, Search } from "lucide-react";
import { AppShell, PageHeader } from "@/components/app-shell";
import { EmptyState, ScorePill, StatusPill } from "@/components/ui-bits";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAudits, useMe, useProjects } from "@/hooks/useApi";
import { formatDate, formatDuration, hostFromUrl, truncate } from "@/lib/format";

export default function AuditsPage() {
  const { data: audits, isLoading } = useAudits();
  const { data: projects } = useProjects();
  const { data: me } = useMe();
  const [, setLocation] = useLocation();
  const isDemo = me?.mode === "demo";

  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("all");
  const [projectId, setProjectId] = useState("all");

  const rows = useMemo(() => {
    return (audits ?? [])
      .filter((audit) => (status === "all" ? true : audit.status === status))
      .filter((audit) => (projectId === "all" ? true : audit.projectId === projectId))
      .filter((audit) =>
        query ? `${audit.name} ${audit.targetUrl} ${audit.projectName ?? ""}`.toLowerCase().includes(query.toLowerCase()) : true,
      );
  }, [audits, status, projectId, query]);

  return (
    <AppShell>
      <PageHeader
        eyebrow="Audits"
        title="Every run, in one place"
        description="Each audit is an immutable record of a measurement. Re-running creates a new record so history stays comparable."
        actions={
          !isDemo && (
            <Button className="h-9" onClick={() => setLocation("/audits/new")}>
              <Plus className="h-4 w-4" />
              New audit
            </Button>
          )
        }
      />

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search audits"
            className="h-8 w-[210px] pl-8 text-[12.5px]"
          />
        </div>
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="h-8 w-[136px] text-[12px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all" className="text-[12.5px]">All statuses</SelectItem>
            <SelectItem value="completed" className="text-[12.5px]">Completed</SelectItem>
            <SelectItem value="running" className="text-[12.5px]">Running</SelectItem>
            <SelectItem value="failed" className="text-[12.5px]">Failed</SelectItem>
          </SelectContent>
        </Select>
        <Select value={projectId} onValueChange={setProjectId}>
          <SelectTrigger className="h-8 w-[180px] text-[12px]">
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
        <span className="ml-auto text-[11.5px] text-muted-foreground">{rows.length} audits</span>
      </div>

      {isLoading ? (
        <div className="surface h-[320px] animate-pulse" />
      ) : rows.length === 0 ? (
        <EmptyState
          icon={<FileSearch className="h-5 w-5" />}
          title="No audits match"
          description="Adjust the filters, or run a new audit against one of your project pages."
          action={!isDemo && <Button onClick={() => setLocation("/audits/new")}>New audit</Button>}
        />
      ) : (
        <div className="surface overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-[12.5px]">
              <thead>
                <tr className="border-b text-left text-[10.5px] uppercase tracking-[0.06em] text-muted-foreground">
                  <th className="px-4 py-2.5 font-medium">Audit</th>
                  <th className="px-3 py-2.5 font-medium">Project</th>
                  <th className="px-3 py-2.5 text-right font-medium">Score</th>
                  <th className="px-3 py-2.5 font-medium">Status</th>
                  <th className="px-3 py-2.5 font-medium">Completed</th>
                  <th className="px-3 py-2.5 text-right font-medium">Duration</th>
                  <th className="px-4 py-2.5" />
                </tr>
              </thead>
              <tbody className="divide-y">
                {rows.map((audit) => (
                  <tr key={audit.id} className="group transition-colors hover:bg-muted/40">
                    <td className="px-4 py-3">
                      <Link href={`/audits/${audit.id}`} className="font-medium group-hover:underline">
                        {truncate(audit.name, 46)}
                      </Link>
                      <div className="mt-0.5 text-[11px] text-muted-foreground">
                        {hostFromUrl(audit.targetUrl)}
                        {audit.isSample && " · sample"}
                      </div>
                    </td>
                    <td className="px-3 py-3 text-muted-foreground">{audit.projectName ?? "—"}</td>
                    <td className="px-3 py-3 text-right">
                      <ScorePill score={audit.overallScore} />
                    </td>
                    <td className="px-3 py-3">
                      <StatusPill status={audit.status} />
                    </td>
                    <td className="px-3 py-3 text-muted-foreground">{formatDate(audit.completedAt)}</td>
                    <td className="tnum px-3 py-3 text-right text-muted-foreground">{formatDuration(audit.durationMs)}</td>
                    <td className="px-4 py-3 text-right">
                      {audit.status === "completed" && (
                        <a
                          href={`/api/audits/${audit.id}/report.pdf`}
                          className="inline-flex items-center gap-1 text-[11.5px] text-muted-foreground hover:text-foreground"
                        >
                          <Download className="h-3.5 w-3.5" />
                          PDF
                        </a>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </AppShell>
  );
}
