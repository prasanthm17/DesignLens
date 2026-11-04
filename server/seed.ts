import { eq } from "drizzle-orm";
import { db } from "./db";
import { audits, findings, pages, projects, workspaces, type Workspace } from "@shared/schema";
import { CATEGORY_ORDER } from "@shared/catalog";
import type { AuditCategory, SeverityLevel } from "@shared/schema";

/* ------------------------------------------------------------------ *
 * Demo workspace.
 *
 * The demo dataset is authored, clearly labelled sample content. It never
 * mixes with a user workspace and it is never presented as a live capture —
 * every seeded audit carries isSample = true and the UI badges it.
 * ------------------------------------------------------------------ */

interface SeedProject {
  slug: string;
  name: string;
  description: string;
  type: string;
  industry: string;
  audience: string;
  url: string | null;
  objectives: string[];
  priorities: AuditCategory[];
  pages: Array<{ name: string; url: string; notes?: string }>;
  rounds: number;
  baseScore: number;
  step: number;
}

const SEED_PROJECTS: SeedProject[] = [
  {
    slug: "northwind",
    name: "Northwind Commerce",
    description:
      "Multi-category retail storefront. The team wants to reduce checkout abandonment and make product discovery work on small screens.",
    type: "e-commerce",
    industry: "Retail",
    audience: "Mobile-first shoppers, 25–45",
    url: "https://northwind.example.com",
    objectives: ["Improve checkout completion", "Fix mobile cart layout", "Raise product page accessibility"],
    priorities: ["accessibility", "responsive", "usability"],
    pages: [
      { name: "Homepage", url: "https://northwind.example.com/" },
      { name: "Product listing", url: "https://northwind.example.com/c/women" },
      { name: "Product detail", url: "https://northwind.example.com/p/linen-shirt" },
      { name: "Checkout", url: "https://northwind.example.com/checkout", notes: "Three-step checkout" },
    ],
    rounds: 3,
    baseScore: 52,
    step: 9,
  },
  {
    slug: "meridian",
    name: "Meridian Bank",
    description:
      "Online banking dashboard for retail customers. Regulatory accessibility requirements apply, and the transfer flow is the highest-risk journey.",
    type: "banking",
    industry: "Financial services",
    audience: "Retail banking customers, including older adults",
    url: "https://app.meridian.example",
    objectives: ["Meet WCAG 2.2 AA across core journeys", "Reduce transfer errors", "Clarify data density"],
    priorities: ["accessibility", "usability", "visual-design"],
    pages: [
      { name: "Account overview", url: "https://app.meridian.example/accounts" },
      { name: "Transfer flow", url: "https://app.meridian.example/transfer" },
    ],
    rounds: 3,
    baseScore: 61,
    step: 7,
  },
  {
    slug: "careloop",
    name: "CareLoop",
    description:
      "Patient-facing appointment booking. The booking form is long, and the team suspects users abandon when validation errors appear.",
    type: "healthcare",
    industry: "Healthcare",
    audience: "Patients of all ages, often on mobile",
    url: "https://careloop.example",
    objectives: ["Simplify appointment booking", "Improve form error messaging", "Support keyboard-only users"],
    priorities: ["usability", "accessibility", "content"],
    pages: [
      { name: "Portal home", url: "https://careloop.example/" },
      { name: "Appointment booking", url: "https://careloop.example/book" },
    ],
    rounds: 2,
    baseScore: 58,
    step: 8,
  },
  {
    slug: "pulse",
    name: "Pulse Analytics",
    description:
      "B2B analytics product. Dashboards are dense, and the design system has drifted after a rapid feature push.",
    type: "saas",
    industry: "Software",
    audience: "Data analysts and product managers",
    url: "https://app.pulse.example",
    objectives: ["Re-establish design-system consistency", "Improve dashboard scannability"],
    priorities: ["consistency", "visual-design", "performance"],
    pages: [
      { name: "Overview dashboard", url: "https://app.pulse.example/dashboard" },
      { name: "Report builder", url: "https://app.pulse.example/reports/new" },
    ],
    rounds: 3,
    baseScore: 64,
    step: 6,
  },
  {
    slug: "wanderly",
    name: "Wanderly",
    description:
      "Travel search and booking. Search results are heavy, and page weight is the main complaint from the performance team.",
    type: "travel",
    industry: "Travel",
    audience: "Leisure travellers booking on mobile",
    url: "https://wanderly.example",
    objectives: ["Cut page weight on search results", "Improve filter usability"],
    priorities: ["performance", "responsive", "content"],
    pages: [
      { name: "Search results", url: "https://wanderly.example/search?to=LIS" },
      { name: "Booking summary", url: "https://wanderly.example/checkout" },
    ],
    rounds: 2,
    baseScore: 49,
    step: 11,
  },
  {
    slug: "lumen",
    name: "Lumen Academy",
    description:
      "Course platform with a public catalogue and a lesson player. Readability and content structure are the open questions.",
    type: "education",
    industry: "Education",
    audience: "Adult learners studying part-time",
    url: "https://academy.example",
    objectives: ["Improve catalogue readability", "Make lessons work offline on mobile"],
    priorities: ["content", "responsive", "usability"],
    pages: [
      { name: "Course catalogue", url: "https://academy.example/courses" },
      { name: "Lesson player", url: "https://academy.example/lesson/42" },
    ],
    rounds: 2,
    baseScore: 66,
    step: 5,
  },
  {
    slug: "portfolio",
    name: "Ana Reyes — Portfolio",
    description:
      "Personal design portfolio. Single-page site, heavy on imagery, used for freelance enquiries.",
    type: "portfolio",
    industry: "Design",
    audience: "Hiring managers and prospective clients",
    url: "https://ana.example",
    objectives: ["Make case studies scannable", "Keep the site fast on 4G"],
    priorities: ["performance", "visual-design", "content"],
    pages: [{ name: "Home", url: "https://ana.example/" }],
    rounds: 2,
    baseScore: 72,
    step: 4,
  },
  {
    slug: "orbit",
    name: "Orbit Mobile",
    description:
      "Prototype of a habit-tracking mobile app, reviewed before the first public beta. Touch targets and onboarding copy are under review.",
    type: "mobile-app",
    industry: "Consumer mobile",
    audience: "Habit-tracker users, 18–34",
    url: null,
    objectives: ["Validate touch targets", "Tighten onboarding microcopy"],
    priorities: ["responsive", "usability", "content"],
    pages: [{ name: "Onboarding", url: "https://orbit.example/prototype/onboarding" }],
    rounds: 1,
    baseScore: 68,
    step: 0,
  },
];

