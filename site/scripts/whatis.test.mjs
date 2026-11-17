// Tests the built page /what-is-a-neocloud/: six checklist items, every provider link resolves
// to a built provider page, and no scrub-list word. Builds the site first if _site is missing
// the page. Run: npm test
import { test, before } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { FORBIDDEN_STRINGS } from "../lib/collections.mjs";

const SITE = join(dirname(fileURLToPath(import.meta.url)), "..");
const PAGE = join(SITE, "_site", "what-is-a-neocloud", "index.html");
// The maintainer-configured scrub terms (see lib/collections.mjs).
const SCRUB = [...new Set(FORBIDDEN_STRINGS)];

before(() => {
  if (!existsSync(PAGE)) {
    execFileSync("npx", ["eleventy"], { cwd: SITE, stdio: "pipe" });
  }
});

const html = () => readFileSync(PAGE, "utf8");

test("the page has exactly 6 checklist items", () => {
  const n = (html().match(/<li class="check-item"/g) ?? []).length;
  assert.equal(n, 6);
});

test("every provider link resolves to a built provider page", () => {
  const ids = [...html().matchAll(/href="\/providers\/([a-z0-9-]+)\/"/g)].map((m) => m[1]);
  assert.ok(ids.length > 0, "expected at least one provider link");
  for (const id of ids) {
    if (id === "category") continue; // /providers/category/<id>/ is checked below
    assert.ok(existsSync(join(SITE, "_site", "providers", id, "index.html")), `missing /providers/${id}/`);
  }
  for (const m of html().matchAll(/href="\/providers\/category\/([a-z0-9-]+)\/"/g)) {
    assert.ok(existsSync(join(SITE, "_site", "providers", "category", m[1], "index.html")), `missing category ${m[1]}`);
  }
});

test("the page contains no scrub-list word", () => {
  const text = html().toLowerCase();
  for (const w of SCRUB) assert.ok(!text.includes(w), `scrub term present: ${w}`);
});

test("H2s cover hyperscaler, colocation and sovereign cloud, each with sourced claims", () => {
  const h2 = [...html().matchAll(/<h2[^>]*>(.*?)<\/h2>/gs)].map((m) => m[1].toLowerCase());
  for (const term of ["hyperscaler", "colocation", "sovereign"]) {
    assert.ok(h2.some((t) => t.includes(term)), `no H2 containing "${term}"`);
  }
  for (const id of ["compared", "colocation", "sovereign"]) {
    const sec = html().split(`<section id="${id}">`)[1]?.split("</section>")[0] ?? "";
    assert.match(sec, /Source: <a href="https?:\/\//, `${id}: no source link`);
    assert.match(sec, /Last confirmed \d/, `${id}: no checked date`);
  }
});

test("every internal link on the page resolves to a built page", () => {
  for (const m of html().matchAll(/href="(\/[a-z0-9\/-]*)"/g)) {
    assert.ok(existsSync(join(SITE, "_site", m[1], "index.html")), `broken link ${m[1]}`);
  }
});
