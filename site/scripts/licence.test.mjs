// The licence terms are stated once in site/data/meta.yml and backed by files at the repo root:
// code under PolyForm Noncommercial 1.0.0, content and data under CC BY-NC 4.0, and a
// COMMERCIAL.md that says how to get a paid licence. Run: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { loadCollection } from "../lib/load.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (f) => readFileSync(join(ROOT, f), "utf8");

test("meta.yml names the two licences", () => {
  const meta = loadCollection("meta");
  assert.equal(meta.content_licence, "CC BY-NC 4.0");
  assert.equal(meta.code_licence, "PolyForm Noncommercial 1.0.0");
});

test("LICENSE is the PolyForm Noncommercial 1.0.0 text with a Required Notice for the licensor", () => {
  const t = read("LICENSE");
  assert.match(t, /^Required Notice: Copyright .*Riera Technologies Ltd/m);
  assert.match(t, /# PolyForm Noncommercial License 1\.0\.0/);
  assert.match(t, /https:\/\/polyformproject\.org\/licenses\/noncommercial\/1\.0\.0/);
});

test("LICENSE-CONTENT carries the CC BY-NC 4.0 notice and link", () => {
  const t = read("LICENSE-CONTENT");
  assert.match(t, /Attribution-NonCommercial 4\.0 International/);
  assert.match(t, /https:\/\/creativecommons\.org\/licenses\/by-nc\/4\.0\//);
  assert.match(t, /Riera Technologies Ltd/);
});

test("COMMERCIAL.md asks for attribution to Riera Technologies Ltd and routes paid licences through an issue", () => {
  const t = read("COMMERCIAL.md");
  assert.match(t, /Riera Technologies Ltd/);
  assert.match(t, /paid licen[cs]e/i);
  assert.match(t, /GitHub issue/i);
});

test("no leftover MIT or CC BY 4.0 (attribution-only) declaration in the files that state the licence", () => {
  for (const f of ["README.md", "docs/sources.md", "site/package.json"]) {
    assert.ok(existsSync(join(ROOT, f)), f);
    assert.doesNotMatch(read(f), /\bMIT\b|CC BY 4\.0/, f);
  }
});
