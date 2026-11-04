import { CATEGORY_META } from "@shared/catalog";
import type { AuditCategory, SeverityLevel } from "@shared/schema";
import { auditCategories } from "@shared/schema";
import type { AuditCheck, FindingDraft } from "../lib/scoring";
import { severityForWeight } from "../lib/scoring";
import {
  average,
  distinctValues,
  median,
  parsePx,
  readability,
  round,
  tokenConsistency,
  formatBytes,
} from "../lib/signals";
import type { PageCapture, ResponsiveSnapshot } from "./capture";

export interface ReferenceTokens {
  colors?: string[];
  fontSizes?: number[];
  radius?: string[];
  spacing?: string[];
  fontFamilies?: string[];
}

interface CheckInput {
  id: string;
  label: string;
  category: AuditCategory;
  status: AuditCheck["status"];
  weight: number;
  observed: string;
  expected: string;
  detection?: "automated" | "manual";
  severity?: SeverityLevel;
  finding?: Omit<FindingDraft, "category" | "severity"> & { severity?: SeverityLevel };
}

function check(input: CheckInput): AuditCheck {
  const detection = input.detection ?? "automated";
  const severity = input.severity ?? severityForWeight(input.weight);
  const finding: FindingDraft | undefined =
    input.finding && detection === "automated"
      ? {
          ...input.finding,
          category: input.category,
          severity: input.finding.severity ?? severity,
        }
      : undefined;

  return {
    id: input.id,
    label: input.label,
    category: input.category,
    status: input.status,
    weight: input.weight,
    observed: input.observed,
    expected: input.expected,
    detection,
    finding,
  };
}

const AMBIGUOUS_LINK = /^(click here|here|read more|more|learn more|this link|link|details|see more|view|more info|find out more)$/i;
const GENERIC_CTA = /^(submit|click|go|ok|next|continue|send|done)$/i;
const CTA_WORDS = /(start|get|try|book|buy|subscribe|download|contact|request|create|sign up|log in|open|explore|compare|add to|checkout|apply|register)/i;

export interface CheckBuildResult {
  checks: AuditCheck[];
  referenceApplied: boolean;
}

export function buildChecks(
  capture: PageCapture,
  scope: AuditCategory[],
  options: { referenceTokens?: ReferenceTokens | null } = {},
): CheckBuildResult {
  const selected = new Set(scope);
  const checks: AuditCheck[] = [];

  if (selected.has("accessibility")) checks.push(...accessibilityChecks(capture));
  if (selected.has("usability")) checks.push(...usabilityChecks(capture));
  if (selected.has("visual-design")) checks.push(...visualDesignChecks(capture));
  if (selected.has("responsive")) checks.push(...responsiveChecks(capture));
  if (selected.has("content")) checks.push(...contentChecks(capture));
  if (selected.has("performance")) checks.push(...performanceChecks(capture));
  if (selected.has("consistency")) checks.push(...consistencyChecks(capture, options.referenceTokens ?? null));

  return { checks, referenceApplied: Boolean(options.referenceTokens) };
}

/* --------------------------- accessibility ------------------------- */

