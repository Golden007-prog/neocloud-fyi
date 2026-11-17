// The build-blocking word list (rule 5) is set per maintainer through the environment, so the
// public repo carries no private terms. Run: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const SITE = join(dirname(fileURLToPath(import.meta.url)), "..");
const COLLECTIONS = join(SITE, "lib", "collections.mjs");

function listWith(env) {
  const r = spawnSync(
    process.execPath,
    ["--input-type=module", "-e", `import { FORBIDDEN_STRINGS as f } from ${JSON.stringify(COLLECTIONS)}; console.log(JSON.stringify(f));`],
    { encoding: "utf8", env: { PATH: process.env.PATH, ...env } },
  );
  assert.equal(r.status, 0, r.stderr);
  return JSON.parse(r.stdout);
}

test("NEOCLOUD_FORBIDDEN_STRINGS replaces the list; entries are trimmed, lower-cased and non-empty", () => {
  assert.deepEqual(listWith({ NEOCLOUD_FORBIDDEN_STRINGS: " Alpha ,beta,, GAMMA " }), ["alpha", "beta", "gamma"]);
});

test("without the variable the list is three neutral placeholders (validate.test.mjs reads index 2)", () => {
  const list = listWith({});
  assert.equal(list.length, 3);
  assert.ok(list.every((s) => /^placeholder-term-\d$/.test(s)), list.join(","));
});