interface FindingTemplate {
  category: AuditCategory;
  severity: SeverityLevel;
  title: string;
  description: string;
  evidence: string;
  whyItMatters: string;
  recommendation: string;
  implementation: string;
  wcag?: string;
}

const FINDING_POOL: FindingTemplate[] = [
  {
    category: "accessibility",
    severity: "critical",
    title: "Product images are missing alternative text",
    description: "Product thumbnails in the listing grid expose no alt text, so the catalogue is unusable with a screen reader.",
    evidence: "18 of 24 img elements in the product grid have alt=\"\" without a decorative role",
    whyItMatters: "Screen reader users cannot distinguish products, which blocks the primary shopping task entirely.",
    recommendation: "Write alt text from the product name plus the distinguishing attribute.",
    implementation: '<img src="shirt.jpg" alt="Linen shirt, sand — front view" />',
    wcag: "WCAG 2.2 SC 1.1.1 Non-text Content",
  },
  {
    category: "accessibility",
    severity: "high",
    title: "Muted text fails contrast on the surface background",
    description: "Secondary metadata uses a grey that falls below the 4.5:1 minimum against the card background.",
    evidence: "Measured 3.1:1 for #8A94A6 on #FFFFFF at 13px",
    whyItMatters: "Low-contrast metadata disappears for users with low vision and in bright outdoor light.",
    recommendation: "Darken the muted token until it reaches at least 4.5:1, or raise its weight and size.",
    implementation: "Replace text-slate-400 with text-slate-600 on white surfaces (#475569 ≈ 7.5:1).",
    wcag: "WCAG 2.2 SC 1.4.3 Contrast (Minimum)",
  },
  {
    category: "accessibility",
    severity: "high",
    title: "Focus indicator is removed on custom controls",
    description: "Segmented controls and filter chips suppress the outline, leaving keyboard users without a position marker.",
    evidence: "outline: none declared with no replacement on 6 components",
    whyItMatters: "Keyboard and switch users cannot tell which control will activate.",
    recommendation: "Add a visible focus ring using :focus-visible and never remove the outline without a replacement.",
    implementation: ":focus-visible { outline: 2px solid var(--ring); outline-offset: 2px; }",
    wcag: "WCAG 2.2 SC 2.4.7 Focus Visible",
  },
  {
    category: "accessibility",
    severity: "medium",
    title: "Form fields rely on placeholder text as the only label",
    description: "The checkout form uses placeholders instead of persistent labels, so context disappears once typing starts.",
    evidence: "4 inputs with placeholder and no label or aria-label",
    whyItMatters: "Placeholders vanish on input, which increases errors and breaks screen reader identification.",
    recommendation: "Use persistent visible labels above each field and keep the placeholder for format hints only.",
    implementation: '<label for="card">Card number</label><input id="card" inputMode="numeric" placeholder="1234 5678 9012 3456" />',
    wcag: "WCAG 2.2 SC 3.3.2 Labels or Instructions",
  },
  {
    category: "accessibility",
    severity: "medium",
    title: "Heading hierarchy skips from h2 to h5 in the sidebar",
    description: "Filter group titles are marked up as h5 beneath an h2, breaking the outline.",
    evidence: "Heading sequence: h1 → h2 → h5 → h5 → h5",
    whyItMatters: "Screen reader users navigate by heading level, and gaps make the structure misleading.",
    recommendation: "Keep levels sequential and use CSS for visual size.",
    implementation: "Promote filter titles to h3 and style them with text-xs uppercase tracking-wide.",
    wcag: "WCAG 2.2 SC 1.3.1 Info and Relationships",
  },
  {
    category: "usability",
    severity: "high",
    title: "Primary action competes with three equally weighted buttons",
    description: "Checkout shows four filled buttons of identical weight, so users cannot identify the next step.",
    evidence: "4 filled buttons in one action row with identical background and weight",
    whyItMatters: "Without a clear primary action, decision time rises and abandonment follows.",
    recommendation: "Keep one filled primary action per view and demote the rest to outline or ghost.",
    implementation: '<Button>Place order</Button> <Button variant="outline">Save for later</Button>',
  },
  {
    category: "usability",
    severity: "medium",
    title: "Non-descriptive link text in the footer",
    description: "The footer repeats 'Learn more' links pointing to six different destinations.",
    evidence: "6 links with the label 'Learn more', 6 distinct hrefs",
    whyItMatters: "Link lists read out of context become indistinguishable for screen reader and keyboard users.",
    recommendation: "Name the destination in each link, or add aria-describedby context.",
    implementation: '"Learn more about delivery times" instead of "Learn more".',
  },
  {
    category: "usability",
    severity: "medium",
    title: "Search filters reset without confirmation",
    description: "Applying a filter reloads the list and clears previously selected facets, silently.",
    evidence: "Facet state is not preserved across filter changes; no feedback message shown",
    whyItMatters: "Silent state loss forces repeated work and erodes trust in the interface.",
    recommendation: "Preserve facet state across filter changes and announce list updates with an aria-live region.",
    implementation: '<div role="status" aria-live="polite">24 results for Linen, size M</div>',
  },
  {
    category: "usability",
    severity: "low",
    title: "No skip link before the navigation",
    description: "Keyboard users must tab through 23 navigation items on every page load.",
    evidence: "0 skip links detected before the primary nav",
    whyItMatters: "Repeated tabbing is a significant tax on keyboard-only users.",
    recommendation: "Add a skip-to-content link as the first focusable element.",
    implementation: '<a href="#main" class="sr-only focus:not-sr-only">Skip to content</a>',
  },
  {
    category: "visual-design",
    severity: "medium",
    title: "Type scale has drifted to eleven sizes",
    description: "Eleven distinct font sizes appear on one view, several differing by a single pixel.",
    evidence: "11 distinct font sizes: 11,12,13,14,15,16,17,20,22,26,32px",
    whyItMatters: "Near-duplicate sizes destroy hierarchy: users cannot tell which level they are reading.",
    recommendation: "Collapse onto a fixed scale and map every text style to a token.",
    implementation: "12 / 14 / 16 / 20 / 24 / 32px with --text-xs…--text-3xl tokens.",
  },
  {
    category: "visual-design",
    severity: "medium",
    title: "Body copy sits at 13px with tight leading",
    description: "Dense table descriptions render at 13px with a 1.25 line-height ratio.",
    evidence: "Median body size 13px, median line-height ratio 1.25",
    whyItMatters: "Small, tightly set text increases reading fatigue and zoom dependency.",
    recommendation: "Raise body text to 16px and leading to 1.5.",
    implementation: "body { font-size: 1rem; line-height: 1.5; }",
  },
  {
    category: "visual-design",
    severity: "low",
    title: "Spacing values are used ad-hoc",
    description: "Twenty-three distinct padding values appear, breaking the vertical rhythm between cards.",
    evidence: "23 distinct padding values; 7 are not multiples of 4px",
    whyItMatters: "Uneven spacing makes related content look unrelated.",
    recommendation: "Snap all spacing to a 4px scale backed by tokens.",
    implementation: "gap-1…gap-8 utilities; ban raw pixel padding in components.",
  },
  {
    category: "responsive",
    severity: "critical",
    title: "Checkout overflows horizontally on mobile",
    description: "The order summary table forces a 430px page width inside a 390px viewport.",
    evidence: "scrollWidth 430px vs innerWidth 390px (+40px) at 390px viewport",
    whyItMatters: "Sideways scrolling hides the pay button and causes mis-taps at the highest-intent moment.",
    recommendation: "Let the summary reflow to stacked rows below 640px and constrain table widths.",
    implementation: "table { width: 100%; } @media (max-width: 640px) { .summary-row { display: grid; grid-template-columns: 1fr auto; } }",
  },
  {
    category: "responsive",
    severity: "high",
    title: "Touch targets below 32px in the filter bar",
    description: "Filter chips are 28px tall at mobile width, under the comfortable tapping threshold.",
    evidence: "9 controls measured between 26 and 30px in height at 390px viewport",
    whyItMatters: "Small targets cause mis-taps and fail WCAG 2.2 SC 2.5.8 at the 24px minimum in edge cases.",
    recommendation: "Grow the hit area to at least 44px without enlarging the visual chip.",
    implementation: ".chip::after { content: ''; position: absolute; inset: -8px; }",
    wcag: "WCAG 2.2 SC 2.5.8 Target Size (Minimum)",
  },
  {
    category: "responsive",
    severity: "medium",
    title: "Hero image keeps a fixed 1200px width",
    description: "A fixed-width hero is wider than the mobile viewport and forces layout overflow.",
    evidence: "img width=1200 with no max-width at 390px viewport",
    whyItMatters: "Fixed media is the most common cause of mobile horizontal scroll.",
    recommendation: "Make media fluid and supply responsive sources.",
    implementation: '<img srcset="hero-640.jpg 640w, hero-1280.jpg 1280w" sizes="100vw" style="max-width:100%;height:auto" />',
  },
  {
    category: "content",
    severity: "medium",
    title: "Product descriptions are dense and hard to scan",
    description: "Descriptions run 34 words per sentence on average with no subheadings.",
    evidence: "Flesch reading ease 38, average sentence length 34 words",
    whyItMatters: "Dense copy is skipped; users miss the specification details they need to decide.",
    recommendation: "Break descriptions into a short summary plus scannable specification list.",
    implementation: "Two-sentence summary, then a definition list of material, fit and care.",
  },
  {
    category: "content",
    severity: "low",
    title: "Calls to action are generic",
    description: "Secondary CTAs read 'Submit' and 'Continue' without stating the outcome.",
    evidence: "3 action labels with no outcome noun",
    whyItMatters: "Outcome-oriented labels reduce hesitation and improve completion.",
    recommendation: "Name the result of the action.",
    implementation: '"Create account", "Reserve these dates", "Download the invoice".',
  },
  {
    category: "performance",
    severity: "high",
    title: "Search results transfer 6.4 MB",
    description: "Unoptimised hero imagery and three icon fonts dominate the payload.",
    evidence: "6.4 MB transferred across 148 requests; load event at 4,820ms",
    whyItMatters: "Heavy pages are slow and expensive on mobile data, and directly cost conversions.",
    recommendation: "Convert imagery to AVIF/WebP at responsive sizes and replace icon fonts with inline SVG.",
    implementation: '<picture><source type="image/avif" srcset="hero.avif" /><img src="hero.jpg" alt="" /></picture>',
  },
  {
    category: "performance",
    severity: "medium",
    title: "Images are not dimensioned, causing layout shift",
    description: "Gallery images render without width and height, so content jumps as they load.",
    evidence: "12 of 18 images without intrinsic dimensions",
    whyItMatters: "Unsized media is the largest single cause of cumulative layout shift and mis-taps.",
    recommendation: "Declare width and height, or set an aspect ratio.",
    implementation: '<img width="640" height="480" style="max-width:100%;height:auto" />',
  },
  {
    category: "consistency",
    severity: "medium",
    title: "Six distinct button treatments",
    description: "Buttons differ in radius, height and background across the dashboard modules.",
    evidence: "6 distinct background colours and 4 heights across 24 buttons",
    whyItMatters: "Variant sprawl flattens action hierarchy and doubles maintenance cost.",
    recommendation: "Consolidate to primary, secondary, ghost and destructive variants.",
    implementation: "Extend the button variant map once and replace ad-hoc overrides at call sites.",
  },
  {
    category: "consistency",
    severity: "low",
    title: "Border radius is inconsistent across cards",
    description: "Cards use 4, 6, 8 and 12px radii in the same grid.",
    evidence: "4 distinct radius values among sibling cards",
    whyItMatters: "Radius is a strong signal of component family; mixing it makes the grid look assembled.",
    recommendation: "Pick two radii and expose them as tokens.",
    implementation: "--radius: 8px; --radius-lg: 12px;",
  },
];

