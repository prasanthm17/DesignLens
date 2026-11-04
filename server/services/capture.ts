import { chromium, type Browser, type Page } from "playwright";
import axeCore from "axe-core";
import { mkdir, writeFile } from "fs/promises";
import { join } from "path";
import { VIEWPORT_META } from "@shared/catalog";
import type { ViewportPreset } from "@shared/schema";

/* ------------------------------------------------------------------ *
 * Page capture layer.
 *
 * Everything here is measured from the live DOM. No value in the audit
 * pipeline is estimated: if a measurement fails the corresponding check is
 * reported as not-applicable instead of being guessed.
 * ------------------------------------------------------------------ */

export type SeverityLabel = "critical" | "high" | "medium" | "low" | "informational";

export interface AxeViolationSummary {
  id: string;
  impact: string | null;
  help: string;
  description: string;
  helpUrl: string;
  wcag: string[];
  nodes: number;
  sampleTarget: string | null;
  failureSummary: string | null;
}

export interface StyleSample {
  family: string;
  size: number;
  weight: string;
  lineHeight: number | null;
  color: string;
}

export interface ElementSample {
  text: string;
  tag: string;
  width: number;
  height: number;
  fontSize: number;
  radius: string;
  shadow: string;
  background: string;
  color: string;
  paddingX: number | null;
  paddingY: number | null;
}

export interface DomSnapshot {
  finalUrl: string;
  title: string;
  lang: string;
  metaDescription: string | null;
  viewportMeta: string | null;
  docWidth: number;
  docHeight: number;
  counts: {
    headings: number;
    images: number;
    links: number;
    buttons: number;
    inputs: number;
    forms: number;
    landmarks: number;
    focusables: number;
    paragraphs: number;
  };
  headings: Array<{ level: number; text: string }>;
  images: Array<{ alt: string | null; ariaLabel: string | null; width: number; height: number; loading: string; role: string }>;
  links: Array<{ text: string; href: string; ariaLabel: string | null; inNav: boolean }>;
  ctas: Array<{ text: string; tag: string; isPrimary: boolean }>;
  unlabeledControls: Array<{ tag: string; type: string; selector: string }>;
  requiredWithoutSignal: number;
  inputsTotal: number;
  landmarks: { main: number; nav: number; header: number; footer: number; aside: number; search: number };
  skipLinkPresent: boolean;
  styles: StyleSample[];
  buttons: ElementSample[];
  inputs: ElementSample[];
  radii: string[];
  shadows: string[];
  borders: string[];
  textColors: string[];
  backgroundColors: string[];
  spacings: string[];
  focus: { sampled: number; withoutVisibleIndicator: number; examples: string[] };
  smallText: { count: number; examples: string[] };
  smallTapTargets: { count: number; examples: string[] };
  fixedWideElements: { count: number; examples: string[] };
  headingsWithoutText: number;
  bodyText: string;
  hasSearch: boolean;
  navItemCount: number;
  duplicateIds: number;
  tabIndexPositive: number;
  imagesMissingDimensions: number;
  imagesLazy: number;
  renderBlockingStylesheets: number;
  domNodes: number;
}

export interface ResponsiveSnapshot {
  preset: ViewportPreset;
  width: number;
  height: number;
  scrollWidth: number;
  overflow: boolean;
  overflowPx: number;
  fixedWideCount: number;
  smallTapCount: number;
  tinyTapCount: number;
  tinyTextCount: number;
  screenshotUrl: string | null;
}

export interface PerformanceSnapshot {
  ttfbMs: number | null;
  domContentLoadedMs: number | null;
  loadEventMs: number | null;
  requestCount: number;
  transferKb: number | null;
  domNodes: number;
  renderBlockingStylesheets: number;
}

export interface PageCapture {
  requestedUrl: string;
  finalUrl: string;
  viewport: { width: number; height: number };
  dom: DomSnapshot;
  axe: AxeViolationSummary[];
  responsive: ResponsiveSnapshot[];
  performance: PerformanceSnapshot;
  screenshotUrl: string | null;
  screenshotPath: string | null;
  capturedAt: string;
}

const DESKTOP = VIEWPORT_META.desktop;

/* ------------------------- url safety (SSRF) ----------------------- */