function accessibilityChecks(capture: PageCapture): AuditCheck[] {
  const { dom, axe } = capture;
  const checks: AuditCheck[] = [];
  const serious = axe.filter((violation) => violation.impact === "critical" || violation.impact === "serious");
  const moderate = axe.filter((violation) => violation.impact === "moderate" || violation.impact === "minor");

  if (axe.length === 0) {
    checks.push(
      check({
        id: "axe-clean",
        label: "axe-core WCAG 2.2 rule scan",
        category: "accessibility",
        status: "pass",
        weight: 6,
        observed: "0 rule violations across WCAG 2.0/2.1/2.2 A–AA and best-practice tags",
        expected: "0 violations",
      }),
    );
  } else {
    checks.push(
      check({
        id: "axe-clean",
        label: "axe-core WCAG 2.2 rule scan",
        category: "accessibility",
        status: serious.length > 0 ? "fail" : "warn",
        weight: 6,
        observed: `${axe.length} rule violation${axe.length === 1 ? "" : "s"} (${serious.length} critical/serious, ${moderate.length} moderate/minor) affecting ${axe.reduce((sum, v) => sum + v.nodes, 0)} elements`,
        expected: "0 violations",
        severity: serious.length > 0 ? "critical" : "medium",
        finding: {
          title: serious.length > 0 ? "Critical WCAG rule violations detected" : "Moderate WCAG rule violations detected",
          description: `axe-core flagged ${axe.length} rules on the page: ${axe
            .slice(0, 6)
            .map((violation) => `${violation.id} (${violation.nodes} element${violation.nodes === 1 ? "" : "s"})`)
            .join(", ")}.`,
          evidence: axe
            .slice(0, 6)
            .map((violation) => `${violation.id}: ${violation.help} — ${violation.nodes} node(s)`)
            .join(" · "),
          whyItMatters:
            "These failures block assistive-technology users outright: unlabeled controls, missing names, invalid ARIA or contrast failures.",
          recommendation:
            "Work through the rule violations in descending impact order, starting with name/role/value and contrast failures.",
          implementation:
            "Each violation links to a remediation pattern (helpUrl). Where a rule is a false positive for your component, mark the element with the documented ARIA override rather than disabling the rule.",
          affectedCount: axe.reduce((sum, violation) => sum + violation.nodes, 0),
        },
      }),
    );
  }

  checks.push(
    check({
      id: "doc-lang",
      label: "Document language declared",
      category: "accessibility",
      status: dom.lang ? "pass" : "fail",
      weight: 2,
      observed: dom.lang ? `<html lang="${dom.lang}">` : "no lang attribute on <html>",
      expected: "A valid BCP-47 language tag",
      finding: {
        title: "Page language is not declared",
        description: "The root html element has no lang attribute, so screen readers fall back to the OS voice.",
        evidence: "document.documentElement.lang is empty",
        whyItMatters: "Screen readers pronounce content with the wrong phoneme set, which makes long pages hard to follow.",
        recommendation: "Add a lang attribute that matches the page's primary language.",
        implementation: '<html lang="en"> — switch per-locale route, e.g. lang="de" for German pages.',
      },
    }),
  );

  checks.push(
    check({
      id: "page-title",
      label: "Page has a descriptive title",
      category: "accessibility",
      status: dom.title ? (dom.title.length >= 10 ? "pass" : "warn") : "fail",
      weight: 2,
      observed: dom.title ? `"${dom.title}" (${dom.title.length} chars)` : "empty document title",
      expected: "A unique title of at least 10 characters",
    }),
  );

  const informativeImages = dom.images.filter((image) => image.role !== "presentation" && image.role !== "none");
  const missingAlt = informativeImages.filter((image) => !image.alt?.trim() && !image.ariaLabel?.trim());
  const decorative = dom.images.filter((image) => image.alt === "");

  checks.push(
    check({
      id: "image-alt",
      label: "Images have alternative text",
      category: "accessibility",
      status: dom.images.length === 0 ? "na" : missingAlt.length === 0 ? "pass" : missingAlt.length / dom.images.length > 0.2 ? "fail" : "warn",
      weight: 3,
      observed:
        dom.images.length === 0
          ? "no images found on the page"
          : `${missingAlt.length} of ${dom.images.length} images have no alt text (${decorative.length} declared decorative)`,
      expected: "Every informative image has alt text; decorative images use alt=\"\"",
      finding: {
        title: "Images are missing alternative text",
        description: `${missingAlt.length} image${missingAlt.length === 1 ? "" : "s"} on the page expose neither alt text nor an accessible name.`,
        evidence: `${missingAlt.length}/${dom.images.length} images without alt or aria-label`,
        whyItMatters: "Screen reader users hear the file name or nothing at all, losing the information the image carries.",
        recommendation: "Write alt text that conveys the image's purpose, or mark purely decorative images with an empty alt.",
        implementation: '<img src="/chart.png" alt="Revenue grew 18% between Q1 and Q3" /> for informative images; alt="" for decoration.',
        affectedCount: missingAlt.length,
      },
    }),
  );

  checks.push(
    check({
      id: "form-labels",
      label: "Form controls have accessible names",
      category: "accessibility",
      status: dom.inputsTotal === 0 ? "na" : dom.unlabeledControls.length === 0 ? "pass" : "fail",
      weight: 3,
      observed:
        dom.inputsTotal === 0
          ? "no form controls on the page"
          : `${dom.unlabeledControls.length} of ${dom.inputsTotal} controls without a label, aria-label or aria-labelledby`,
      expected: "0 unnamed controls",
      finding: {
        title: "Form controls lack accessible names",
        description: `${dom.unlabeledControls.length} input${dom.unlabeledControls.length === 1 ? "" : "s"} cannot be identified by assistive technology.`,
        evidence: dom.unlabeledControls
          .slice(0, 5)
          .map((control) => `${control.tag}[type=${control.type}] at ${control.selector}`)
          .join(" · "),
        whyItMatters: "Voice control and screen readers cannot tell the user what to type, and automated form filling fails.",
        recommendation: "Associate every control with a visible <label>, or add aria-label where a visible label is not possible.",
        implementation: '<label for="email">Work email</label><input id="email" type="email" /> — use aria-label only when the design genuinely has no visible label.',
        affectedCount: dom.unlabeledControls.length,
        selector: dom.unlabeledControls[0]?.selector ?? null,
      },
    }),
  );

  const skippedHeading = findSkippedHeading(dom.headings.map((heading) => heading.level));
  checks.push(
    check({
      id: "heading-order",
      label: "Heading hierarchy is sequential",
      category: "accessibility",
      status: dom.headings.length === 0 ? "fail" : skippedHeading ? "warn" : "pass",
      weight: 2,
      observed:
        dom.headings.length === 0
          ? "no headings on the page"
          : skippedHeading
            ? `heading level jumps from h${skippedHeading.from} to h${skippedHeading.to}`
            : `${dom.headings.length} headings with a sequential outline`,
      expected: "No skipped heading levels, exactly one h1",
      finding: skippedHeading
        ? {
            title: "Heading levels skip the document outline",
            description: `A heading jumps from h${skippedHeading.from} to h${skippedHeading.to}, leaving a structural gap.`,
            evidence: `h${skippedHeading.from} → h${skippedHeading.to}`,
            whyItMatters: "Screen reader users navigate by heading level; gaps make the page outline misleading.",
            recommendation: "Use the next heading level down, and style with CSS instead of choosing a level for its size.",
            implementation: "Replace <h4> with <h3> (or add a missing <h2>) and apply a utility class for the visual size.",
          }
        : undefined,
    }),
  );

  checks.push(
    check({
      id: "landmarks",
      label: "Landmark regions present",
      category: "accessibility",
      status: dom.landmarks.main > 0 ? "pass" : "fail",
      weight: 1.5,
      observed: `main:${dom.landmarks.main} nav:${dom.landmarks.nav} header:${dom.landmarks.header} footer:${dom.landmarks.footer} aside:${dom.landmarks.aside}`,
      expected: "One main landmark and navigational landmarks",
      finding: {
        title: "No main landmark on the page",
        description: "Assistive technology users cannot jump straight to the primary content because no main region is exposed.",
        evidence: "document.querySelectorAll('main, [role=main]').length === 0",
        whyItMatters: "Landmark navigation is the fastest way for screen reader users to skip repeated chrome.",
        recommendation: "Wrap the primary content in a <main> element (or role=\"main\").",
        implementation: "<main id=\"content\">…</main> — pair it with a skip link targeting #content.",
      },
    }),
  );

  checks.push(
    check({
      id: "skip-link",
      label: "Skip-to-content link available",
      category: "accessibility",
      status: dom.skipLinkPresent ? "pass" : "warn",
      weight: 1,
      observed: dom.skipLinkPresent ? "skip link detected" : "no skip link found",
      expected: "First focusable element bypasses repeated navigation",
    }),
  );

  checks.push(
    check({
      id: "duplicate-ids",
      label: "No duplicate element ids",
      category: "accessibility",
      status: dom.duplicateIds === 0 ? "pass" : "warn",
      weight: 1,
      observed: `${dom.duplicateIds} duplicated id${dom.duplicateIds === 1 ? "" : "s"}`,
      expected: "0 duplicates",
    }),
  );

  checks.push(
    check({
      id: "tabindex",
      label: "No positive tabindex values",
      category: "accessibility",
      status: dom.tabIndexPositive === 0 ? "pass" : "warn",
      weight: 1,
      observed: `${dom.tabIndexPositive} element(s) with tabindex > 0`,
      expected: "0 elements",
    }),
  );

  checks.push(
    check({
      id: "manual-screen-reader",
      label: "Manual: screen reader walkthrough of the primary task",
      category: "accessibility",
      status: "na",
      weight: 0,
      detection: "manual",
      observed: "Not covered by automation",
      expected: "Task completable with NVDA/VoiceOver alone",
    }),
    check({
      id: "manual-zoom",
      label: "Manual: 200% zoom and 320px reflow without loss of content",
      category: "accessibility",
      status: "na",
      weight: 0,
      detection: "manual",
      observed: "Requires human verification",
      expected: "No clipped or overlapping content at 200% zoom",
    }),
    check({
      id: "manual-motion",
      label: "Manual: reduced-motion and animation safety",
      category: "accessibility",
      status: "na",
      weight: 0,
      detection: "manual",
      observed: "Requires human verification",
      expected: "prefers-reduced-motion respected for non-essential motion",
    }),
  );

  return checks;
}

function findSkippedHeading(levels: number[]): { from: number; to: number } | null {
  let previous = 0;
  for (const level of levels) {
    if (previous > 0 && level > previous + 1) return { from: previous, to: level };
    previous = level;
  }
  return null;
}

/* ------------------------------ usability -------------------------- */

