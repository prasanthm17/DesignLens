/** Runs axe-core against a URL and prints failing nodes with selectors. */
import { chromium } from "playwright";
import axeCore from "axe-core";

const url = process.argv[2] || "http://localhost:3000/";
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await page.goto(url, { waitUntil: "networkidle" });
await page.addScriptTag({ content: axeCore.source });

const results = await page.evaluate(async () => {
  // @ts-ignore
  return await window.axe.run(document, { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa", "best-practice"] } });
});

for (const violation of results.violations) {
  console.log(`\n[${violation.impact}] ${violation.id} — ${violation.help}`);
  for (const node of violation.nodes.slice(0, 3)) {
    console.log("  selector:", node.target.join(" "));
    console.log("  html:    ", node.html.slice(0, 140));
    console.log("  summary: ", (node.failureSummary || "").replace(/\n/g, " ").slice(0, 220));
  }
}
if (results.violations.length === 0) console.log("no violations");

await browser.close();