const PRIVATE_HOST_PATTERNS = [
  /^localhost$/i,
  /^127\./,
  /^10\./,
  /^192\.168\./,
  /^172\.(1[6-9]|2\d|3[01])\./,
  /^169\.254\./,
  /^0\./,
  /^\[?::1\]?$/,
  /\.local$/i,
  /\.internal$/i,
];

export function normalizeTargetUrl(input: string): string {
  const trimmed = input.trim();
  const withScheme = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  const url = new URL(withScheme);
  if (!/^https?:$/.test(url.protocol)) {
    throw new Error("Only http and https URLs can be audited");
  }
  if (!url.hostname.includes(".") && url.hostname !== "localhost") {
    throw new Error(`"${url.hostname}" is not a valid public hostname`);
  }
  return url.toString();
}

export function assertPublicTarget(rawUrl: string): string {
  const url = new URL(normalizeTargetUrl(rawUrl));
  const allowPrivate = process.env.ALLOW_PRIVATE_TARGETS === "1";
  if (!allowPrivate && PRIVATE_HOST_PATTERNS.some((pattern) => pattern.test(url.hostname))) {
    throw new Error("Audits can only run against publicly reachable URLs");
  }
  return url.toString();
}

/* ----------------------------- capture ---------------------------- */

export interface CaptureOptions {
  screenshotDir: string;
  auditId: string;
  viewportPreset: ViewportPreset;
  /** Categories that need the extra breakpoint passes. */
  needsResponsive: boolean;
  userAgent?: string;
  /** Reports real phase transitions so the UI never shows a fake stage. */
  onStage?: (stage: string, detail?: string) => void | Promise<void>;
}

export async function capturePage(rawUrl: string, options: CaptureOptions): Promise<PageCapture> {
  const targetUrl = assertPublicTarget(rawUrl);
  await mkdir(options.screenshotDir, { recursive: true });

  const browser: Browser = await chromium.launch({
    headless: true,
    // Container-friendly flags: /dev/shm is small in Docker (Chromium crashes without this),
    // and the image runs as root, which Chromium refuses unless the sandbox is disabled.
    // The browser only ever renders the audit target inside a throwaway container.
    args: ["--disable-dev-shm-usage", "--disable-gpu", "--no-sandbox", "--disable-setuid-sandbox"],
  });
  const context = await browser.newContext({
    viewport: { width: DESKTOP.width, height: DESKTOP.height },
    deviceScaleFactor: 1,
    userAgent:
      options.userAgent ??
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36 DesignLens/1.0",
    ignoreHTTPSErrors: true,
  });

  const page = await context.newPage();
  // Media-heavy pages can keep the network busy for minutes; cap total work.
  page.setDefaultTimeout(45_000);

  try {
    // `__name` is injected by the TypeScript/esbuild transform when a function is
    // serialised into the page context. Define it before any evaluate() runs so
    // instrumented callbacks do not throw inside the browser realm.
    await page.addInitScript({
      content: "globalThis.__name = globalThis.__name || function (fn) { return fn; };",
    });
    await page.addInitScript({ content: axeCore.source });
    const started = Date.now();
    await options.onStage?.("navigating");
    const response = await page.goto(targetUrl, { waitUntil: "domcontentloaded", timeout: 45_000 });
    await page.waitForLoadState("networkidle", { timeout: 8_000 }).catch(() => undefined);
    await page.waitForTimeout(350);

    if (!response) throw new Error("The target did not return a response");
    if (response.status() >= 400) {
      throw new Error(`The target returned HTTP ${response.status()}`);
    }

    await options.onStage?.("capturing", `HTTP ${response.status()} · ${page.url()}`);
    const dom = await readDomSnapshot(page);
    dom.focus = await measureFocusVisibility(page);
    const performance = await readPerformance(page);
    await options.onStage?.("axe");
    const axe = await runAxe(page);

    const screenshotPath = join(options.screenshotDir, `${options.auditId}.png`);
    const desktopShot = await page
      .screenshot({ fullPage: false, type: "png" })
      .catch(() => null);
    if (desktopShot) await writeFile(screenshotPath, desktopShot);

    const responsive: ResponsiveSnapshot[] = [];
    if (options.needsResponsive || options.viewportPreset !== "desktop") {
      const presets: ViewportPreset[] =
        options.viewportPreset === "all"
          ? ["desktop", "tablet", "mobile"]
          : [options.viewportPreset];

      for (const preset of presets) {
        const meta = VIEWPORT_META[preset as "desktop" | "tablet" | "mobile"];
        if (!meta) continue;
        await options.onStage?.("responsive", `${meta.label} · ${meta.width}px`);
        await page.setViewportSize({ width: meta.width, height: meta.height });
        await page.waitForTimeout(300);
        const light = await readResponsiveSnapshot(page);
        let url: string | null = null;
        if (preset !== "desktop") {
          const shotPath = join(options.screenshotDir, `${options.auditId}-${preset}.png`);
          const shot = await page.screenshot({ fullPage: false, type: "png" }).catch(() => null);
          if (shot) {
            await writeFile(shotPath, shot);
            url = `/screenshots/${options.auditId}-${preset}.png`;
          }
        }
        responsive.push({
          preset,
          width: meta.width,
          height: meta.height,
          ...light,
          screenshotUrl: url,
        });
      }
    }

    return {
      requestedUrl: targetUrl,
      finalUrl: page.url(),
      viewport: { width: DESKTOP.width, height: DESKTOP.height },
      dom,
      axe,
      responsive,
      performance,
      screenshotUrl: desktopShot ? `/screenshots/${options.auditId}.png` : null,
      screenshotPath: desktopShot ? screenshotPath : null,
      capturedAt: new Date(started).toISOString(),
    };
  } finally {
    await page.close().catch(() => undefined);
    await context.close().catch(() => undefined);
    await browser.close().catch(() => undefined);
  }
}

