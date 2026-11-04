/**
 * Pure text / style analysis helpers.
 *
 * These are deliberately dependency-free so the numbers they produce can be
 * unit-tested and audited. Every function documents the approximation it makes.
 */

/** Vowel-group estimate of syllables — the standard approximation used by Flesch scoring. */
export function countSyllables(word: string): number {
  const clean = word.toLowerCase().replace(/[^a-z]/g, "");
  if (!clean) return 0;
  if (clean.length <= 3) return 1;

  const groups = clean
    .replace(/(?:[^laeiouy]es|ed|[^laeiouy]e)$/, "")
    .replace(/^y/, "")
    .match(/[aeiouy]{1,2}/g);

  return groups ? groups.length : 1;
}

export interface ReadabilityResult {
  words: number;
  sentences: number;
  syllables: number;
  /** Flesch Reading Ease: 60–100 plain, 30–60 difficult, 0–30 very difficult. */
  fleschReadingEase: number | null;
  averageSentenceLength: number;
  longWordRatio: number;
}

export function readability(text: string): ReadabilityResult {
  const normalized = text.replace(/\s+/g, " ").trim();
  const words = normalized ? normalized.split(" ").filter((word) => /[a-zA-Z]/.test(word)) : [];
  const sentences = normalized
    ? normalized.split(/[.!?]+(?:\s|$)/).filter((sentence) => sentence.trim().length > 1)
    : [];

  if (words.length === 0) {
    return {
      words: 0,
      sentences: 0,
      syllables: 0,
      fleschReadingEase: null,
      averageSentenceLength: 0,
      longWordRatio: 0,
    };
  }

  const syllables = words.reduce((sum, word) => sum + countSyllables(word), 0);
  const sentenceCount = Math.max(1, sentences.length);
  const longWords = words.filter((word) => countSyllables(word) >= 3).length;

  const flesch = 206.835 - 1.015 * (words.length / sentenceCount) - 84.6 * (syllables / words.length);

  return {
    words: words.length,
    sentences: sentences.length,
    syllables,
    fleschReadingEase: Math.round(clamp(flesch, 0, 121)),
    averageSentenceLength: round(words.length / sentenceCount, 1),
    longWordRatio: round(longWords / words.length, 3),
  };
}

export interface ValueStat {
  value: string;
  count: number;
}

/** Counts distinct style values, ignoring empty/none and normalising whitespace. */
export function distinctValues(values: Array<string | null | undefined>, limit = 12): ValueStat[] {
  const counts = new Map<string, number>();
  for (const raw of values) {
    if (!raw) continue;
    const value = raw.replace(/\s+/g, " ").trim().toLowerCase();
    if (!value || value === "none" || value === "normal" || value === "0px") continue;
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([value, count]) => ({ value, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, limit);
}

/**
 * Token drift score: 1 means every element shares one value, 0 means each
 * element uses a different value. Used for radius, shadow and spacing scales.
 */
export function tokenConsistency(values: Array<string | null | undefined>): number {
  const present = values.filter((value): value is string => Boolean(value)).length;
  if (present === 0) return 1;
  const distinct = distinctValues(values, 500).length;
  if (distinct <= 1) return 1;
  return round(clamp(1 - (distinct - 1) / Math.max(present, 2), 0, 1), 3);
}

export function average(values: number[]): number {
  if (values.length === 0) return 0;
  return round(values.reduce((sum, value) => sum + value, 0) / values.length, 2);
}

export function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : round((sorted[mid - 1] + sorted[mid]) / 2, 2);
}

export function parsePx(value: string | null | undefined): number | null {
  if (!value) return null;
  const match = /^(-?[\d.]+)px$/.exec(value.trim());
  return match ? Number.parseFloat(match[1]) : null;
}

/** Relative luminance of an #rrggbb colour (WCAG 2.x definition). */
export function relativeLuminance(hex: string): number | null {
  const match = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!match) return null;
  const int = Number.parseInt(match[1], 16);
  const channels = [(int >> 16) & 255, (int >> 8) & 255, int & 255].map((channel) => {
    const srgb = channel / 255;
    return srgb <= 0.04045 ? srgb / 12.92 : ((srgb + 0.055) / 1.055) ** 2.4;
  });
  return round(0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2], 4);
}

export function contrastRatio(foreground: string, background: string): number | null {
  const a = relativeLuminance(foreground);
  const b = relativeLuminance(background);
  if (a === null || b === null) return null;
  const lighter = Math.max(a, b);
  const darker = Math.min(a, b);
  return round((lighter + 0.05) / (darker + 0.05), 2);
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function round(value: number, digits: number): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

export function formatBytes(kb: number | null): string {
  if (kb === null) return "unknown";
  if (kb >= 1024) return `${round(kb / 1024, 1)} MB`;
  return `${round(kb, 1)} KB`;
}
