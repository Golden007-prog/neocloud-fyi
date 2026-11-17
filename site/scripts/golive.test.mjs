// Go-live rules for the public site (decisions of 2026-11-01): a privacy page exists and is
// linked from every footer, the only contact is the plain mailto corrections@neocloud.fyi,
// the availability line is gone, and no built page loads a script, font, image or frame from
// another origin. Reads site/_site (run `npm run build` first); reported as skipped, never a
// silent pass, when the build output is absent.
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const OUT = join(dirname(fileURLToPath(import.meta.url)), "..", "_site");
const skip = !existsSync(OUT) && "run npm run build first";
const MAILBOX = "corrections@neocloud.fyi";

const walk = (dir) => readdirSync(dir).flatMap((n) => {
  const p = join(dir, n);
  return statSync(p).isDirectory() ? walk(p) : [p];
});
const pages = () => walk(OUT).filter((p) => p.endsWith(".html"));
const read = (rel) => readFileSync(join(OUT, rel), "utf8");

test("/privacy/ exists and states the facts a reader needs", { skip }, () => {
  const html = read("privacy/index.html");
  assert.match(html, /<title>Privacy/);
  for (const needle of [
    /no cookies/i, /no analytics/i, /Cloudflare/, /https:\/\/www\.cloudflare\.com\/privacypolicy\//,
    /Joan Marc Riera Duocastella/, /United Kingdom|UK/, /href="mailto:corrections@neocloud\.fyi"/,
    /href="\/sources\/"/,
  ]) assert.match(html, needle);
  assert.doesNotMatch(html, /<script/i);
});

test("every page footer links to /privacy/", { skip }, () => {
  for (const f of pages()) assert.match(readFileSync(f, "utf8"), /href="\/privacy\/"/, f);
});

test("the availability line is not on any page", { skip }, () => {
  for (const f of pages()) {
    assert.doesNotMatch(readFileSync(f, "utf8"), /Available for AI-infrastructure work/, f);
  }
});

test("corrections page offers the mailto and no form", { skip }, () => {
  const html = read("corrections/index.html");
  assert.match(html, /href="mailto:corrections@neocloud\.fyi"/);
  assert.doesNotMatch(html, /<form|<script|not live yet/i);
});

test("the only e-mail address in the build is the corrections mailbox", { skip }, () => {
  for (const f of walk(OUT).filter((p) => /\.(html|xml|css|js|json|csv)$/.test(p))) {
    const found = readFileSync(f, "utf8").match(/[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+\.[A-Za-z.]{2,}/g) || [];
    for (const m of found) assert.equal(m.toLowerCase(), MAILBOX, `${f}: ${m}`);
  }
});

test("no page loads a script, stylesheet, font, image or frame from another origin", { skip }, () => {
  const foreign = /<(?:script|iframe|img|source|video|audio)\b[^>]*\bsrc=["'](?:https?:)?\/\//i;
  const foreignLink = /<link\b[^>]*\bhref=["'](?:https?:)?\/\//i;
  for (const f of pages()) {
    const html = readFileSync(f, "utf8");
    assert.doesNotMatch(html, foreign, f);
    assert.doesNotMatch(html, foreignLink, f);
  }
  for (const f of walk(OUT).filter((p) => p.endsWith(".css"))) {
    assert.doesNotMatch(readFileSync(f, "utf8"), /url\(\s*["']?(?:https?:)?\/\//i, f);
  }
});
