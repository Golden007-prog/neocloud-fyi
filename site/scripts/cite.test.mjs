// Every built provider page must carry the cite-this-row block with its permalink and the
// row's checked date. Reads site/_site, so it needs `npm run build` first; the test is
// reported as skipped (never a silent pass) when the build output is absent.
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { loadCollection } from "../lib/load.mjs";

const OUT = join(dirname(fileURLToPath(import.meta.url)), "..", "_site", "providers");

test("each provider page has a cite block with permalink and checked date",
  { skip: !existsSync(OUT) && "run npm run build first" }, () => {
    const rows = loadCollection("providers");
    assert.ok(rows.length > 0);
    for (const row of rows) {
      const html = readFileSync(join(OUT, row.id, "index.html"), "utf8");
      const permalink = "https://neocloud.fyi/providers/" + row.id + "/";
      assert.match(html, /id="cite"/, row.id + ": no cite block");
      assert.ok(html.includes(permalink), row.id + ": no permalink");
      assert.ok(html.includes('Source: <a href="' + row.source + '"'), row.id + ": no source link in cite block");
      assert.ok(html.includes("row last confirmed " + String(row.checked).slice(0, 10)), row.id + ": no checked date");
    }
  });
