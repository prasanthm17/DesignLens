import type { AuditCategory, ProjectType, SeverityLevel } from "./schema";

/**
 * Category catalogue shared by the API, the scoring engine and the UI.
 * `weight` drives the overall score (normalised over the categories that
 * were actually evaluated, so a partial audit never pretends to be complete).
 */
export const CATEGORY_META: Record<
  AuditCategory,
  {
    label: string;
    short: string;
    weight: number;
    description: string;
    checks: string[];
  }
> = {
  accessibility: {
    label: "Accessibility",
    short: "A11y",
    weight: 0.24,
    description:
      "WCAG 2.2 conformance signals: colour contrast, names and roles, keyboard access, landmarks, document structure.",
    checks: [
      "axe-core rule engine (WCAG 2.0/2.1/2.2 A–AA tags)",
      "Document language and page title",
      "Image alternative text coverage",
      "Form control labelling",
      "Heading hierarchy",
      "Landmark and skip-link availability",
    ],
  },
  usability: {
    label: "Usability",
    short: "Usability",
    weight: 0.2,
    description:
      "Navigation clarity, focus visibility, interaction affordances, error prevention and control discoverability.",
    checks: [
      "Visible keyboard focus indicators",
      "Ambiguous or non-descriptive link text",
      "Interactive control naming",
      "Form field grouping and required-field signalling",
      "Navigation landmark structure",
      "Primary action prominence",
    ],
  },
  "visual-design": {
    label: "Visual design",
    short: "Visual",
    weight: 0.16,
    description:
      "Typographic hierarchy, spacing rhythm, colour palette discipline and visual balance measured from computed styles.",
    checks: [
      "Typography scale and family count",
      "Body text size and line height",
      "Colour palette breadth",
      "Spacing scale consistency",
      "Visual hierarchy ratio (primary vs body text)",
      "Image aspect-ratio handling",
    ],
  },
  responsive: {
    label: "Responsive",
    short: "Responsive",
    weight: 0.12,
    description:
      "Layout behaviour at mobile, tablet and desktop breakpoints including overflow, tap targets and fluid content.",
    checks: [
      "Horizontal overflow per breakpoint",
      "Viewport meta configuration",
      "Touch target sizing at mobile width",
      "Body text legibility at mobile width",
      "Fixed-width containers wider than the viewport",
      "Responsive image behaviour",
    ],
  },
  content: {
    label: "Content & UX writing",
    short: "Content",
    weight: 0.12,
    description:
      "Readability, scanability, CTA clarity and microcopy quality derived from the rendered text.",
    checks: [
      "Flesch reading ease of body copy",
      "Average sentence length",
      "Call-to-action clarity",
      "Content volume and scanability",
      "Meta description presence",
      "Shouting (all-caps) copy",
    ],
  },
  performance: {
    label: "Performance & technical UX",
    short: "Performance",
    weight: 0.09,
    description:
      "Loading metrics, request weight, DOM size, image delivery and layout-stability risks captured during the audit run.",
    checks: [
      "Document complete and load timing",
      "Request count and transfer weight",
      "DOM node count",
      "Images without intrinsic dimensions (CLS risk)",
      "Lazy-loading coverage for offscreen images",
      "Render-blocking stylesheet count",
    ],
  },
  consistency: {
    label: "Design consistency",
    short: "Consistency",
    weight: 0.07,
    description:
      "Component and token drift: duplicate button styles, radius, shadow, spacing and typography values across the page.",
    checks: [
      "Button variant count",
      "Border-radius token spread",
      "Shadow token spread",
      "Form control height consistency",
      "Repeated one-off spacing values",
      "Optional reference-token conformance",
    ],
  },
};

export const CATEGORY_ORDER: AuditCategory[] = [
  "accessibility",
  "usability",
  "visual-design",
  "responsive",
  "content",
  "performance",
  "consistency",
];

export const SEVERITY_META: Record<
  SeverityLevel,
  { label: string; weight: number; order: number; tone: string }
> = {
  critical: { label: "Critical", weight: 12, order: 0, tone: "critical" },
  high: { label: "High", weight: 7, order: 1, tone: "high" },
  medium: { label: "Medium", weight: 3.5, order: 2, tone: "medium" },
  low: { label: "Low", weight: 1.5, order: 3, tone: "low" },
  informational: { label: "Informational", weight: 0.5, order: 4, tone: "info" },
};

export const PROJECT_TYPE_LABELS: Record<ProjectType, string> = {
  "e-commerce": "E-commerce website",
  banking: "Banking dashboard",
  healthcare: "Healthcare application",
  saas: "SaaS analytics platform",
  travel: "Travel booking website",
  education: "Education platform",
  portfolio: "Personal portfolio",
  "mobile-app": "Mobile application prototype",
  "marketing-site": "Marketing website",
  "internal-tool": "Internal tool",
  other: "Other",
};

export const AUDIENCE_PRESETS = [
  "General public",
  "Professional users",
  "Technical users",
  "Older adults / accessibility-focused",
  "Mobile-first consumers",
  "Enterprise administrators",
];

export const VIEWPORT_META = {
  desktop: { label: "Desktop", width: 1440, height: 900, scale: 1 },
  tablet: { label: "Tablet", width: 834, height: 1112, scale: 1 },
  mobile: { label: "Mobile", width: 390, height: 844, scale: 2 },
} as const;

export const METHODOLOGY_NOTES = [
  "Scores are produced from measurements taken on the rendered page. Nothing is estimated from a screenshot or invented.",
  "Each category score is the weighted pass rate of the checks that ran for that category. Checks that could not run are marked not-applicable and excluded from the denominator.",
  "The overall score is the weight-normalised mean of the categories that were actually evaluated, so a single-category audit cannot outrank a full audit by omission.",
  "Automated checks are labelled Automated. Items requiring human judgement are surfaced separately as manual review prompts and never contribute to the score.",
  "Findings quote the observed value that triggered them so any result can be re-verified.",
];

export function categoryLabel(category: string): string {
  return CATEGORY_META[category as AuditCategory]?.label ?? category;
}

export function overallWeights(categories: AuditCategory[]): Record<string, number> {
  const total = categories.reduce((sum, c) => sum + CATEGORY_META[c].weight, 0) || 1;
  return Object.fromEntries(categories.map((c) => [c, CATEGORY_META[c].weight / total]));
}
