// Each test runs scripts/validate.mjs against one deliberately broken fixture and asserts
// the matching fail-rule fired. node --test, no extra dependency: `npm test`.
//
// Rule 5 has no committed fixture on purpose: a file under site/ holding one of the
// forbidden strings would itself break R1. The test builds that file in a temp directory
// at run time, from FORBIDDEN_STRINGS, and points NEOCLOUD_SITE_DIR at it.
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { FORBIDDEN_STRINGS } from "../lib/collections.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));

// Returns {code, out}. dataDir feeds lib/load.mjs; siteDir is the tree rule 5 scans.
const run = (dataDir, siteDir) => {
  const env = { ...process.env, NEOCLOUD_DATA_DIR: dataDir };
  if (siteDir) env.NEOCLOUD_SITE_DIR = siteDir;
  try {
    const out = execFileSync(process.execPath, [join(HERE, "validate.mjs")], {
      env, encoding: "utf8", stdio: "pipe",
    });
    return { code: 0, out };
  } catch (e) {
    return { code: e.status, out: `${e.stdout}${e.stderr}` };
  }
};

const fixture = (name) => join(HERE, "__fixtures__", name);

for (const [name, rule] of [["rule1", 1], ["rule2", 2], ["rule3", 3], ["rule4", 4]]) {
  test(`fixture ${name} trips rule ${rule}`, () => {
    const r = run(fixture(name));
    assert.equal(r.code, 1, `expected a non-zero exit for ${name}, got:\n${r.out}`);
    assert.match(r.out, new RegExp(`\\[rule ${rule}\\]`));
  });
}

test("operating_model without operating_model_source trips rule 6", () => {
  const r = run(fixture("opmodel-nosource"));
  assert.equal(r.code, 1, `expected a non-zero exit, got:\n${r.out}`);
  assert.match(r.out, /\[rule 6\]/);
});

test("operating_model with operating_model_source passes", () => {
  const r = run(fixture("opmodel-ok"));
  assert.equal(r.code, 0, `expected exit 0, got:\n${r.out}`);
});

test("operating_model_source on a deny-listed host trips rule 4", () => {
  const r = run(fixture("opmodel-denyhost"));
  assert.equal(r.code, 1, `expected a non-zero exit, got:\n${r.out}`);
  assert.match(r.out, /\[rule 4\]/);
});

test("facility without facility_source trips rule 7", () => {
  const r = run(fixture("opmodel-nofacsource"));
  assert.equal(r.code, 1, `expected a non-zero exit, got:\n${r.out}`);
  assert.match(r.out, /\[rule 7\]/);
});

test("malformed operating_model_source URL trips rule 1", () => {
  const r = run(fixture("opmodel-badurl"));
  assert.equal(r.code, 1, `expected a non-zero exit, got:\n${r.out}`);
  assert.match(r.out, /\[rule 1\]/);
});

test("operating_model outside the enum trips rule 1", () => {
  const r = run(fixture("opmodel-badenum"));
  assert.equal(r.code, 1, `expected a non-zero exit, got:\n${r.out}`);
  assert.match(r.out, /\[rule 1\]/);
});

test("a provider row without operating_model passes", () => {
  const r = run(fixture("opmodel-absent"));
  assert.equal(r.code, 0, `expected exit 0, got:\n${r.out}`);
});

test("rule 5 trips on a forbidden string under site/", () => {
  const dir = mkdtempSync(join(tmpdir(), "neocloud-rule5-"));
  try {
    writeFileSync(join(dir, "notes.md"), `A place called ${FORBIDDEN_STRINGS[2]}.\n`, "utf8");
    const r = run(dir, dir);
    assert.equal(r.code, 1, `expected a non-zero exit, got:\n${r.out}`);
    assert.match(r.out, /\[rule 5\]/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("a clean data directory passes", () => {
  const dir = mkdtempSync(join(tmpdir(), "neocloud-clean-"));
  try {
    const r = run(dir, dir);
    assert.equal(r.code, 0, `expected exit 0, got:\n${r.out}`);
    assert.match(r.out, /^OK|\nOK/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