function usabilityChecks(capture: PageCapture): AuditCheck[] {
  const { dom } = capture;
  const checks: AuditCheck[] = [];

  const focusRate = dom.focus.sampled > 0 ? dom.focus.withoutVisibleIndicator / dom.focus.sampled : 0;
  checks.push(
    check({
      id: "focus-visible",
      label: "Keyboard focus is visible",
      category: "usability",
      status: dom.focus.sampled === 0 ? "na" : focusRate === 0 ? "pass" : focusRate > 0.34 ? "fail" : "warn",
      weight: 3,
      observed:
        dom.focus.sampled === 0
          ? "no focusable elements sampled"
          : `${dom.focus.withoutVisibleIndicator} of ${dom.focus.sampled} sampled elements showed no focus indicator`,
      expected: "Every focusable element shows a visible state change",
      finding: {
        title: "Keyboard focus is invisible on some controls",
        description: `${dom.focus.withoutVisibleIndicator} of ${dom.focus.sampled} sampled focusable elements showed no outline, ring or border change when focused.`,
        evidence: dom.focus.examples.join(" · ") || "focus() produced no computed style change",
        whyItMatters: "Keyboard and switch users lose their position in the interface and cannot tell what Enter will activate.",
        recommendation: "Provide a visible focus ring on every interactive element using :focus-visible.",
        implementation:
          ":focus-visible { outline: 2px solid var(--ring); outline-offset: 2px; } — never remove the outline without providing a replacement indicator.",
        affectedCount: dom.focus.withoutVisibleIndicator,
      },
    }),
  );

  const linksByName = dom.links.filter((link) => (link.text || link.ariaLabel || "").trim().length > 0);
  const ambiguous = linksByName.filter((link) => AMBIGUOUS_LINK.test((link.ariaLabel || link.text).trim()));
  checks.push(
    check({
      id: "link-clarity",
      label: "Link text describes its destination",
      category: "usability",
      status: linksByName.length === 0 ? "na" : ambiguous.length === 0 ? "pass" : "warn",
      weight: 2,
      observed:
        linksByName.length === 0
          ? "no links with text"
          : `${ambiguous.length} of ${linksByName.length} links use non-descriptive text`,
      expected: "Links make sense out of context",
      finding: {
        title: "Non-descriptive link text",
        description: `${ambiguous.length} link${ambiguous.length === 1 ? "" : "s"} use generic labels such as "click here" or "read more".`,
        evidence: ambiguous.slice(0, 5).map((link) => `"${link.text}" → ${link.href}`).join(" · "),
        whyItMatters: "Screen reader users list links out of context; generic labels are indistinguishable in that list.",
        recommendation: "Write link text that names the destination or the action.",
        implementation: '"Read the 2026 accessibility report" instead of "read more" — move the extra context into aria-describedby when space is tight.',
        affectedCount: ambiguous.length,
      },
    }),
  );

  checks.push(
    check({
      id: "nav-structure",
      label: "Primary navigation is identifiable",
      category: "usability",
      status: dom.landmarks.nav === 0 ? "fail" : dom.navItemCount === 0 ? "warn" : "pass",
      weight: 1.5,
      observed: `${dom.landmarks.nav} nav landmark(s), ${dom.navItemCount} navigation items`,
      expected: "At least one nav landmark with recognisable items",
    }),
  );

  checks.push(
    check({
      id: "h1-single",
      label: "A single h1 states the page purpose",
      category: "usability",
      status: dom.headings.filter((h) => h.level === 1).length === 1 ? "pass" : dom.headings.filter((h) => h.level === 1).length === 0 ? "fail" : "warn",
      weight: 1.5,
      observed: `${dom.headings.filter((h) => h.level === 1).length} h1 element(s)`,
      expected: "Exactly one h1",
      finding: {
        title: dom.headings.filter((h) => h.level === 1).length === 0 ? "The page has no h1" : "The page has multiple h1 elements",
        description: "The primary heading does not identify the page in a single, unambiguous statement.",
        evidence: `${dom.headings.filter((h) => h.level === 1).length} h1 elements among ${dom.headings.length} headings`,
        whyItMatters: "Users skim for the headline to confirm they are in the right place.",
        recommendation: "Use exactly one h1 that describes the page purpose.",
        implementation: "Promote the page title to <h1> and demote competing headings to <h2>.",
      },
    }),
  );

  checks.push(
    check({
      id: "primary-action",
      label: "A primary action is visually evident",
      category: "usability",
      status: dom.ctas.length === 0 ? "warn" : dom.ctas.filter((cta) => cta.isPrimary).length === 0 ? "warn" : "pass",
      weight: 2,
      observed:
        dom.ctas.length === 0
          ? "no solid-action controls detected"
          : `${dom.ctas.length} action controls, ${dom.ctas.filter((cta) => cta.isPrimary).length} with primary emphasis`,
      expected: "At least one clearly emphasised primary action",
      finding: {
        title: "No primary action stands out",
        description: "The page offers no visually emphasised primary action, so users must guess where to go next.",
        evidence: `Detected ${dom.ctas.length} solid controls without primary emphasis`,
        whyItMatters: "A missing visual anchor for the next step increases decision time and drop-off.",
        recommendation: "Give the primary action a distinct, filled treatment and demote competing actions to secondary styles.",
        implementation: 'Use one variant="default" button per view; secondary actions use variant="outline" or "ghost".',
      },
    }),
  );

  checks.push(
    check({
      id: "required-signal",
      label: "Required fields are signalled",
      category: "usability",
      status: dom.inputsTotal === 0 ? "na" : dom.requiredWithoutSignal === 0 ? "pass" : "warn",
      weight: 1.5,
      observed:
        dom.inputsTotal === 0
          ? "no form controls present"
          : `${dom.requiredWithoutSignal} required field(s) without a visible required/optional marker`,
      expected: "Every required field is marked in the label",
      finding: {
        title: "Required fields are not signalled",
        description: `${dom.requiredWithoutSignal} required input${dom.requiredWithoutSignal === 1 ? "" : "s"} give no visual or textual hint that they are mandatory.`,
        evidence: "input[required] present without '*' or 'required' in the associated label",
        whyItMatters: "Users discover the requirement only after a failed submission.",
        recommendation: "Mark required fields in the label text, and mark optional ones when most fields are required.",
        implementation: '<label for="email">Work email <span aria-hidden="true">*</span></label> plus aria-required="true".',
        affectedCount: dom.requiredWithoutSignal,
      },
    }),
  );

  checks.push(
    check({
      id: "search-available",
      label: "Search is reachable for content-heavy navigation",
      category: "usability",
      status: dom.navItemCount > 12 ? (dom.hasSearch ? "pass" : "warn") : "na",
      weight: 1,
      observed:
        dom.navItemCount > 12
          ? `${dom.navItemCount} navigation items, search ${dom.hasSearch ? "present" : "absent"}`
          : `${dom.navItemCount} navigation items — search not required`,
      expected: "Search available when navigation exceeds ~12 items",
    }),
  );

  checks.push(
    check({
      id: "empty-headings",
      label: "Headings carry text",
      category: "usability",
      status: dom.headingsWithoutText === 0 ? "pass" : "warn",
      weight: 1,
      observed: `${dom.headingsWithoutText} heading(s) with no text`,
      expected: "0 empty headings",
    }),
  );

  checks.push(
    check({
      id: "manual-task-test",
      label: "Manual: moderated task-completion test on the key flow",
      category: "usability",
      status: "na",
      weight: 0,
      detection: "manual",
      observed: "Requires participant sessions",
      expected: "> 80% unaided task success",
    }),
    check({
      id: "manual-error-recovery",
      label: "Manual: error recovery and empty-state review",
      category: "usability",
      status: "na",
      weight: 0,
      detection: "manual",
      observed: "Requires human verification",
      expected: "Every failure path offers a recovery action",
    }),
  );

  return checks;
}

