import { AppShell, PageHeader } from "@/components/app-shell";
import { SectionHeader } from "@/components/ui-bits";
import { useCatalog } from "@/hooks/useApi";
import { CATEGORY_LABELS, SEVERITY_ORDER } from "@/lib/format";

const SEVERITY_DEFINITIONS: Record<string, { label: string; definition: string; example: string }> = {
  critical: {
    label: "Critical",
    definition: "Blocks a core task for a group of users. Must be fixed before release.",
    example: "Checkout form controls have no accessible names.",
  },
  high: {
    label: "High",
    definition: "Causes significant friction or fails a WCAG AA criterion. Fix in the current cycle.",
    example: "Body text contrast measures 3.1:1 on the card surface.",
  },
  medium: {
    label: "Medium",
    definition: "Noticeable quality problem that slows users down. Schedule in the next two to four weeks.",
    example: "Eleven distinct font sizes within one view.",
  },
  low: {
    label: "Low",
    definition: "Polish item with limited user impact. Batch into a refinement sprint.",
    example: "Spacing values drift from the 4px scale.",
  },
  informational: {
    label: "Informational",
    definition: "Observation worth knowing, not a defect. No action required.",
    example: "Canonical URL not declared on an indexable page.",
  },
};

export default function MethodologyPage() {
  const { data: catalog } = useCatalog();
  const categories = catalog?.categories ?? [];

  return (
    <AppShell>
      <PageHeader
        eyebrow="Methodology"
        title="How DesignLens scores design quality"
        description="A score is only useful if you can see how it was produced. This page documents the model, the checks behind each category, and the limits of automation."
      />

      <div className="grid gap-4 lg:grid-cols-[1.35fr_1fr]">
        <section className="surface p-5">
          <SectionHeader title="The scoring model" />
          <div className="space-y-3 text-[13px] leading-relaxed text-muted-foreground">
            <p>
              Every audit renders the target page in a headless Chromium session, then measures the DOM, computed styles,
              layout geometry and network timing. Checks are derived from those measurements — no value is estimated
              from a screenshot.
            </p>
            <p>
              Each automated check has a weight inside its category and resolves to <strong className="text-foreground">pass</strong>{" "}
              (1.0), <strong className="text-foreground">warning</strong> (0.5), <strong className="text-foreground">fail</strong>{" "}
              (0) or <strong className="text-foreground">not applicable</strong>. A category score is the weighted pass rate of
              the checks that ran:
            </p>
            <pre className="overflow-x-auto rounded-lg bg-foreground px-3.5 py-3 font-mono text-[11.5px] leading-relaxed text-background">
              <code>{`categoryScore = 100 × Σ(weight × statusFactor) / Σ(weight)

overallScore  = Σ(categoryScore × categoryWeight) / Σ(categoryWeight)
              // summed only over evaluated categories`}</code>
            </pre>
            <p>
              Because not-applicable checks leave the denominator, an audit that could not measure something is penalised
              in transparency rather than in score: the category shows as not evaluated instead of guessing.
            </p>
          </div>
        </section>

        <section className="surface p-5">
          <SectionHeader title="Category weights" description="Normalised across the categories in scope." />
          <div className="space-y-2">
            {categories.map((category) => (
              <div key={category.key} className="flex items-center justify-between border-b pb-2 text-[12.5px] last:border-0">
                <span>{category.label}</span>
                <span className="tnum font-semibold">{Math.round(category.weight * 100)}%</span>
              </div>
            ))}
          </div>
          <p className="mt-3 text-[11.5px] leading-relaxed text-muted-foreground">
            Accessibility carries the most weight because failures there exclude users outright. Each project can still
            restrict scope; the weights renormalise so the overall stays on a 0–100 scale.
          </p>
        </section>
      </div>

      <section className="surface mt-4 p-5">
        <SectionHeader
          title="What each category measures"
          description="The checks listed here are the ones the engine currently implements."
        />
        <div className="grid gap-4 md:grid-cols-2">
          {categories.map((category) => (
            <div key={category.key} className="rounded-lg border p-4">
              <div className="flex items-baseline justify-between gap-2">
                <h3 className="text-[13px] font-semibold">{category.label}</h3>
                <span className="tnum text-[11px] text-muted-foreground">{Math.round(category.weight * 100)}%</span>
              </div>
              <p className="mt-1 text-[12px] leading-relaxed text-muted-foreground">{category.description}</p>
              <ul className="mt-2.5 space-y-1">
                {category.checks.map((check) => (
                  <li key={check} className="flex gap-1.5 text-[11.5px] leading-relaxed text-muted-foreground">
                    <span className="mt-[7px] h-1 w-1 shrink-0 rounded-full bg-border" />
                    {check}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </section>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <section className="surface p-5">
          <SectionHeader title="Severity definitions" description="Impact on the user, not effort to fix." />
          <div className="space-y-3">
            {SEVERITY_ORDER.map((severity) => {
              const meta = SEVERITY_DEFINITIONS[severity];
              return (
                <div key={severity}>
                  <div className="flex items-center gap-2">
                    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold sev-${severity}`}>
                      {meta.label}
                    </span>
                  </div>
                  <p className="mt-1 text-[12.5px] leading-relaxed text-muted-foreground">{meta.definition}</p>
                  <p className="mt-0.5 text-[11.5px] italic text-muted-foreground/80">e.g. {meta.example}</p>
                </div>
              );
            })}
          </div>
        </section>

        <div className="space-y-4">
          <section className="surface p-5">
            <SectionHeader title="What automation cannot see" />
            <ul className="space-y-2 text-[12.5px] leading-relaxed text-muted-foreground">
              <li>
                <strong className="text-foreground">Task success.</strong> Whether a flow actually lets people finish is a
                research question. Every audit lists manual prompts rather than inventing a score for it.
              </li>
              <li>
                <strong className="text-foreground">Screen-reader experience.</strong> axe-core validates structure, not the
                quality of the spoken result. A rotating manual prompt covers traversal.
              </li>
              <li>
                <strong className="text-foreground">Brand and visual craft.</strong> Balance, imagery and tone need a designer's
                eye; the engine measures the tokens behind them.
              </li>
              <li>
                <strong className="text-foreground">Authenticated states.</strong> Only publicly reachable URLs are audited,
                so logged-in views are out of scope by design.
              </li>
            </ul>
          </section>

          <section className="surface p-5">
            <SectionHeader title="Data and disclosure" />
            <ul className="space-y-2 text-[12.5px] leading-relaxed text-muted-foreground">
              <li>Findings quote the observed value that raised them, so any result can be re-verified by re-running the audit.</li>
              <li>Re-running an audit creates a new record; previous results are never overwritten, so comparisons stay honest.</li>
              <li>
                The demo workspace is authored sample content, labelled in the interface and excluded from any claim of live
                measurement.
              </li>
              <li>Audit targets are restricted to public http(s) hosts; private network ranges are rejected by the engine.</li>
            </ul>
          </section>
        </div>
      </div>

      <section className="surface mt-4 p-5">
        <SectionHeader title="Exports" description="All three formats are generated from the same stored dataset." />
        <div className="grid gap-3 sm:grid-cols-3">
          {[
            { format: "PDF", detail: "Print-ready A4 report with cover, scores, findings and roadmap." },
            { format: "HTML", detail: "Standalone document you can host or attach without a viewer." },
            { format: "JSON", detail: "Full report model for pipelines, dashboards or archival." },
          ].map((item) => (
            <div key={item.format} className="rounded-lg border p-3.5">
              <div className="text-[12.5px] font-semibold">{item.format}</div>
              <p className="mt-1 text-[11.5px] leading-relaxed text-muted-foreground">{item.detail}</p>
            </div>
          ))}
        </div>
      </section>

      <p className="mt-5 text-[11.5px] text-muted-foreground">
        Category names used across the product: {categories.map((category) => CATEGORY_LABELS[category.key]).join(" · ")}.
      </p>
    </AppShell>
  );
}
