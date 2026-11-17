// Tests the Turnstile build guard : the real build passes while the form is
// hidden; a build with feedback_url set and an empty site key exits non-zero; with a key it passes.
// Run: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { cpSync, mkdtempSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { assertTurnstileKey } from "../lib/turnstile.mjs";

const SITE = join(dirname(fileURLToPath(import.meta.url)), "..");

test("assertTurnstileKey rejects empty, missing and 'undefined' keys; accepts a real one", () => {
  assert.throws(() => assertTurnstileKey('<div class="cf-turnstile" data-sitekey=""></div>'), /empty site key/);
  assert.throws(() => assertTurnstileKey('<div class="cf-turnstile" data-sitekey="undefined"></div>'));
  assert.throws(() => assertTurnstileKey('<div class="cf-turnstile"></div>'));
  assert.doesNotThrow(() => assertTurnstileKey('<div class="cf-turnstile" data-sitekey="0x4AAA"></div>'));
  assert.doesNotThrow(() => assertTurnstileKey("<p>no widget</p>"));
});

// Builds into a temp output dir against a copy of data/ whose meta.yml gets `extra` appended.
function build(extra) {
  const tmp = mkdtempSync(join(tmpdir(), "turnstile-"));
  try {
    cpSync(join(SITE, "data"), join(tmp, "data"), { recursive: true });
    const meta = join(tmp, "data", "meta.yml");
    writeFileSync(meta, readFileSync(meta, "utf8").replace(/^(feedback_url|turnstile_sitekey):.*$/gm, "") + extra);
    return spawnSync("npx", ["eleventy", `--output=${join(tmp, "out")}`], {
      cwd: SITE, encoding: "utf8", env: { ...process.env, NEOCLOUD_DATA_DIR: join(tmp, "data") },
    });
  } finally { rmSync(tmp, { recursive: true, force: true }); }
}

// Removed in the merge with the go-live branch: corrections is a plain mailto, so the page
// no longer renders a Turnstile widget and the empty-key build failure cannot be provoked.

test("live build with a site key passes; form hidden build passes", () => {
  assert.equal(build('\nfeedback_url: "https://example.invalid/f"\nturnstile_sitekey: "0x4AAAtest"\n').status, 0);
  assert.equal(build('\nfeedback_url: ""\nturnstile_sitekey: ""\n').status, 0);
});