/* ---------------------------- visual design ------------------------ */

function visualDesignChecks(capture: PageCapture): AuditCheck[] {
  const { dom } = capture;
  const checks: AuditCheck[] = [];

  const families = distinctValues(dom.styles.map((style) => style.family), 20);
  checks.push(
    check({
      id: "font-families",
      label: "Font family count is disciplined",
      category: "visual-design",
      status: families.length === 0 ? "na" : families.length <= 2 ? "pass" : families.length <= 3 ? "warn" : "fail",
      weight: 2,
      observed: `${families.length} font families: ${families.map((f) => `${f.value} (${f.count})`).join(", ") || "none"}`,
      expected: "1–2 families (display + text)",
      finding: {
        title: "Too many font families",
        description: `${families.length} font families render on this page, which fractures the typographic voice.`,
        evidence: families.map((family) => `${family.value} ×${family.count}`).join(" · "),
        whyItMatters: "Each additional family adds network cost and makes the interface read as assembled rather than designed.",
        recommendation: "Limit the page to one text family and one display family, using weight and size for contrast.",
        implementation: "Map both families into your token layer (--font-sans, --font-display) and forbid ad-hoc font-family declarations.",
        affectedCount: families.length,
      },
    }),
  );

  const sizes = distinctValues(dom.styles.map((style) => `${style.size}px`), 40).filter((entry) => Number.parseInt(entry.value, 10) > 0);
  checks.push(
    check({
      id: "type-scale",
      label: "Type scale is limited to a system",
      category: "visual-design",
      status: sizes.length === 0 ? "na" : sizes.length <= 8 ? "pass" : sizes.length <= 12 ? "warn" : "fail",
      weight: 2,
      observed: `${sizes.length} distinct font sizes in use`,
      expected: "≤ 8 sizes on a single view",
      finding: {
        title: "Type scale is not systematic",
        description: `${sizes.length} distinct font sizes appear on one page, which signals ad-hoc rather than tokenised typography.`,
        evidence: sizes.map((size) => `${size.value} ×${size.count}`).join(" · "),
        whyItMatters: "An unbounded type scale erodes hierarchy: users can no longer tell which level of information they are reading.",
        recommendation: "Introduce a fixed scale (e.g. 12/14/16/20/24/32/48) and map every text style onto it.",
        implementation: "Define --text-xs…--text-3xl tokens and replace raw px values in components with the token classes.",
        affectedCount: sizes.length,
      },
    }),
  );

  const bodySizes = dom.styles.filter((style) => style.size >= 10 && style.size <= 30).map((style) => style.size);
  const medianBody = median(bodySizes);
  checks.push(
    check({
      id: "body-size",
      label: "Body text is comfortably sized",
      category: "visual-design",
      status: medianBody === 0 ? "na" : medianBody >= 16 ? "pass" : medianBody >= 14 ? "warn" : "fail",
      weight: 2,
      observed: `median font size ${medianBody}px across ${bodySizes.length} text elements`,
      expected: "≥ 16px for body copy",
      finding: {
        title: "Body text is smaller than 16px",
        description: `The median text size on the page is ${medianBody}px, below the 16px baseline most users read comfortably.`,
        evidence: `${bodySizes.length} text elements, median ${medianBody}px`,
        whyItMatters: "Small body copy increases zoom dependency and reading fatigue, especially on dense dashboards.",
        recommendation: "Raise body copy to 16px and reserve 14px for secondary metadata only.",
        implementation: "Set html { font-size: 100% } and body text to 1rem; audit components that hard-code 13px/12px.",
        severity: medianBody < 14 ? "high" : "medium",
      },
    }),
  );

  const lineHeights = dom.styles
    .filter((style) => style.lineHeight !== null && style.size >= 14)
    .map((style) => (style.lineHeight as number) / style.size);
  const medianLeading = lineHeights.length ? round(median(lineHeights), 2) : 0;
  checks.push(
    check({
      id: "line-height",
      label: "Line height supports reading",
      category: "visual-design",
      status: lineHeights.length === 0 ? "na" : medianLeading >= 1.4 ? "pass" : medianLeading >= 1.25 ? "warn" : "fail",
      weight: 2,
      observed: lineHeights.length ? `median line-height ratio ${medianLeading}` : "no measurable line heights",
      expected: "≥ 1.4 for body text",
      finding: {
        title: "Line height is tight for body copy",
        description: `Measured median line-height ratio is ${medianLeading}, below the 1.4 comfortable-reading threshold.`,
        evidence: `${lineHeights.length} text elements sampled`,
        whyItMatters: "Tight leading causes line-skipping in long paragraphs and hurts users with dyslexia.",
        recommendation: "Set body line-height to 1.5 and keep headings between 1.1 and 1.25.",
        implementation: "Use leading-relaxed (1.625) for prose and leading-tight for display headings.",
      },
    }),
  );

  const textColors = distinctValues(dom.textColors, 40);
  checks.push(
    check({
      id: "text-palette",
      label: "Text colour palette is coherent",
      category: "visual-design",
      status: textColors.length === 0 ? "na" : textColors.length <= 6 ? "pass" : textColors.length <= 10 ? "warn" : "fail",
      weight: 2,
      observed: `${textColors.length} distinct text colours`,
      expected: "≤ 6 (primary, secondary, muted, link, success, error)",
      finding: {
        title: "Too many distinct text colours",
        description: `${textColors.length} different text colours appear on this page, which dilutes meaning and hierarchy.`,
        evidence: textColors.slice(0, 8).map((color) => `${color.value} ×${color.count}`).join(" · "),
        whyItMatters: "Colour should encode meaning; when everything is a slightly different grey, nothing is emphasising anything.",
        recommendation: "Collapse text colours onto semantic tokens and delete one-off hex values.",
        implementation: "Expose text-foreground / text-muted-foreground / text-primary / text-destructive and require them in review.",
        affectedCount: textColors.length,
      },
    }),
  );

  const spacingConsistency = tokenConsistency(dom.spacings);
  checks.push(
    check({
      id: "spacing-scale",
      label: "Spacing follows a shared scale",
      category: "visual-design",
      status: dom.spacings.length < 8 ? "na" : spacingConsistency >= 0.75 ? "pass" : spacingConsistency >= 0.55 ? "warn" : "fail",
      weight: 1.5,
      observed: `${distinctValues(dom.spacings, 200).length} distinct padding values (consistency ${spacingConsistency})`,
      expected: "A 4/8px-based spacing scale",
      finding: {
        title: "Spacing values drift from the scale",
        description: `${distinctValues(dom.spacings, 200).length} distinct padding values are in use, which produces uneven rhythm between blocks.`,
        evidence: distinctValues(dom.spacings, 200).slice(0, 8).map((value) => `${value.value} ×${value.count}`).join(" · "),
        whyItMatters: "Inconsistent spacing makes related elements look unrelated and increases layout maintenance cost.",
        recommendation: "Snap padding and margin to a 4px scale and replace arbitrary values with spacing tokens.",
        implementation: "Use gap/p-space utilities backed by the token scale; ban raw pixel values inside components.",
      },
    }),
  );

  const headingSizes = dom.headings.length
    ? dom.styles.filter((style) => style.weight && Number.parseInt(style.weight, 10) >= 600).map((style) => style.size)
    : [];
  const maxHeading = headingSizes.length ? Math.max(...headingSizes) : 0;
  const hierarchyRatio = medianBody > 0 && maxHeading > 0 ? round(maxHeading / medianBody, 2) : 0;
  checks.push(
    check({
      id: "hierarchy-ratio",
      label: "Visual hierarchy has clear contrast",
      category: "visual-design",
      status: hierarchyRatio === 0 ? "na" : hierarchyRatio >= 1.8 ? "pass" : hierarchyRatio >= 1.4 ? "warn" : "fail",
      weight: 2,
      observed: hierarchyRatio ? `largest emphasis text / median body = ${hierarchyRatio}×` : "no emphasised text found",
      expected: "≥ 1.8× between primary heading and body",
      finding: {
        title: "Headline hierarchy is too flat",
        description: `The largest emphasised text is only ${hierarchyRatio}× the median body size, so the page reads as a single undifferentiated mass.`,
        evidence: `${maxHeading}px vs median body ${medianBody}px`,
        whyItMatters: "Users locate the page purpose and scan structure from size contrast alone.",
        recommendation: "Increase the display size or reduce body size so the ratio reaches at least 1.8×.",
        implementation: "Set page titles to text-3xl/4xl (30–36px) while body copy stays at 16px.",
      },
    }),
  );

  checks.push(
    check({
      id: "manual-visual-balance",
      label: "Manual: visual balance, imagery quality and brand expression",
      category: "visual-design",
      status: "na",
      weight: 0,
      detection: "manual",
      observed: "Requires design review",
      expected: "Deliberate focal point and consistent imagery treatment",
    }),
  );

  return checks;
}