const CATEGORY_CHECKS: Record<AuditCategory, number> = {
  accessibility: 11,
  usability: 8,
  "visual-design": 8,
  responsive: 7,
  content: 7,
  performance: 8,
  consistency: 6,
};

function scoreCategories(base: number, seed: number): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  CATEGORY_ORDER.forEach((category, index) => {
    const jitter = ((seed + index * 7) % 13) - 6;
    const score = Math.max(18, Math.min(98, base + jitter));
    result[category] = {
      category,
      score,
      passedWeight: Math.round((score / 100) * 10 * 100) / 100,
      totalWeight: 10,
      automatedChecks: CATEGORY_CHECKS[category],
      manualChecks: 2,
      checks: [],
      findings: 0,
    };
  });
  return result;
}

function pickFindings(base: number, seed: number, categories: AuditCategory[]): FindingTemplate[] {
  const pool = FINDING_POOL.filter((template) => categories.includes(template.category));
  const count = base < 55 ? 8 : base < 68 ? 6 : base < 80 ? 4 : 3;
  const picked: FindingTemplate[] = [];
  for (let index = 0; index < count && pool.length > 0; index += 1) {
    const candidate = pool[(seed * 3 + index * 5) % pool.length];
    if (!picked.includes(candidate)) picked.push(candidate);
  }
  return picked;
}

