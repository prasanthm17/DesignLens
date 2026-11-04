import { useEffect, useState } from "react";
import { Link, useLocation, useSearch } from "wouter";
import { Archive, ArrowRight, FolderPlus, Plus, Trash2 } from "lucide-react";
import { AppShell, PageHeader } from "@/components/app-shell";
import { EmptyState, ScorePill, SectionHeader } from "@/components/ui-bits";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import { useCatalog, useCreateProject, useMe, useProjects } from "@/hooks/useApi";
import { formatDate, hostFromUrl } from "@/lib/format";
import { cn } from "@/lib/utils";

interface DraftPage {
  name: string;
  url: string;
}

export default function ProjectsPage() {
  const { data: projects, isLoading } = useProjects();
  const { data: catalog } = useCatalog();
  const { data: me } = useMe();
  const createProject = useCreateProject();
  const [, setLocation] = useLocation();
  const search = useSearch();
  const isDemo = me?.mode === "demo";

  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [url, setUrl] = useState("");
  const [type, setType] = useState("saas");
  const [audience, setAudience] = useState("");
  const [industry, setIndustry] = useState("");
  const [priorities, setPriorities] = useState<string[]>(["accessibility", "usability"]);
  const [pages, setPages] = useState<DraftPage[]>([{ name: "", url: "" }]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (search.includes("new=1") && !isDemo) setOpen(true);
  }, [search, isDemo]);

  const reset = () => {
    setName("");
    setDescription("");
    setUrl("");
    setType("saas");
    setAudience("");
    setIndustry("");
    setPriorities(["accessibility", "usability"]);
    setPages([{ name: "", url: "" }]);
    setError(null);
  };

  const submit = async () => {
    setError(null);
    if (name.trim().length < 2) {
      setError("Give the project a name.");
      return;
    }
    try {
      const created = await createProject.mutateAsync({
        name,
        description,
        websiteUrl: url,
        projectType: type,
        targetAudience: audience,
        industry,
        priorities,
        pages: pages.filter((page) => page.url.trim()),
      });
      setOpen(false);
      reset();
      setLocation(`/projects/${created.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create the project");
    }
  };

  const active = (projects ?? []).filter((project) => !project.archived);

  return (
    <AppShell>
      <PageHeader
        eyebrow="Workspace"
        title="Projects"
        description="A project groups the pages of one website or application so audits build up a comparable history."
        actions={
          !isDemo && (
            <Button onClick={() => setOpen(true)} className="h-9">
              <FolderPlus className="h-4 w-4" />
              New project
            </Button>
          )
        }
      />

      {isLoading ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, index) => (
            <div key={index} className="surface h-[176px] animate-pulse" />
          ))}
        </div>
      ) : active.length === 0 ? (
        <EmptyState
          icon={<FolderPlus className="h-5 w-5" />}
          title={isDemo ? "The demo workspace has no projects" : "Create your first project"}
          description="Name the product you want to audit, set the website URL and add the pages you care about. You can start with one page and add more later."
          action={
            !isDemo && (
              <Button onClick={() => setOpen(true)}>
                <Plus className="h-4 w-4" />
                New project
              </Button>
            )
          }
        />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {active.map((project) => (
            <Link key={project.id} href={`/projects/${project.id}`} className="surface surface-hover group block p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="truncate text-[14px] font-semibold tracking-[-0.01em] group-hover:underline">
                    {project.name}
                  </div>
                  <div className="mt-0.5 text-[11.5px] text-muted-foreground">{project.projectTypeLabel}</div>
                </div>
                <ScorePill score={project.latestScore} />
              </div>

              <p className="mt-2.5 line-clamp-2 text-[12.5px] leading-relaxed text-muted-foreground">
                {project.description ?? "No description yet."}
              </p>

              <div className="mt-3 flex items-center gap-1.5 text-[11.5px] text-muted-foreground">
                <span className="truncate">{project.websiteUrl ? hostFromUrl(project.websiteUrl) : "No target URL"}</span>
              </div>

              <div className="mt-3 flex items-center justify-between border-t pt-2.5 text-[11.5px] text-muted-foreground">
                <span>
                  {project.auditCount} audits · {project.pageCount} pages
                </span>
                <span className="flex items-center gap-1">
                  {project.openFindings} open
                  <ArrowRight className="ml-1 h-3 w-3 opacity-0 transition-opacity group-hover:opacity-100" />
                </span>
              </div>
              <div className="mt-1 text-[11px] text-muted-foreground/80">
                Last audited {project.lastAuditedAt ? formatDate(project.lastAuditedAt) : "never"}
              </div>
            </Link>
          ))}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[92vh] max-w-[620px] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>New project</DialogTitle>
            <DialogDescription>
              Projects are industry-agnostic. Describe any website or application and add the pages you want to audit.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3.5">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="project-name" className="text-[12.5px]">
                  Project name
                </Label>
                <Input
                  id="project-name"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  placeholder="Meridian Bank"
                  className="h-9"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-[12.5px]">Project type</Label>
                <Select value={type} onValueChange={setType}>
                  <SelectTrigger className="h-9">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(catalog?.projectTypes ?? []).map((option) => (
                      <SelectItem key={option.key} value={option.key} className="text-[13px]">
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="project-description" className="text-[12.5px]">
                Description
              </Label>
              <Textarea
                id="project-description"
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                placeholder="What the product does, who uses it, and what you want to learn from the audit."
                rows={2}
                className="text-[13px]"
              />
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="project-url" className="text-[12.5px]">
                  Website URL
                </Label>
                <Input
                  id="project-url"
                  value={url}
                  onChange={(event) => setUrl(event.target.value)}
                  placeholder="https://example.com"
                  className="h-9"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="project-industry" className="text-[12.5px]">
                  Industry <span className="text-muted-foreground">(optional)</span>
                </Label>
                <Input
                  id="project-industry"
                  value={industry}
                  onChange={(event) => setIndustry(event.target.value)}
                  placeholder="Financial services"
                  className="h-9"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="project-audience" className="text-[12.5px]">
                Target audience
              </Label>
              <Input
                id="project-audience"
                value={audience}
                onChange={(event) => setAudience(event.target.value)}
                placeholder="Retail customers, including older adults"
                className="h-9"
                list="audience-presets"
              />
              <datalist id="audience-presets">
                {(catalog?.audiences ?? []).map((option) => (
                  <option key={option} value={option} />
                ))}
              </datalist>
            </div>

            <div className="space-y-2">
              <Label className="text-[12.5px]">Audit priorities</Label>
              <div className="flex flex-wrap gap-1.5">
                {(catalog?.categories ?? []).map((category) => {
                  const selected = priorities.includes(category.key);
                  return (
                    <button
                      key={category.key}
                      type="button"
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
                      {category.label}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-[12.5px]">Pages</Label>
                <button
                  type="button"
                  onClick={() => setPages((prev) => [...prev, { name: "", url: "" }])}
                  className="text-[11.5px] font-medium text-accent-foreground hover:underline"
                >
                  Add page
                </button>
              </div>
              {pages.map((page, index) => (
                <div key={index} className="flex items-center gap-2">
                  <Input
                    value={page.name}
                    onChange={(event) =>
                      setPages((prev) => prev.map((item, i) => (i === index ? { ...item, name: event.target.value } : item)))
                    }
                    placeholder="Checkout"
                    className="h-9 w-[38%]"
                  />
                  <Input
                    value={page.url}
                    onChange={(event) =>
                      setPages((prev) => prev.map((item, i) => (i === index ? { ...item, url: event.target.value } : item)))
                    }
                    placeholder="https://example.com/checkout"
                    className="h-9 flex-1"
                  />
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-muted-foreground"
                    onClick={() => setPages((prev) => (prev.length === 1 ? [{ name: "", url: "" }] : prev.filter((_, i) => i !== index)))}
                    aria-label="Remove page"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ))}
              <p className="text-[11px] text-muted-foreground">
                Leave rows empty if you only want the project shell for now.
              </p>
            </div>

            {error && <p className="text-[12.5px] font-medium text-[hsl(var(--score-weak))]">{error}</p>}
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button onClick={submit} disabled={createProject.isPending}>
              {createProject.isPending ? "Creating…" : "Create project"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}