/* ----------------------------- responsive -------------------------- */

function responsiveChecks(capture: PageCapture): AuditCheck[] {
  const checks: AuditCheck[] = [];
  const byPreset = new Map<string, ResponsiveSnapshot>(capture.responsive.map((entry) => [entry.preset, entry]));

  const viewportMeta = capture.dom.viewportMeta;
  checks.push(
    check({
      id: "viewport-meta",
      label: "Responsive viewport is declared",
      category: "responsive",
      status: viewportMeta ? (/width\s*=\s*device-width/i.test(viewportMeta) ? "pass" : "warn") : "fail",
      weight: 3,
      observed: viewportMeta ? `content="${viewportMeta}"` : "no viewport meta tag",
      expected: "width=device-width, initial-scale=1",
      finding: {
        title: "Responsive viewport meta tag is missing or wrong",
        description: viewportMeta
          ? `The viewport is declared as "${viewportMeta}", which pins the layout width instead of following the device.`
          : "The page has no viewport meta tag, so mobile browsers render at a desktop width and zoom out.",
        evidence: viewportMeta ?? "no meta[name=viewport]",
        whyItMatters: "Without width=device-width the media queries never fire and text becomes unreadably small on phones.",
        recommendation: 'Declare a device-width viewport and never disable zoom.',
        implementation: '<meta name="viewport" content="width=device-width, initial-scale=1" /> — drop maximum-scale and user-scalable=no.',
        severity: "high",
      },
    }),
  );

  const mobile = byPreset.get("mobile");
  const tablet = byPreset.get("tablet");
  const desktop = byPreset.get("desktop");

  for (const snapshot of [desktop, tablet, mobile].filter(Boolean) as ResponsiveSnapshot[]) {
    checks.push(
      check({
        id: `overflow-${snapshot.preset}`,
        label: `No horizontal overflow at ${snapshot.preset} (${snapshot.width}px)`,
        category: "responsive",
        status: snapshot.overflow ? (snapshot.overflowPx > 60 ? "fail" : "warn") : "pass",
        weight: snapshot.preset === "mobile" ? 3 : 2,
        observed: snapshot.overflow
          ? `document scrollWidth ${snapshot.scrollWidth}px vs viewport ${snapshot.width}px (+${snapshot.overflowPx}px)`
          : `${snapshot.scrollWidth}px content fits ${snapshot.width}px viewport`,
        expected: "scrollWidth ≤ viewport width",
        finding: {
          title: `Horizontal overflow at ${snapshot.width}px`,
          description: `Content is ${snapshot.overflowPx}px wider than the ${snapshot.preset} viewport, forcing sideways scrolling.`,
          evidence: `scrollWidth ${snapshot.scrollWidth}px > innerWidth ${snapshot.width}px · ${snapshot.fixedWideCount} element(s) exceed the viewport`,
          whyItMatters: "Horizontal scrolling hides content, breaks sticky positioning and is the most visible responsive failure on phones.",
          recommendation: "Constrain widths to 100%, allow wrapping, and audit fixed-width tables and media.",
          implementation: "Replace width: 1200px with max-width: 100%; add overflow-x: auto to wide tables; use min-width: 0 on flex children.",
          affectedCount: snapshot.fixedWideCount || null,
        },
      }),
    );
  }

  if (mobile) {
    checks.push(
      check({
        id: "tap-targets",
        label: "Touch targets are large enough on mobile",
        category: "responsive",
        // Under 24px fails WCAG 2.2 SC 2.5.8; 24–31px is a comfort warning.
        // Inline links inside body copy are exempt and excluded upstream.
        status: mobile.tinyTapCount > 0 ? "fail" : mobile.smallTapCount > 0 ? "warn" : "pass",
        weight: 2.5,
        observed:
          mobile.tinyTapCount + mobile.smallTapCount === 0
            ? "all standalone controls measure at least 32×32px at 390px width"
            : `${mobile.tinyTapCount} control(s) below 24×24px and ${mobile.smallTapCount} between 24 and 32px at 390px width`,
        expected: "≥ 44×44px preferred, 24×24px minimum (WCAG 2.2 SC 2.5.8, inline links exempt)",
        finding: {
          title: mobile.tinyTapCount > 0 ? "Touch targets fall below the WCAG minimum" : "Touch targets are tight on mobile",
          description:
            mobile.tinyTapCount > 0
              ? `${mobile.tinyTapCount} standalone control(s) measure less than 24×24px at mobile width, below the WCAG 2.2 minimum.`
              : `${mobile.smallTapCount} standalone control(s) measure between 24 and 32px at mobile width — usable, but below the comfortable tapping size.`,
          evidence: `${mobile.tinyTapCount} control(s) under 24px · ${mobile.smallTapCount} between 24 and 32px (inline text links excluded)`,
          whyItMatters: "Small targets cause mis-taps, and WCAG 2.2 SC 2.5.8 sets a 24×24px floor for standalone controls.",
          recommendation: "Grow the hit area to at least 44×44px without necessarily enlarging the visual control.",
          implementation: "Use min-height: 44px on interactive rows, or add a pseudo-element hit area: ::after { inset: -8px; }.",
          affectedCount: mobile.tinyTapCount + mobile.smallTapCount,
          wcagCriterion: "WCAG 2.2 SC 2.5.8 Target Size (Minimum)",
        },
      }),
      check({
        id: "mobile-legibility",
        label: "Text stays legible at mobile width",
        category: "responsive",
        status: mobile.tinyTextCount === 0 ? "pass" : mobile.tinyTextCount <= 5 ? "warn" : "fail",
        weight: 2,
        observed: `${mobile.tinyTextCount} text elements below 12px at 390px width`,
        expected: "0 sub-12px text at mobile width",
        finding: {
          title: "Text becomes too small on mobile",
          description: `${mobile.tinyTextCount} text elements render below 12px at mobile width.`,
          evidence: `${mobile.tinyTextCount} elements with computed font-size < 12px at 390px viewport`,
          whyItMatters: "Sub-12px text at mobile width is unreadable without zoom and fails WCAG 1.4.4 resize expectations in practice.",
          recommendation: "Keep a 16px body size and never scale text below 12px, even for metadata.",
          implementation: "Use clamp() for fluid type and set a 0.75rem floor on caption styles.",
          affectedCount: mobile.tinyTextCount,
        },
      }),
      check({
        id: "fixed-width-blocks",
        label: "No fixed-width blocks exceed the mobile viewport",
        category: "responsive",
        status: mobile.fixedWideCount === 0 ? "pass" : mobile.fixedWideCount <= 2 ? "warn" : "fail",
        weight: 2,
        observed: `${mobile.fixedWideCount} element(s) wider than the 390px viewport`,
        expected: "0 elements wider than the viewport",
      }),
    );
  }

  checks.push(
    check({
      id: "manual-orientation",
      label: "Manual: landscape/portrait switch and content priority at 320px",
      category: "responsive",
      status: "na",
      weight: 0,
      detection: "manual",
      observed: "Requires device testing",
      expected: "No content loss on rotation or at 320px",
    }),
  );

  return checks;
}

