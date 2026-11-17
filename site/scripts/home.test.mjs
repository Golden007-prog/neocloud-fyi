// Tests the built home page: a "Recently confirmed" list of 5 provider rows, newest checked date
// first, each with a date and a link that resolves, plus an RSS link inside <main>.
// Builds the site first if _site/index.html is missing. Run: npm test
import { test, before } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const SITE = join(dirname(fileURLToPath(import.meta.url)), "..");
const PAGE = join(SITE, "_site", "index.html");

before(() => {
  if (!existsSync(PAGE)) execFileSync("npx", ["eleventy"], { cwd: SITE, stdio: "pipe" });
});

const html = () => readFileSync(PAGE, "utf8");
const recent = () => html().split('id="recent"')[1]?.split("</section>")[0] ?? "";

test("Recently confirmed lists 5 rows, newest first, each with date and a resolving link", () => {
  const re = /<li><a href="\/providers\/([a-z0-9-]+)\/">[^<]+<\/a> &middot; last confirmed (\d{4}-\d{2}-\d{2})<\/li>/g;
  const items = [...recent().matchAll(re)];
  assert.equal(items.length, 5);
  const dates = items.map((m) => m[2]);
  assert.deepEqual(dates, [...dates].sort().reverse(), "not sorted by checked date desc");
  for (const [, id] of items) {
    assert.ok(existsSync(join(SITE, "_site", "providers", id, "index.html")), `missing /providers/${id}/`);
  }
});

test("no changelog or feed in the launch scope", () => {
  const page = html();
  assert.ok(!page.includes("/feed.xml"), "home still links /feed.xml");
  assert.ok(!page.includes("/changelog/"), "home still links /changelog/");
  assert.ok(!page.includes("rss+xml"), "feed autodiscovery link still in head");
  assert.ok(!existsSync(join(SITE, "_site", "feed.xml")), "feed.xml still built");
  assert.ok(!existsSync(join(SITE, "_site", "changelog")), "changelog page still built");
});
