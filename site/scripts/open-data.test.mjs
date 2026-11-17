// Tests the open-data export after a build: _site/data/providers.json and providers.csv exist,
// JSON parses, row counts equal providers.yml, every row has source and checked, and the
// licence is present in both files. Builds first if the files are missing. Run: npm test
import { test, before } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { loadCollection } from "../lib/load.mjs";
import { providersCsv, COLUMNS } from "../lib/open-data.mjs";

const SITE = join(dirname(fileURLToPath(import.meta.url)), "..");
const JSON_PATH = join(SITE, "_site", "data", "providers.json");
const CSV_PATH = join(SITE, "_site", "data", "providers.csv");

before(() => {
  if (!existsSync(JSON_PATH) || !existsSync(CSV_PATH)) execFileSync("npx", ["eleventy"], { cwd: SITE, stdio: "pipe" });
});

// Minimal RFC 4180 parser, enough to read back what providersCsv writes.
function parseCsv(text) {
  const rows = [];
  let row = [], f = "", q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"') { if (text[i + 1] === '"') { f += '"'; i++; } else q = false; } else f += c;
    } else if (c === '"') q = true;
    else if (c === ",") { row.push(f); f = ""; }
    else if (c === "\n") { if (f.endsWith("\r")) f = f.slice(0, -1); row.push(f); rows.push(row); row = []; f = ""; }
    else f += c;
  }
  return rows;
}

test("JSON parses, count equals providers.yml, rows carry source, checked and licence", () => {
  const yml = loadCollection("providers");
  const doc = JSON.parse(readFileSync(JSON_PATH, "utf8"));
  assert.equal(doc.licence, "CC BY-NC 4.0");
  assert.match(doc.licence_url, /^https:\/\/creativecommons\.org\/licenses\/by-nc\/4\.0\//);
  assert.equal(doc.providers.length, yml.length);
  assert.equal(doc.count, yml.length);
  for (const r of doc.providers) {
    assert.match(r.source, /^https?:\/\//, `${r.id}: source`);
    assert.match(r.checked, /^\d{4}-\d{2}-\d{2}$/, `${r.id}: checked`);
    assert.equal(r.licence, "CC BY-NC 4.0");
  }
});

test("CSV has a header, one line per provider, source and checked on every row", () => {
  const yml = loadCollection("providers");
  const rows = parseCsv(readFileSync(CSV_PATH, "utf8"));
  assert.deepEqual(rows[0], COLUMNS);
  const body = rows.slice(1);
  assert.equal(body.length, yml.length);
  const [iSrc, iChk, iLic] = ["source", "checked", "licence"].map((c) => COLUMNS.indexOf(c));
  for (const r of body) {
    assert.equal(r.length, COLUMNS.length, `${r[0]}: column count`);
    assert.match(r[iSrc], /^https?:\/\//);
    assert.match(r[iChk], /^\d{4}-\d{2}-\d{2}$/);
    assert.equal(r[iLic], "CC BY-NC 4.0");
  }
});

test("CSV quoting round-trips commas, quotes and newlines", () => {
  const csv = providersCsv([{ id: "x", name: 'A, "B"', note: "l1\nl2", source: "https://e.com", checked: "2026-01-01" }]);
  const rows = parseCsv(csv);
  assert.equal(rows[1][COLUMNS.indexOf("name")], 'A, "B"');
  assert.equal(rows[1][COLUMNS.indexOf("note")], "l1\nl2");
});