/* ------------------------------- content --------------------------- */

function contentChecks(capture: PageCapture): AuditCheck[] {
  const { dom } = capture;
  const checks: AuditCheck[] = [];
  const reading = readability(dom.bodyText);

  checks.push(
    check({
      id: "readability",
      label: "Body copy is readable (Flesch)",
      category: "content",
      status: reading.fleschReadingEase === null ? "na" : reading.fleschReadingEase >= 55 ? "pass" : reading.fleschReadingEase >= 40 ? "warn" : "fail",
      weight: 2.5,
      observed:
        reading.fleschReadingEase === null
          ? "no body text to analyse"
          : `Flesch reading ease ${reading.fleschReadingEase} across ${reading.words} words`,
      expected: "≥ 55 (plain English)",
      finding: {
        title: "Body copy is hard to read",
        description: `The page scores ${reading.fleschReadingEase} on the Flesch reading ease scale, in the difficult range.`,
        evidence: `${reading.words} words · ${reading.averageSentenceLength} words/sentence · ${reading.longWordRatio * 100}% long words`,
        whyItMatters: "Dense copy costs comprehension for everyone and blocks users with cognitive or language differences.",
        recommendation: "Shorten sentences, prefer plain words, and break long paragraphs into scannable blocks.",
        implementation: "Target ≤ 20 words per sentence and explain jargon at first use.",
      },
    }),
  );

  checks.push(
    check({
      id: "sentence-length",
      label: "Sentences stay short",
      category: "content",
      status: reading.words === 0 ? "na" : reading.averageSentenceLength <= 22 ? "pass" : reading.averageSentenceLength <= 28 ? "warn" : "fail",
      weight: 2,
      observed: `${reading.averageSentenceLength} words per sentence on average`,
      expected: "≤ 22 words",
    }),
  );

  const genericCtas = dom.ctas.filter((cta) => GENERIC_CTA.test(cta.text.trim()) || cta.text.trim().length < 4);
  const actionCtas = dom.ctas.filter((cta) => CTA_WORDS.test(cta.text));
  checks.push(
    check({
      id: "cta-clarity",
      label: "Calls to action name the outcome",
      category: "content",
      status: dom.ctas.length === 0 ? "na" : genericCtas.length === 0 && actionCtas.length > 0 ? "pass" : genericCtas.length > 0 ? "warn" : "pass",
      weight: 2,
      observed:
        dom.ctas.length === 0
          ? "no action controls detected"
          : `${dom.ctas.length} actions, ${actionCtas.length} outcome-oriented, ${genericCtas.length} generic`,
      expected: "Action labels describe the result, not the click",
      finding: genericCtas.length
        ? {
            title: "Calls to action are generic",
            description: `${genericCtas.length} action label${genericCtas.length === 1 ? "" : "s"} such as "${genericCtas[0].text}" do not describe the outcome.`,
            evidence: genericCtas.slice(0, 5).map((cta) => `"${cta.text}"`).join(" · "),
            whyItMatters: "Outcome-oriented labels reduce hesitation and improve conversion.",
            recommendation: "Replace verb-only labels with outcome phrases.",
            implementation: '"Create account" instead of "Submit"; "Download the report" instead of "Go".',
            affectedCount: genericCtas.length,
          }
        : undefined,
    }),
  );

  checks.push(
    check({
      id: "content-volume",
      label: "Page carries enough explanatory content",
      category: "content",
      status: reading.words === 0 ? "fail" : reading.words >= 150 ? "pass" : reading.words >= 60 ? "warn" : "fail",
      weight: 1.5,
      observed: `${reading.words} words of visible copy`,
      expected: "≥ 150 words for a primary landing page",
      finding: reading.words < 150
        ? {
            title: "Page copy is thin",
            description: `Only ${reading.words} words of visible text were found. Users may not have enough context to act.`,
            evidence: `${reading.words} words across ${reading.sentences} sentences`,
            whyItMatters: "Thin content pushes users to guess, and leaves nothing for search engines to index.",
            recommendation: "Add substantive copy covering what the page offers, who it is for, and the next step.",
            implementation: "Aim for 250–600 words on primary pages, structured with headings and short paragraphs.",
            severity: "low",
          }
        : undefined,
    }),
  );

  checks.push(
    check({
      id: "meta-description",
      label: "Meta description present",
      category: "content",
      status: dom.metaDescription ? (dom.metaDescription.length >= 50 ? "pass" : "warn") : "warn",
      weight: 1.5,
      observed: dom.metaDescription ? `${dom.metaDescription.length} characters` : "no meta description",
      expected: "50–160 characters describing the page",
    }),
  );

  const shouting = dom.bodyText
    .split(/(?<=[.!?])\s+/)
    .filter((sentence) => sentence.length > 12 && sentence === sentence.toUpperCase() && /[A-Z]{4}/.test(sentence));
  checks.push(
    check({
      id: "shouting",
      label: "No shouting copy blocks",
      category: "content",
      status: shouting.length === 0 ? "pass" : "warn",
      weight: 1,
      observed: `${shouting.length} all-caps block(s)`,
      expected: "0 all-caps sentences",
    }),
  );

  checks.push(
    check({
      id: "manual-terminology",
      label: "Manual: terminology consistency and error-message quality",
      category: "content",
      status: "na",
      weight: 0,
      detection: "manual",
      observed: "Requires human review",
      expected: "One term per concept; errors state cause and recovery",
    }),
  );

  return checks;
}

/* ----------------------------- performance ------------------------- */

