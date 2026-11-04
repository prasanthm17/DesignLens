import type { AuditCategory, Severity } from "./types";

export const CATEGORY_LABELS: Record<AuditCategory, string> = {
  accessibility: "Accessibility",
  usability: "Usability",
  "visual-design": "Visual design",
  responsive: "Responsive",
  content: "Content & UX writing",
  performance: "Performance",
  consistency: "Design consistency",
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

export const SEVERITY_ORDER: Severity[] = ["critical", "high", "medium", "low", "informational"];

export const SEVERITY_LABELS: Record<Severity, string> = {
  critical: "Critical",
  high: "High",
  medium: "Medium",
  low: "Low",
  informational: "Info",
};

export function scoreTone(score: number | null | undefined): "strong" | "fair" | "weak" | "none" {
  if (score === null || score === undefined) return "none";
  if (score >= 78) return "strong";
  if (score >= 62) return "fair";
  return "weak";
}

export function toneClass(score: number | null | undefined): string {
  return `tone-${scoreTone(score)}`;
}

export function toneBgClass(score: number | null | undefined): string {
  return `bg-tone-${scoreTone(score)}`;
}

export function gradeFor(score: number | null | undefined): string {
  if (score === null || score === undefined) return "Not evaluated";
  if (score >= 90) return "Excellent";
  if (score >= 78) return "Strong";
  if (score >= 62) return "Fair";
  if (score >= 45) return "Weak";
  return "Critical";
}

export function formatDate(value: string | Date | null | undefined, withTime = false): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    ...(withTime ? { hour: "2-digit", minute: "2-digit" } : {}),
  });
}

export function relativeTime(value: string | Date | null | undefined): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  const diff = Date.now() - date.getTime();
  const minutes = Math.round(diff / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days}d ago`;
  return formatDate(date);
}

export function formatDuration(ms: number | null | undefined): string {
  if (ms === null || ms === undefined) return "—";
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

export function toneForDelta(delta: number | null | undefined): string {
  if (delta === null || delta === undefined) return "text-muted-foreground";
  if (delta > 0) return "tone-strong";
  if (delta < 0) return "tone-weak";
  return "text-muted-foreground";
}

export function signed(delta: number | null | undefined): string {
  if (delta === null || delta === undefined) return "—";
  return `${delta > 0 ? "+" : ""}${delta}`;
}

export function pluralize(count: number, singular: string, plural?: string): string {
  return count === 1 ? singular : (plural ?? `${singular}s`);
}

export function truncate(value: string, max = 60): string {
  return value.length > max ? `${value.slice(0, max - 1)}…` : value;
}

export function hostFromUrl(url: string | null | undefined): string {
  if (!url) return "—";
  try {
    return new URL(url.includes("://") ? url : `https://${url}`).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

export function statusLabel(status: string): string {
  switch (status) {
    case "in-review":
      return "In review";
    case "wont-fix":
      return "Won't fix";
    case "open":
      return "Open";
    case "resolved":
      return "Resolved";
    case "running":
      return "Running";
    case "queued":
      return "Queued";
    case "completed":
      return "Completed";
    case "failed":
      return "Failed";
    case "archived":
      return "Archived";
    default:
      return status;
  }
}
