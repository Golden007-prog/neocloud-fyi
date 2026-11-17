// The built site must load no third-party fonts and every self-hosted font file that
// fonts.css points at must exist. Reads site/_site (run `npm run build` first); reported as
// skipped, never a silent pass, when the build output is absent.
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const OUT = join(dirname(fileURLToPath(import.meta.url)), "..", "_site");
const skip = !existsSync(OUT) && "run npm run build first";

const walk = (dir) => readdirSync(dir).flatMap((n) => {
  const p = join(dir, n);
  return statSync(p).isDirectory() ? walk(p) : [p];
});

test("no built page or stylesheet references Google Fonts", { skip }, () => {
  for (const f of walk(OUT).filter((p) => /\.(html|css|xml)$/.test(p))) {
    const text = readFileSync(f, "utf8");
    assert.doesNotMatch(text, /fonts\.(googleapis|gstatic)\.com/, f);
  }
});

test("every font file named in fonts.css was copied into the build", { skip }, () => {
  const css = readFileSync(join(OUT, "assets", "css", "fonts.css"), "utf8");
  const urls = [...css.matchAll(/url\("([^"]+)"\)/g)].map((m) => m[1]);
  assert.ok(urls.length >= 6, "expected at least 6 @font-face sources");
  for (const u of urls) assert.ok(existsSync(join(OUT, u)), "missing " + u);
});
