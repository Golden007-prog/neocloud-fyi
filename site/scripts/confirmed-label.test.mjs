// The public date label reads "Last confirmed", not a bare "Checked" (round-6 finding #44):
// the date means at least one field of the row was confirmed, not that the whole row was checked.
// Reads site/_site, so it needs `npm run build` first; reported as skipped when the build is absent.
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const SITE = join(dirname(fileURLToPath(import.meta.url)), "..", "_site");
const PROV = join(SITE, "providers");
const skip = !existsSync(PROV) && "run npm run build first";

function pages(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((d) =>
    d.isDirectory() ? pages(join(dir, d.name)) : d.name.endsWith(".html") ? [join(dir, d.name)] : []);
}

test("a provider page shows the new 'Last confirmed' label", { skip }, () => {
  const id = readdirSync(PROV, { withFileTypes: true }).filter((d) => d.isDirectory() && d.name !== "category").map((d) => d.name).sort()[0];
  const html = readFileSync(join(PROV, id, "index.html"), "utf8");
  assert.match(html, /Last confirmed \d{4}-\d{2}-\d{2}/);
});

test("no built page still prints the old bare 'Checked <date>' or 'last checked <date>' label", { skip }, () => {
  // "Re-checked ..." inside stored notes is data, not the label, so a hyphen or word char before it is skipped.
  const old = /(?<![-\w])(?:last )?checked \d{4}-\d{2}-\d{2}/i;
  const bad = pages(SITE).filter((f) => old.test(readFileSync(f, "utf8"))).map((f) => f.slice(SITE.length));
  assert.deepEqual(bad, []);
});
