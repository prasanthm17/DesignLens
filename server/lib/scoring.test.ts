import { test } from "node:test";
import assert from "node:assert/strict";
import {
  compareToPrevious,
  countBySeverity,
  gradeLabel,
  remediationImpact,
  scoreAudit,
  scoreCategory,
  severityForWeight,
  sortBySeverity,
  type AuditCheck,
} from "./scoring";

function check(partial: Partial<AuditCheck> & Pick<AuditCheck, "status">): AuditCheck {
  return {
    id: Math.random().toString(36).slice(2),
    label: "check",
    category: "accessibility",
    weight: 1,
    observed: "observed",
    expected: "expected",
    detection: "automated",
    ...partial,
  };
}

test("scoreCategory returns 100 when every weighted check passes", () => {
  const result = scoreCategory("accessibility", [check({ status: "pass" }), check({ status: "pass", weight: 3 })]);
  assert.equal(result.score, 100);
  assert.equal(result.totalWeight, 4);
});

test("scoreCategory halves the contribution of a warning", () => {
  const result = scoreCategory("usability", [
    check({ category: "usability", status: "pass", weight: 2 }),
    check({ category: "usability", status: "warn", weight: 2 }),
  ]);
  assert.equal(result.score, 75);
});

test("scoreCategory ignores not-applicable checks instead of scoring them zero", () => {
  const result = scoreCategory("content", [
    check({ category: "content", status: "pass", weight: 2 }),
    check({ category: "content", status: "na", weight: 8 }),
  ]);
  assert.equal(result.score, 100);
  assert.equal(result.totalWeight, 2);
});

test("scoreCategory excludes manual prompts from the score", () => {
  const result = scoreCategory("consistency", [
    check({ category: "consistency", status: "pass", weight: 2 }),
    check({ category: "consistency", status: "na", weight: 5, detection: "manual" }),
  ]);
  assert.equal(result.score, 100);
  assert.equal(result.manualChecks, 1);
});

test("scoreCategory returns null when nothing could be measured", () => {
  const result = scoreCategory("performance", [check({ category: "performance", status: "na", weight: 3 })]);
  assert.equal(result.score, null);
});

test("scoreAudit normalises weights across evaluated categories only", () => {
  const accessibility = scoreCategory("accessibility", [check({ status: "pass" })]);
  const usability = scoreCategory("usability", [check({ category: "usability", status: "fail" })]);
  const content = scoreCategory("content", [check({ category: "content", status: "na" })]);

  const { overall, evaluated, weights } = scoreAudit([accessibility, usability, content]);

  // accessibility 0.24 and usability 0.20 → 0.24/0.44 * 100 + 0 = 54.5 → 55
  assert.deepEqual(evaluated, ["accessibility", "usability"]);
  assert.equal(overall, 55);
  assert.ok(Math.abs((weights.accessibility ?? 0) - 0.24 / 0.44) < 0.001);
});

test("scoreAudit reports no score when no category evaluated", () => {
  const { overall } = scoreAudit([scoreCategory("content", [check({ category: "content", status: "na" })])]);
  assert.equal(overall, null);
});

test("gradeLabel maps score bands", () => {
  assert.equal(gradeLabel(null), "Not evaluated");
  assert.equal(gradeLabel(95), "Excellent");
  assert.equal(gradeLabel(80), "Strong");
  assert.equal(gradeLabel(65), "Fair");
  assert.equal(gradeLabel(50), "Weak");
  assert.equal(gradeLabel(20), "Critical");
});

test("severityForWeight escalates with importance", () => {
  assert.equal(severityForWeight(3), "critical");
  assert.equal(severityForWeight(2), "high");
  assert.equal(severityForWeight(1), "medium");
  assert.equal(severityForWeight(0.5), "low");
  assert.equal(severityForWeight(0.2), "informational");
});

test("countBySeverity and sortBySeverity keep a stable severity order", () => {
  const findings = [{ severity: "low" }, { severity: "critical" }, { severity: "medium" }, { severity: "critical" }];
  const counts = countBySeverity(findings);
  assert.equal(counts.critical, 2);
  assert.equal(counts.low, 1);
  assert.deepEqual(sortBySeverity(findings).map((finding) => finding.severity), [
    "critical",
    "critical",
    "medium",
    "low",
  ]);
});

test("remediationImpact is bounded and grows with severity", () => {
  const light = remediationImpact(
    { critical: 0, high: 0, medium: 0, low: 1, informational: 0 },
    4,
  );
  const heavy = remediationImpact(
    { critical: 3, high: 2, medium: 1, low: 0, informational: 0 },
    4,
  );
  assert.ok(heavy > light);
  assert.ok(heavy <= 40);
});

test("compareToPrevious returns null when either side is missing", () => {
  assert.equal(compareToPrevious(null, 50), null);
  assert.equal(compareToPrevious(50, null), null);
  assert.equal(compareToPrevious(60, 55), 5);
});