function performanceChecks(capture: PageCapture): AuditCheck[] {
  const { performance, dom } = capture;
  const checks: AuditCheck[] = [];

  checks.push(
    check({
      id: "load-time",
      label: "Page load completes quickly",
      category: "performance",
      status: performance.loadEventMs === null ? "na" : performance.loadEventMs <= 2500 ? "pass" : performance.loadEventMs <= 4000 ? "warn" : "fail",
      weight: 3,
      observed: performance.loadEventMs === null ? "no load timing available" : `load event at ${performance.loadEventMs}ms`,
      expected: "≤ 2500ms on a warm connection",
      finding: {
        title: "Page load is slow",
        description: `The load event fired at ${performance.loadEventMs}ms, beyond the 2.5s budget.`,
        evidence: `TTFB ${performance.ttfbMs ?? "?"}ms · DOMContentLoaded ${performance.domContentLoadedMs ?? "?"}ms · load ${performance.loadEventMs}ms · ${performance.requestCount} requests · ${formatBytes(performance.transferKb)}`,
        whyItMatters: "Every additional second of load time measurably increases abandonment, especially on mobile networks.",
        recommendation: "Cut render-blocking resources, compress images, and defer non-critical scripts.",
        implementation: "Use responsive images (srcset + WebP/AVIF), preload the LCP asset, and defer analytics until after interaction.",
      },
    }),
  );

  checks.push(
    check({
      id: "dcl",
      label: "DOM is interactive early",
      category: "performance",
      status: performance.domContentLoadedMs === null ? "na" : performance.domContentLoadedMs <= 1800 ? "pass" : performance.domContentLoadedMs <= 3000 ? "warn" : "fail",
      weight: 2,
      observed: performance.domContentLoadedMs === null ? "no timing" : `DOMContentLoaded at ${performance.domContentLoadedMs}ms`,
      expected: "≤ 1800ms",
    }),
  );

  checks.push(
    check({
      id: "request-count",
      label: "Request count is controlled",
      category: "performance",
      status: performance.requestCount === 0 ? "na" : performance.requestCount <= 80 ? "pass" : performance.requestCount <= 140 ? "warn" : "fail",
      weight: 2,
      observed: `${performance.requestCount} network requests`,
      expected: "≤ 80 requests",
    }),
  );

  checks.push(
    check({
      id: "transfer-weight",
      label: "Page weight is reasonable",
      category: "performance",
      status: performance.transferKb === null ? "na" : performance.transferKb <= 3000 ? "pass" : performance.transferKb <= 5500 ? "warn" : "fail",
      weight: 2,
      observed: formatBytes(performance.transferKb),
      expected: "≤ 3 MB transferred",
      finding: performance.transferKb !== null && performance.transferKb > 3000
        ? {
            title: "Page weight exceeds 3 MB",
            description: `The page transferred ${formatBytes(performance.transferKb)} across ${performance.requestCount} requests.`,
            evidence: `${formatBytes(performance.transferKb)} transfer size`,
            whyItMatters: "Heavy pages are slow and expensive on metered mobile data.",
            recommendation: "Audit the largest assets and convert imagery to modern formats at appropriate sizes.",
            implementation: 'Run the network panel sorted by size; add loading="lazy" and width/height to below-the-fold media.',
          }
        : undefined,
    }),
  );

  checks.push(
    check({
      id: "dom-size",
      label: "DOM size is manageable",
      category: "performance",
      status: performance.domNodes === 0 ? "na" : performance.domNodes <= 1500 ? "pass" : performance.domNodes <= 3000 ? "warn" : "fail",
      weight: 1.5,
      observed: `${performance.domNodes} DOM nodes`,
      expected: "≤ 1500 nodes",
    }),
  );

  const imageRatio = dom.images.length > 0 ? dom.imagesMissingDimensions / dom.images.length : 0;
  checks.push(
    check({
      id: "image-dimensions",
      label: "Images declare intrinsic dimensions",
      category: "performance",
      status: dom.images.length === 0 ? "na" : imageRatio === 0 ? "pass" : imageRatio <= 0.3 ? "warn" : "fail",
      weight: 2,
      observed: `${dom.imagesMissingDimensions} of ${dom.images.length} images lack width/height`,
      expected: "All images declare width and height",
      finding: dom.imagesMissingDimensions
        ? {
            title: "Images have no intrinsic dimensions",
            description: `${dom.imagesMissingDimensions} images render without width/height or aspect-ratio, so the layout shifts as they load.`,
            evidence: `${dom.imagesMissingDimensions}/${dom.images.length} img elements without dimensions`,
            whyItMatters: "Unsized images are the single largest cause of cumulative layout shift, which causes mis-taps on mobile.",
            recommendation: "Always declare width and height, or set an aspect-ratio, so the browser reserves space.",
            implementation: '<img src="hero.webp" width="1200" height="600" alt="…" style="max-width:100%;height:auto" />',
            affectedCount: dom.imagesMissingDimensions,
          }
        : undefined,
    }),
  );

  checks.push(
    check({
      id: "lazy-loading",
      label: "Below-the-fold images are deferred",
      category: "performance",
      status: dom.images.length <= 12 ? "na" : dom.imagesLazy > 0 ? "pass" : "warn",
      weight: 1,
      observed: `${dom.imagesLazy} of ${dom.images.length} images use loading="lazy"`,
      expected: 'loading="lazy" on non-critical images',
    }),
  );

  checks.push(
    check({
      id: "render-blocking",
      label: "Render-blocking stylesheets are limited",
      category: "performance",
      status: performance.renderBlockingStylesheets <= 4 ? "pass" : performance.renderBlockingStylesheets <= 8 ? "warn" : "fail",
      weight: 1,
      observed: `${performance.renderBlockingStylesheets} stylesheet link(s)`,
      expected: "≤ 4 render-blocking stylesheets",
    }),
  );

  return checks;
}

/* ---------------------------- consistency -------------------------- */

