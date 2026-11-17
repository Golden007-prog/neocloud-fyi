#!/usr/bin/env node
// Trust rules for neocloud.fyi (spec section 4.3). Fails the build on any violation;
// warns, never fails, on a stale checked date. Run: npm run validate
//
// Env overrides, used by scripts/validate.test.mjs against __fixtures__/:
//   NEOCLOUD_DATA_DIR  - where the YAML lives (read by lib/load.mjs)
//   NEOCLOUD_SITE_DIR  - the tree rule 5 scans for forbidden strings
import { readFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { join, dirname, relative } from "node:path";
import { fileURLToPath } from "node:url";
// ajv/dist/2020 is the draft 2020-12 build. The plain "ajv" entry point only knows
// draft-07 and throws `no schema with key or ref ".../2020-12/schema"` on our schemas.
import Ajv from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import {
  COLLECTIONS, DENY_HOSTS, FORBIDDEN_STRINGS, STALE_WARN_DAYS,
} from "../lib/collections.mjs";
import { loadCollection, collectionExists } from "../lib/load.mjs";

const SITE = join(dirname(fileURLToPath(import.meta.url)), "..");
const SCAN_ROOT = process.env.NEOCLOUD_SITE_DIR ?? SITE;
const errors = [];
const warnings = [];
const fail = (rule, where, msg) => errors.push(`[rule ${rule}] ${where}: ${msg}`);

const ajv = new Ajv({ allErrors: true, strict: false });
addFormats(ajv);

// Rule 1 - schema violations.
const data = {};
for (const c of COLLECTIONS) {
  const schemaPath = join(SITE, "schemas", `${c.schema}.schema.json`);
  if (!existsSync(schemaPath)) { fail(1, c.name, `no schema at ${relative(SITE, schemaPath)}`); continue; }
  const rows = loadCollection(c.name);
  data[c.name] = rows;
  // A collection Stage B has not written yet is skipped, not failed: the scaffold must
  // build on an empty data/ directory (spec section 6, Stage A acceptance).
  if (!collectionExists(c.name)) { warnings.push(`${c.name}: no data file yet, not validated`); continue; }
  const validate = ajv.compile(JSON.parse(readFileSync(schemaPath, "utf8")));
  if (!validate(rows)) {
    for (const e of validate.errors) fail(1, `${c.name}${e.instancePath}`, e.message);
  }
}

// Every id on the site, for rule 3.
const ids = new Set();
for (const c of COLLECTIONS) {
  if (c.kind !== "list") continue;
  for (const row of data[c.name] ?? []) if (row && row.id) ids.add(row.id);
}

const walkFigures = function* (row) {
  for (const f of row.figures ?? []) yield f;
  for (const s of row.steps ?? []) if (s && (s.url || s.cost)) yield s;
};

for (const c of COLLECTIONS) {
  if (c.kind !== "list") continue;
  for (const row of data[c.name] ?? []) {
    if (!row || !row.id) continue;
    const at = `${c.name}/${row.id}`;

    // Rule 2 - a figure with no source or no checked date.
    for (const f of walkFigures(row)) {
      const label = f.label ?? f.title ?? "(unlabelled)";
      if (!f.source && !row.source) fail(2, `${at} figure "${label}"`, "no source");
      if (!f.checked && !row.checked) fail(2, `${at} figure "${label}"`, "no checked date");
    }

    // Rule 3 - a related id that resolves to nothing.
    for (const r of row.related ?? []) {
      if (!ids.has(r)) fail(3, at, `related id "${r}" resolves to nothing`);
    }

    // Rule 4 - a URL on the braindump deny-list.
    const urls = [row.source, row.guide, row.operating_model_source, row.facility_source, ...(row.figures ?? []).map((f) => f.source),
      ...(row.steps ?? []).flatMap((s) => [s.url, s.source, ...(s.more ?? []).map((m) => m.url)])].filter(Boolean);
    for (const u of urls) {
      let host = "";
      try { host = new URL(u).hostname.replace(/^www\./, ""); } catch { fail(1, at, `unparseable URL ${u}`); continue; }
      if (DENY_HOSTS.some((d) => host === d || host.endsWith(`.${d}`))) fail(4, at, `deny-listed host ${host}`);
    }

    // Rule 6 - a stated operating model needs its own source URL (no claim without source).
    if (row.operating_model && row.operating_model !== "unknown" && !String(row.operating_model_source ?? "").trim()) {
      fail(6, at, `operating_model "${row.operating_model}" has no operating_model_source`);
    }

    // Rule 7 - a facility needs its own source URL, and a stated operating model its own checked date.
    if (row.facility && !String(row.facility_source ?? "").trim()) {
      fail(7, at, `facility "${row.facility}" has no facility_source`);
    }
    if (row.operating_model && row.operating_model !== "unknown" && !row.operating_model_checked) {
      fail(7, at, `operating_model "${row.operating_model}" has no operating_model_checked`);
    }

    // Staleness - warn only. The site must not break by standing still.
    if (row.checked) {
      const age = Math.floor((Date.now() - Date.parse(row.checked)) / 86400000);
      if (age > STALE_WARN_DAYS) warnings.push(`${at}: checked ${age} days ago (${row.checked})`);
    }
  }
}

// Rule 5 - R1 as a test: forbidden strings anywhere under site/, excluding build output.
// Self-exclusion: the rule-5 string list lives in lib/collections.mjs, and this script and
// its test import it, so those three files are exempt. So are the fixtures, which exist to
// trip the rule on purpose.
const SKIP_DIRS = new Set(["node_modules", "_site", ".cache", ".git", "__fixtures__"]);
const RULE5_EXEMPT = new Set(["lib/collections.mjs", "scripts/validate.mjs", "scripts/validate.test.mjs"]);
const TEXT = /\.(mjs|js|json|yml|yaml|njk|md|css|html|txt)$/;
const walk = (dir) => readdirSync(dir).flatMap((n) => {
  const p = join(dir, n);
  if (statSync(p).isDirectory()) return SKIP_DIRS.has(n) ? [] : walk(p);
  return TEXT.test(n) ? [p] : [];
});
for (const file of existsSync(SCAN_ROOT) ? walk(SCAN_ROOT) : []) {
  const rel = relative(SCAN_ROOT, file);
  if (RULE5_EXEMPT.has(rel)) continue;
  const text = readFileSync(file, "utf8").toLowerCase();
  for (const bad of FORBIDDEN_STRINGS) {
    if (text.includes(bad)) fail(5, rel, `contains forbidden string "${bad}"`);
  }
}

for (const w of warnings) console.warn(`WARN  ${w}`);
if (errors.length) {
  for (const e of errors) console.error(`FAIL  ${e}`);
  console.error(`\n${errors.length} violation(s). See spec section 4.3.`);
  process.exit(1);
}
console.log(`OK    ${COLLECTIONS.length} collections, ${ids.size} ids, ${warnings.length} staleness warning(s).`);
