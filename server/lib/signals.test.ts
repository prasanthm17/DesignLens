import { test } from "node:test";
import assert from "node:assert/strict";
import {
  average,
  contrastRatio,
  countSyllables,
  distinctValues,
  median,
  parsePx,
  readability,
  relativeLuminance,
  tokenConsistency,
} from "./signals";

test("countSyllables approximates English words", () => {
  assert.equal(countSyllables("cat"), 1);
  assert.equal(countSyllables("table"), 2);
  assert.equal(countSyllables("accessibility"), 6);
});

test("readability scores plain copy higher than dense copy", () => {
  const plain = readability(
    "The cart is empty. Add an item to continue. You can save it for later.",
  );
  const dense = readability(
    "Notwithstanding the aforementioned configuration discrepancies, the implementation team must endeavour to reconcile the outstanding documentation requirements prior to deployment authorisation.",
  );

  assert.ok(plain.fleschReadingEase !== null && dense.fleschReadingEase !== null);
  assert.ok((plain.fleschReadingEase as number) > (dense.fleschReadingEase as number));
  assert.ok(plain.averageSentenceLength < dense.averageSentenceLength);
});

test("readability handles empty input without inventing numbers", () => {
  const result = readability("   ");
  assert.equal(result.words, 0);
  assert.equal(result.fleschReadingEase, null);
});

test("distinctValues normalises and ignores empty values", () => {
  const result = distinctValues(["  #FFF ", "#fff", null, "", "none", "#000"]);
  assert.equal(result.length, 2);
  assert.equal(result[0].count, 2);
});

test("tokenConsistency approaches zero as values sprawl", () => {
  assert.equal(tokenConsistency([]), 1);
  assert.equal(tokenConsistency(["8px", "8px", "8px"]), 1);
  const sprawl = tokenConsistency(["4px", "6px", "8px", "12px", "16px", "20px", "24px", "28px"]);
  assert.ok(sprawl < 0.2);
});

test("contrastRatio follows the WCAG luminance formula", () => {
  assert.equal(contrastRatio("#000000", "#ffffff"), 21);
  assert.equal(contrastRatio("#ffffff", "#ffffff"), 1);
  const grey = contrastRatio("#8a94a6", "#ffffff");
  assert.ok(grey !== null && grey > 2.5 && grey < 3.5);
});

test("relativeLuminance rejects malformed colours", () => {
  assert.equal(relativeLuminance("rgb(0,0,0)"), null);
  assert.equal(relativeLuminance("#fff"), null);
});

test("parsePx only accepts pixel values", () => {
  assert.equal(parsePx("16px"), 16);
  assert.equal(parsePx("1.5rem"), null);
  assert.equal(parsePx(null), null);
});

test("average and median handle empty arrays", () => {
  assert.equal(average([]), 0);
  assert.equal(median([]), 0);
  assert.equal(median([3, 1, 2]), 2);
  assert.equal(median([4, 1, 3, 2]), 2.5);
});