function consistencyChecks(capture: PageCapture, reference: ReferenceTokens | null): AuditCheck[] {
  const { dom } = capture;
  const checks: AuditCheck[] = [];

  const buttonBackgrounds = distinctValues(dom.buttons.map((button) => button.background), 20).filter(
    (entry) => entry.value !== "rgba(0, 0, 0, 0)" && entry.value !== "transparent",
  );
  checks.push(
    check({
      id: "button-variants",
      label: "Button treatments are limited to a defined set",
      category: "consistency",
      status: dom.buttons.length === 0 ? "na" : buttonBackgrounds.length <= 4 ? "pass" : buttonBackgrounds.length <= 6 ? "warn" : "fail",
      weight: 2,
      observed: `${buttonBackgrounds.length} distinct button background colours across ${dom.buttons.length} buttons`,
      expected: "≤ 4 (primary, secondary, destructive, ghost)",
      finding: buttonBackgrounds.length > 4
        ? {
            title: "Too many button treatments",
            description: `${buttonBackgrounds.length} distinct button background colours appear, beyond the four canonical variants.`,
            evidence: buttonBackgrounds.map((bg) => `${bg.value} ×${bg.count}`).join(" · "),
            whyItMatters: "Extra variants flatten the action hierarchy: users cannot tell primary from tertiary actions.",
            recommendation: "Consolidate onto primary, secondary, ghost and destructive variants.",
            implementation: "Extend the button variant config once and replace ad-hoc background classes at call sites.",
            affectedCount: buttonBackgrounds.length,
          }
        : undefined,
    }),
  );

  const radiusConsistency = tokenConsistency(dom.radii);
  checks.push(
    check({
      id: "radius-scale",
      label: "Border radius uses a token scale",
      category: "consistency",
      status: dom.radii.length === 0 ? "na" : radiusConsistency >= 0.6 ? "pass" : radiusConsistency >= 0.35 ? "warn" : "fail",
      weight: 2,
      observed: `${distinctValues(dom.radii, 50).length} distinct radius values (consistency ${radiusConsistency})`,
      expected: "≤ 3 radius values (sm, md, pill)",
      finding: radiusConsistency < 0.6
        ? {
            title: "Border radius values are inconsistent",
            description: `${distinctValues(dom.radii, 50).length} different corner radii are in use, which makes cards and controls look unrelated.`,
            evidence: distinctValues(dom.radii, 50).slice(0, 6).map((radius) => `${radius.value} ×${radius.count}`).join(" · "),
            whyItMatters: "Radius is one of the strongest signals of a single component family.",
            recommendation: "Pick two or three radii and express them as --radius-sm / --radius / --radius-lg.",
            implementation: "Replace rounded-[7px] style one-offs with rounded-md/lg tokens and audit design-system overrides.",
          }
        : undefined,
    }),
  );

  const shadowConsistency = tokenConsistency(dom.shadows);
  checks.push(
    check({
      id: "shadow-scale",
      label: "Elevation uses a shadow scale",
      category: "consistency",
      status: dom.shadows.length === 0 ? "na" : shadowConsistency >= 0.5 ? "pass" : shadowConsistency >= 0.25 ? "warn" : "fail",
      weight: 1.5,
      observed: `${distinctValues(dom.shadows, 50).length} distinct box-shadow values`,
      expected: "≤ 3 elevation levels",
    }),
  );

  const inputHeights = distinctValues(dom.inputs.map((input) => `${input.height}px`), 20);
  checks.push(
    check({
      id: "control-heights",
      label: "Form controls share a height",
      category: "consistency",
      status: dom.inputs.length < 2 ? "na" : inputHeights.length <= 2 ? "pass" : inputHeights.length <= 4 ? "warn" : "fail",
      weight: 1.5,
      observed: `${inputHeights.length} distinct control heights: ${inputHeights.map((entry) => entry.value).join(", ") || "none"}`,
      expected: "1–2 control heights",
    }),
  );

  const buttonSizes = distinctValues(dom.buttons.map((button) => `${button.fontSize}px/${button.paddingX ?? 0}/${button.paddingY ?? 0}`), 20);
  checks.push(
    check({
      id: "button-metrics",
      label: "Button sizing follows the size scale",
      category: "consistency",
      status: dom.buttons.length < 3 ? "na" : buttonSizes.length <= 4 ? "pass" : buttonSizes.length <= 6 ? "warn" : "fail",
      weight: 1.5,
      observed: `${buttonSizes.length} distinct button size signatures`,
      expected: "≤ 4 (sm, md, lg, icon)",
    }),
  );

  // Optional reference token comparison — only runs when the user supplies a design system.
  if (reference && (reference.colors?.length || reference.radius?.length || reference.fontSizes?.length)) {
    const observedColors = new Set(
      [...dom.backgroundColors, ...dom.textColors].map(normalizeColor).filter(Boolean) as string[],
    );
    const referenceColors = (reference.colors ?? []).map(normalizeColor).filter(Boolean) as string[];
    const offPalette = referenceColors.length
      ? [...observedColors].filter((color) => !referenceColors.some((ref) => colorDistance(color, ref) <= 18))
      : [];

    checks.push(
      check({
        id: "reference-colors",
        label: "Colours conform to the supplied reference palette",
        category: "consistency",
        status: referenceColors.length === 0 ? "na" : offPalette.length === 0 ? "pass" : offPalette.length <= 4 ? "warn" : "fail",
        weight: 2,
        observed: `${offPalette.length} rendered colour(s) fall outside the ${referenceColors.length}-colour reference palette`,
        expected: "All rendered colours within the reference palette (±18 RGB distance)",
        finding: offPalette.length
          ? {
              title: "Rendered colours fall outside the design-system palette",
              description: `${offPalette.length} colours on the page are not part of the reference palette you supplied.`,
              evidence: offPalette.slice(0, 8).join(" · "),
              whyItMatters: "Off-palette values break visual continuity and usually indicate hard-coded styles.",
              recommendation: "Map each off-palette value onto the closest semantic token.",
              implementation: "Add the token to tailwind.config, then replace the raw value at the component call site.",
              affectedCount: offPalette.length,
            }
          : undefined,
      }),
    );

    const referenceRadii = (reference.radius ?? []).map((value) => value.toLowerCase());
    if (referenceRadii.length) {
      const offRadius = distinctValues(dom.radii, 50).filter(
        (entry) => !referenceRadii.includes(entry.value) && entry.value !== "50%" && entry.value !== "9999px",
      );
      checks.push(
        check({
          id: "reference-radius",
          label: "Radius values conform to the reference set",
          category: "consistency",
          status: offRadius.length === 0 ? "pass" : offRadius.length <= 3 ? "warn" : "fail",
          weight: 1.5,
          observed: `${offRadius.length} radius value(s) outside the reference set`,
          expected: referenceRadii.join(", "),
        }),
      );
    }
  } else {
    checks.push(
      check({
        id: "reference-tokens",
        label: "Reference design-system conformance",
        category: "consistency",
        status: "na",
        weight: 0,
        detection: "manual",
        observed: "No reference tokens supplied for this project",
        expected: "Optional: attach a design-system reference in project settings",
      }),
    );
  }

  checks.push(
    check({
      id: "manual-states",
      label: "Manual: component state coverage (hover, active, disabled, loading, error)",
      category: "consistency",
      status: "na",
      weight: 0,
      detection: "manual",
      observed: "Requires interaction review",
      expected: "Every control defines all interaction states",
    }),
  );

  return checks;
}

/* ------------------------------- helpers --------------------------- */

function normalizeColor(value: string): string | null {
  const match = /rgba?\(([\d.]+),\s*([\d.]+),\s*([\d.]+)/i.exec(value);
  if (!match) return null;
  const [r, g, b] = [Number(match[1]), Number(match[2]), Number(match[3])];
  return `#${[r, g, b].map((channel) => Math.round(channel).toString(16).padStart(2, "0")).join("")}`;
}

function colorDistance(a: string, b: string): number {
  const pa = hexToRgb(a);
  const pb = hexToRgb(b);
  if (!pa || !pb) return Number.POSITIVE_INFINITY;
  return Math.sqrt((pa[0] - pb[0]) ** 2 + (pa[1] - pb[1]) ** 2 + (pa[2] - pb[2]) ** 2);
}

function hexToRgb(hex: string): [number, number, number] | null {
  const match = /^#?([0-9a-f]{6})$/i.exec(hex);
  if (!match) return null;
  const value = Number.parseInt(match[1], 16);
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
}

/** Used by the UI to describe what a category evaluates. */
export function categoryCheckLabels(categories: AuditCategory[]): Record<string, string[]> {
  return Object.fromEntries(categories.map((category) => [category, CATEGORY_META[category].checks]));
}

export function normalizeScope(values: string[]): AuditCategory[] {
  return values.filter((value): value is AuditCategory => (auditCategories as readonly string[]).includes(value));
}

export { parsePx, average, round };