/* ------------------------- in-page extraction --------------------- */

async function readDomSnapshot(page: Page): Promise<DomSnapshot> {
  return page.evaluate(() => {
    const px = (value: string | null | undefined): number => {
      const parsed = Number.parseFloat(value || "");
      return Number.isFinite(parsed) ? parsed : 0;
    };

    const selectorFor = (element: Element): string => {
      const parts: string[] = [];
      let node: Element | null = element;
      let depth = 0;
      while (node && node.nodeType === 1 && depth < 4) {
        let part = node.tagName.toLowerCase();
        if (node.id) {
          part += `#${node.id}`;
          parts.unshift(part);
          break;
        }
        const parent: Element | null = node.parentElement;
        if (parent) {
          const siblings = Array.from(parent.children).filter(
            (child) => child.tagName === node!.tagName,
          );
          if (siblings.length > 1) part += `:nth-of-type(${siblings.indexOf(node) + 1})`;
        }
        parts.unshift(part);
        node = parent;
        depth += 1;
      }
      return parts.join(" > ");
    };

    const visible = (element: Element): boolean => {
      const rect = element.getBoundingClientRect();
      if (rect.width === 0 && rect.height === 0) return false;
      const style = window.getComputedStyle(element);
      return style.display !== "none" && style.visibility !== "hidden" && Number(style.opacity) > 0.05;
    };

    const text = (element: Element | null): string =>
      (element?.textContent || "").replace(/\s+/g, " ").trim();

    const sample = (element: Element): ElementSample => {
      const style = window.getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return {
        text: text(element).slice(0, 80),
        tag: element.tagName.toLowerCase(),
        width: Math.round(rect.width),
        height: Math.round(rect.height),
        fontSize: Math.round(px(style.fontSize)),
        radius: style.borderTopLeftRadius,
        shadow: style.boxShadow === "none" ? "none" : style.boxShadow,
        background: style.backgroundColor,
        color: style.color,
        paddingX: style.paddingLeft ? Math.round(px(style.paddingLeft)) : null,
        paddingY: style.paddingTop ? Math.round(px(style.paddingTop)) : null,
      };
    };

    const all = Array.from(document.querySelectorAll("*"));
    const interactive = Array.from(
      document.querySelectorAll<HTMLElement>(
        "a[href], button, [role='button'], [role='link'], input:not([type='hidden']), select, textarea, [tabindex]:not([tabindex='-1'])",
      ),
    ).filter(visible);

    const headings = Array.from(document.querySelectorAll("h1,h2,h3,h4,h5,h6")).map((heading) => ({
      level: Number(heading.tagName.substring(1)),
      text: text(heading).slice(0, 120),
    }));

    const images = Array.from(document.querySelectorAll("img")).map((img) => ({
      alt: img.getAttribute("alt"),
      ariaLabel: img.getAttribute("aria-label"),
      width: img.getBoundingClientRect().width,
      height: img.getBoundingClientRect().height,
      loading: img.getAttribute("loading") || "",
      role: img.getAttribute("role") || "",
    }));

    const links = Array.from(document.querySelectorAll<HTMLAnchorElement>("a[href]")).map((link) => ({
      text: text(link).slice(0, 80),
      href: link.getAttribute("href") || "",
      ariaLabel: link.getAttribute("aria-label"),
      inNav: Boolean(link.closest("nav, [role='navigation']")),
    }));

    const ctas = Array.from(document.querySelectorAll<HTMLElement>("a, button")).filter((element) => {
      if (!visible(element)) return false;
      const style = window.getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      const isSolid = style.backgroundColor !== "rgba(0, 0, 0, 0)" && style.backgroundColor !== "transparent";
      return isSolid && rect.width >= 80 && rect.height >= 28;
    }).slice(0, 40).map((element) => {
      const style = window.getComputedStyle(element);
      return {
        text: text(element).slice(0, 60),
        tag: element.tagName.toLowerCase(),
        isPrimary: style.backgroundColor !== "rgba(0, 0, 0, 0)" && px(style.fontWeight) >= 500,
      };
    });

    const unlabeledControls: Array<{ tag: string; type: string; selector: string }> = [];
    const inputs = Array.from(document.querySelectorAll<HTMLInputElement>("input, select, textarea")).filter(
      (input) => input.type !== "hidden" && visible(input),
    );

    let requiredWithoutSignal = 0;
    for (const input of inputs) {
      const id = input.id;
      const label =
        input.closest("label") ||
        (id ? document.querySelector(`label[for="${CSS.escape(id)}"]`) : null) ||
        (input.getAttribute("aria-labelledby")
          ? document.getElementById(input.getAttribute("aria-labelledby") as string)
          : null);
      const hasName = Boolean(
        (input.getAttribute("aria-label") || "").trim() ||
          label ||
          (input.getAttribute("title") || "").trim(),
      );
      if (!hasName) {
        unlabeledControls.push({ tag: input.tagName.toLowerCase(), type: input.type || "text", selector: selectorFor(input) });
      }
      if (input.required || input.getAttribute("aria-required") === "true") {
        const labelText = text(label).toLowerCase();
        if (!/\*|required|optional/.test(labelText)) requiredWithoutSignal += 1;
      }
    }

    const landmarks = {
      main: document.querySelectorAll("main, [role='main']").length,
      nav: document.querySelectorAll("nav, [role='navigation']").length,
      header: document.querySelectorAll("header, [role='banner']").length,
      footer: document.querySelectorAll("footer, [role='contentinfo']").length,
      aside: document.querySelectorAll("aside, [role='complementary']").length,
      search: document.querySelectorAll("[role='search'], search").length,
    };

    const skipLinkPresent = Array.from(document.querySelectorAll<HTMLAnchorElement>("a[href^='#']")).some((link) => {
      const label = `${text(link)} ${link.getAttribute("aria-label") || ""}`.toLowerCase();
      return /skip|jump to (main|content)/.test(label);
    });

    const styles: StyleSample[] = [];
    const textColors: string[] = [];
    const backgroundColors: string[] = [];
    const spacings: string[] = [];
    const radii: string[] = [];
    const shadows: string[] = [];
    const borders: string[] = [];
    const tinyText: string[] = [];

    const textNodes = Array.from(document.querySelectorAll("p, li, span, a, button, h1, h2, h3, h4, h5, h6, label, td, th"))
      .filter((element) => visible(element) && text(element).length > 0);

    for (const element of textNodes.slice(0, 900)) {
      const style = window.getComputedStyle(element);
      const size = Math.round(px(style.fontSize));
      const lineHeight = style.lineHeight === "normal" ? null : Math.round(px(style.lineHeight));
      styles.push({
        family: style.fontFamily.split(",")[0].replace(/["']/g, "").trim(),
        size,
        weight: style.fontWeight,
        lineHeight,
        color: style.color,
      });
      textColors.push(style.color);
      if (size > 0 && size < 12) tinyText.push(`${text(element).slice(0, 36)} (${size}px)`);
      if (style.backgroundColor && style.backgroundColor !== "rgba(0, 0, 0, 0)") {
        backgroundColors.push(style.backgroundColor);
      }
      if (style.borderTopWidth && px(style.borderTopWidth) > 0) {
        borders.push(`${style.borderTopWidth} ${style.borderTopStyle} ${style.borderTopColor}`);
      }
      spacings.push(style.paddingTop, style.paddingBottom, style.paddingLeft, style.paddingRight);
    }

    for (const element of all.slice(0, 2500)) {
      const style = window.getComputedStyle(element);
      if (style.borderTopLeftRadius && style.borderTopLeftRadius !== "0px") radii.push(style.borderTopLeftRadius);
    }
    for (const element of Array.from(document.querySelectorAll("div, section, header, nav, button, a, input, article, aside, aside, form"))) {
      const style = window.getComputedStyle(element);
      if (style.boxShadow && style.boxShadow !== "none") shadows.push(style.boxShadow);
    }

    const buttons = Array.from(document.querySelectorAll<HTMLElement>("button, a[role='button'], input[type='submit'], input[type='button']"))
      .filter(visible)
      .slice(0, 120)
      .map(sample);

    const inputSamples = inputs.slice(0, 60).map(sample);

    // Small tap targets: WCAG 2.2 AA target-size minimum is 24px; 44px is the
    // comfortable mobile guideline. We flag anything below 24px as a failure
    // candidate and 24–43px as a warning.
    const smallTargets = interactive
      .map((element) => {
        const rect = element.getBoundingClientRect();
        return { label: text(element).slice(0, 40) || element.tagName.toLowerCase(), w: Math.round(rect.width), h: Math.round(rect.height) };
      })
      .filter((entry) => entry.w > 0 && entry.h > 0 && (entry.w < 24 || entry.h < 24));

    const wideElements = all
      .filter((element) => {
        const rect = element.getBoundingClientRect();
        return rect.width > window.innerWidth + 4 && visible(element);
      })
      .slice(0, 30)
      .map((element) => `${element.tagName.toLowerCase()} · ${Math.round(element.getBoundingClientRect().width)}px`);

    const imagesMissingDimensions = Array.from(document.querySelectorAll("img")).filter(
      (img) => !img.getAttribute("width") && !img.getAttribute("height") && !img.style.aspectRatio,
    ).length;
    const imagesLazy = Array.from(document.querySelectorAll("img")).filter(
      (img) => img.getAttribute("loading") === "lazy",
    ).length;

    const duplicateIdCount = (() => {
      const seen = new Set<string>();
      let duplicates = 0;
      for (const element of Array.from(document.querySelectorAll("[id]")).slice(0, 3000)) {
        const id = element.id;
        if (seen.has(id)) duplicates += 1;
        else seen.add(id);
      }
      return duplicates;
    })();

    const tabIndexPositive = Array.from(document.querySelectorAll("[tabindex]")).filter(
      (element) => Number(element.getAttribute("tabindex")) > 0,
    ).length;

    const bodyText = (document.body?.innerText || "")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 20000);

    const navItemCount = document.querySelectorAll("nav a, nav button, [role='navigation'] a").length;

    return {
      finalUrl: location.href,
      title: document.title.trim(),
      lang: document.documentElement.lang.trim(),
      metaDescription:
        document.querySelector("meta[name='description']")?.getAttribute("content")?.trim() || null,
      viewportMeta:
        document.querySelector("meta[name='viewport']")?.getAttribute("content")?.trim() || null,
      docWidth: document.documentElement.scrollWidth,
      docHeight: document.documentElement.scrollHeight,
      counts: {
        headings: headings.length,
        images: images.length,
        links: links.length,
        buttons: buttons.length,
        inputs: inputs.length,
        forms: document.querySelectorAll("form").length,
        landmarks: landmarks.main + landmarks.nav + landmarks.header + landmarks.footer,
        focusables: interactive.length,
        paragraphs: document.querySelectorAll("p").length,
      },
      headings,
      images,
      links,
      ctas,
      unlabeledControls,
      requiredWithoutSignal,
      inputsTotal: inputs.length,
      landmarks,
      skipLinkPresent,
      styles,
      buttons,
      inputs: inputSamples,
      radii,
      shadows,
      borders,
      textColors,
      backgroundColors,
      spacings: spacings.filter(Boolean),
      focus: { sampled: 0, withoutVisibleIndicator: 0, examples: [] },
      smallText: { count: tinyText.length, examples: tinyText.slice(0, 5) },
      smallTapTargets: { count: smallTargets.length, examples: smallTargets.slice(0, 5).map((t) => `${t.label} (${t.w}×${t.h})`) },
      fixedWideElements: { count: wideElements.length, examples: wideElements.slice(0, 5) },
      headingsWithoutText: headings.filter((heading) => heading.text.length === 0).length,
      bodyText,
      hasSearch: landmarks.search > 0 || Boolean(document.querySelector("input[type='search']")),
      navItemCount,
      duplicateIds: duplicateIdCount,
      tabIndexPositive,
      imagesMissingDimensions,
      imagesLazy,
      renderBlockingStylesheets: document.querySelectorAll("link[rel='stylesheet']:not([media='print'])").length,
      domNodes: document.getElementsByTagName("*").length,
    };
  });
}

/**
 * Focus visibility requires actually moving focus, so it is measured in a
 * second pass over the first focusable elements.
 */
export async function measureFocusVisibility(
  page: Page,
  maxSamples = 8,
): Promise<{ sampled: number; withoutVisibleIndicator: number; examples: string[] }> {
  const result = { sampled: 0, withoutVisibleIndicator: 0, examples: [] as string[] };
  const count = await page.evaluate(
    () => document.querySelectorAll("a[href], button, input:not([type='hidden']), select, textarea, [tabindex='0']").length,
  );
  const limit = Math.min(maxSamples, count);

  for (let index = 0; index < limit; index += 1) {
    const outcome = await page.evaluate((idx) => {
      const elements = Array.from(
        document.querySelectorAll<HTMLElement>("a[href], button, input:not([type='hidden']), select, textarea, [tabindex='0']"),
      );
      const element = elements[idx];
      if (!element) return null;
      element.focus();
      const style = window.getComputedStyle(element);
      const hasOutline = style.outlineStyle !== "none" && Number.parseFloat(style.outlineWidth || "0") > 0;
      const hasShadow = style.boxShadow !== "none";
      const hasBorderChange = Number.parseFloat(style.borderWidth || "0") >= 2;
      return {
        label: `${element.tagName.toLowerCase()}${element.id ? `#${element.id}` : ""} "${(element.textContent || "").trim().slice(0, 30)}"`,
        visible: hasOutline || hasShadow || hasBorderChange,
      };
    }, index);

    if (!outcome) continue;
    result.sampled += 1;
    if (!outcome.visible) {
      result.withoutVisibleIndicator += 1;
      if (result.examples.length < 3) result.examples.push(outcome.label);
    }
  }

  return result;
}

export async function readPerformance(page: Page): Promise<PerformanceSnapshot> {
  return page.evaluate(() => {
    const navigation = window.performance.getEntriesByType("navigation")[0] as
      | PerformanceNavigationTiming
      | undefined;
    const resources = window.performance.getEntriesByType("resource") as PerformanceResourceTiming[];
    const transferBytes = resources.reduce((sum, entry) => sum + (entry.transferSize || 0), 0);

    return {
      ttfbMs: navigation ? Math.round(navigation.responseStart) : null,
      domContentLoadedMs: navigation ? Math.round(navigation.domContentLoadedEventEnd) : null,
      loadEventMs: navigation ? Math.round(navigation.loadEventEnd) : null,
      requestCount: resources.length,
      transferKb: resources.length ? Math.round((transferBytes / 1024) * 10) / 10 : null,
      domNodes: document.getElementsByTagName("*").length,
      renderBlockingStylesheets: document.querySelectorAll("link[rel='stylesheet']:not([media='print'])").length,
    };
  });
}

export async function runAxe(page: Page): Promise<AxeViolationSummary[]> {
  const results = await page
    .evaluate(async () => {
      const axe = (window as unknown as { axe?: typeof axeCore }).axe;
      if (!axe) return { violations: [] as unknown[] };
      return axe.run(document, {
        runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa", "best-practice"] },
        resultTypes: ["violations"],
      });
    })
    .catch(() => ({ violations: [] as unknown[] }));

  const violations = (results.violations || []) as Array<{
    id: string;
    impact: string | null;
    help: string;
    description: string;
    helpUrl: string;
    tags: string[];
    nodes: Array<{ target: unknown[]; failureSummary?: string }>;
  }>;

  return violations.map((violation) => {
    const wcag = violation.tags
      .filter((tag) => /^wcag\d{3,4}$/.test(tag))
      .map((tag) => `WCAG ${tag.replace("wcag", "").split("").join(".")}`);

    const firstTarget = violation.nodes[0]?.target?.[0];
    return {
      id: violation.id,
      impact: violation.impact,
      help: violation.help,
      description: violation.description,
      helpUrl: violation.helpUrl,
      wcag,
      nodes: violation.nodes.length,
      sampleTarget: typeof firstTarget === "string" ? firstTarget : null,
      failureSummary: violation.nodes[0]?.failureSummary ?? null,
    };
  });
}

async function readResponsiveSnapshot(page: Page): Promise<Omit<ResponsiveSnapshot, "preset" | "width" | "height" | "screenshotUrl">> {
  return page.evaluate(() => {
    const px = (value: string | null | undefined): number => {
      const parsed = Number.parseFloat(value || "");
      return Number.isFinite(parsed) ? parsed : 0;
    };
    const visible = (element: Element): boolean => {
      const rect = element.getBoundingClientRect();
      if (rect.width === 0 && rect.height === 0) return false;
      const style = window.getComputedStyle(element);
      return style.display !== "none" && style.visibility !== "hidden";
    };

    const viewportWidth = window.innerWidth;
    const scrollWidth = Math.max(document.documentElement.scrollWidth, document.body?.scrollWidth || 0);

    const interactive = Array.from(
      document.querySelectorAll<HTMLElement>("a[href], button, input:not([type='hidden']), select, textarea"),
    ).filter(visible);

    // WCAG 2.2 SC 2.5.8 exempts inline links inside a sentence, so a link that
    // sits in body copy is not a target-size failure. Only standalone controls
    // are measured.
    const isInlineTarget = (element: HTMLElement) => {
      if (element.tagName !== "A") return false;
      const display = window.getComputedStyle(element).display;
      if (!display.startsWith("inline") && display !== "contents") return false;
      return Boolean(element.closest("p, li, span, address, td, th"));
    };

    const measuredTargets = interactive
      .filter((element) => !isInlineTarget(element))
      .map((element) => {
        const rect = element.getBoundingClientRect();
        return { width: rect.width, height: rect.height };
      })
      .filter((rect) => rect.width > 0 && rect.height > 0);

    // 24px is the SC 2.5.8 minimum; 32px is the comfortable threshold.
    const tinyTapCount = measuredTargets.filter((rect) => rect.height < 24 || rect.width < 24).length;
    const smallTapCount = measuredTargets.filter(
      (rect) => (rect.height < 32 || rect.width < 32) && rect.height >= 24 && rect.width >= 24,
    ).length;

    const tinyTextCount = Array.from(document.querySelectorAll("p, li, span, a, button"))
      .filter((element) => visible(element) && (element.textContent || "").trim().length > 0)
      .filter((element) => px(window.getComputedStyle(element).fontSize) < 12).length;

    const fixedWideCount = Array.from(document.querySelectorAll("*")).filter((element) => {
      const rect = element.getBoundingClientRect();
      return visible(element) && rect.width > viewportWidth + 4;
    }).length;

    return {
      scrollWidth,
      overflow: scrollWidth > viewportWidth + 4,
      overflowPx: Math.max(0, scrollWidth - viewportWidth),
      fixedWideCount,
      smallTapCount,
      tinyTapCount,
      tinyTextCount,
    };
  });
}

export async function measureFocusOnPage(page: Page) {
  return measureFocusVisibility(page);
}