export async function ensureDemoWorkspace(): Promise<Workspace> {
  const existing = await db.select().from(workspaces).where(eq(workspaces.isDemo, true)).limit(1);
  if (existing[0]) return existing[0];

  const created = await db
    .insert(workspaces)
    .values({
      name: "DesignLens demo workspace",
      description:
        "Illustrative sample data for exploring DesignLens. Audits here are authored examples, not live captures, and the workspace is read-only.",
      isDemo: true,
    })
    .returning();

  const workspace = created[0];
  const now = Date.now();
  const day = 86_400_000;

  for (const [projectIndex, seedProject] of SEED_PROJECTS.entries()) {
    const project = (
      await db
        .insert(projects)
        .values({
          workspaceId: workspace.id,
          name: seedProject.name,
          description: seedProject.description,
          websiteUrl: seedProject.url,
          projectType: seedProject.type,
          industry: seedProject.industry,
          targetAudience: seedProject.audience,
          objectives: JSON.stringify(seedProject.objectives),
          priorities: JSON.stringify(seedProject.priorities),
          createdAt: new Date(now - (140 - projectIndex * 6) * day),
          updatedAt: new Date(now - (projectIndex * 2 + 1) * day),
        })
        .returning()
    )[0];

    const createdPages = [];
    for (const [pageIndex, page] of seedProject.pages.entries()) {
      createdPages.push(
        (
          await db
            .insert(pages)
            .values({
              projectId: project.id,
              name: page.name,
              url: page.url,
              notes: page.notes ?? null,
              sortOrder: pageIndex,
            })
            .returning()
        )[0],
      );
    }

    let previousOverall: number | null = null;
    let previousAuditId: string | null = null;

    for (let round = 0; round < seedProject.rounds; round += 1) {
      const page = createdPages[round % createdPages.length];
      const base = seedProject.baseScore + round * seedProject.step;
      const completedAt = new Date(now - (seedProject.rounds - round) * 26 * day - projectIndex * day);
      const categoryScores = scoreCategories(base, projectIndex + round);

      const audit = (
        await db
          .insert(audits)
          .values({
            projectId: project.id,
            pageId: page.id,
            name: `${page.name} · ${round === seedProject.rounds - 1 ? "Follow-up" : "Baseline"} audit`,
            description:
              round === seedProject.rounds - 1
                ? "Latest review following the remediation sprint."
                : "Scheduled review of the current build.",
            targetUrl: page.url,
            status: "completed",
            scope: JSON.stringify(["accessibility", "usability", "visual-design", "responsive", "content", "performance", "consistency"]),
            context: JSON.stringify({
              targetAudience: seedProject.audience,
              objectives: seedProject.objectives,
              priorities: seedProject.priorities,
              viewport: "all",
            }),
            categoryScores: JSON.stringify(categoryScores),
            metrics: JSON.stringify({
              finalUrl: page.url,
              pageTitle: page.name,
              counts: { headings: 18, images: 24, links: 63, buttons: 21, inputs: 7, forms: 1, landmarks: 4, focusables: 71, paragraphs: 22 },
              performance: { loadEventMs: 2400 - round * 260, domContentLoadedMs: 1500 - round * 180, requestCount: 96 - round * 9, transferKb: 3100 - round * 420, domNodes: 1420, renderBlockingStylesheets: 3 },
              readability: { words: 820, sentences: 41, fleschReadingEase: 46 + round * 4, averageSentenceLength: 20 },
              responsive: [
                { preset: "desktop", width: 1440, overflow: false, overflowPx: 0 },
                { preset: "tablet", width: 834, overflow: round === 0, overflowPx: round === 0 ? 22 : 0 },
                { preset: "mobile", width: 390, overflow: round === 0, overflowPx: round === 0 ? 40 : 0 },
              ],
            }),
            stages: JSON.stringify([
              { key: "resolve", label: "Resolve target and scope", status: "done", durationMs: 12 },
              { key: "navigate", label: "Load target page", status: "done", durationMs: 2140 },
              { key: "capture", label: "Capture structure, styles and screenshot", status: "done", durationMs: 880 },
              { key: "axe", label: "Run accessibility rule engine", status: "done", durationMs: 960 },
              { key: "responsive", label: "Measure responsive breakpoints", status: "done", durationMs: 1740 },
              { key: "analyse", label: "Evaluate audit categories", status: "done", durationMs: 40 },
              { key: "findings", label: "Generate findings and recommendations", status: "done", durationMs: 60 },
              { key: "score", label: "Calculate design quality score", status: "done", durationMs: 4 },
              { key: "compare", label: "Compare with previous audit", status: "done", durationMs: 18 },
              { key: "report", label: "Prepare audit report", status: "done", durationMs: 26 },
            ]),
            overallScore: base,
            isSample: true,
            startedAt: new Date(completedAt.getTime() - 5_800),
            completedAt,
            createdAt: new Date(completedAt.getTime() - 6_000),
          })
          .returning()
      )[0];

      const templates = pickFindings(base, projectIndex + round, ["accessibility", "usability", "visual-design", "responsive", "content", "performance", "consistency"]);
      if (templates.length) {
        await db.insert(findings).values(
          templates.map((template, index) => ({
            auditId: audit.id,
            projectId: project.id,
            title: template.title,
            description: template.description,
            category: template.category,
            severity: template.severity,
            status:
              round < seedProject.rounds - 1 && index % 3 === 0
                ? ("resolved" as const)
                : index % 7 === 1
                  ? ("in-review" as const)
                  : ("open" as const),
            detection: "automated" as const,
            evidence: template.evidence,
            whyItMatters: template.whyItMatters,
            recommendation: template.recommendation,
            implementation: template.implementation,
            pageUrl: page.url,
            wcagCriterion: template.wcag ?? null,
            affectedCount: null,
            createdAt: new Date(completedAt.getTime() + index * 1000),
            updatedAt: new Date(completedAt.getTime() + index * 1000),
          })),
        );
      }

      // Give each follow-up audit a comparison against the previous round so the
      // dashboard trend and the report comparison section have real history.
      if (previousOverall !== null) {
        const categories = Object.entries(categoryScores).map(([category, value]) => {
          const current = (value as { score: number }).score;
          const before = Math.max(10, current - Math.round(seedProject.step * 0.8));
          return { category, current, previous: before, delta: current - before };
        });
        await db
          .update(audits)
          .set({
            comparison: JSON.stringify({
              previousAuditId,
              previousAuditName: `${page.name} · Baseline audit`,
              previousCompletedAt: completedAt,
              previousScore: previousOverall,
              currentScore: base,
              delta: base - previousOverall,
              categories,
            }),
          })
          .where(eq(audits.id, audit.id));
      }

      previousOverall = base;
      previousAuditId = audit.id;
    }
  }

  return workspace;
}
