// Orchestration: watches -> fetch -> observe -> decide -> (dry-run diff | write + gate).
// runUpdater(opts) is the whole run and returns a report; run.mjs (the CLI) only parses flags.
// Safety properties enforced here (docs/updater-design.md b.7):
//   - only checked/confidence/note and a Tier A watch's own field can be written;
//   - a file whose untouched round trip is not byte-identical is not edited;
//   - circuit breaker: more than MAX_VALUE_CHANGES value changes or MAX_ROWS rows touched, or
//     more than half the watches failing, writes nothing and reports `aborted`;
//   - after writing, the gate (npm test + npm run check in site/) must pass, else every file
//     and the state are restored and nothing is left changed.
import { readFileSync, writeFileSync, renameSync, existsSync } from "node:fs";
import { parse as parseYamlText } from "yaml";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { COLLECTIONS } from "../../../site/lib/collections.mjs";
import { loadYaml } from "./yamlio.mjs";
import { loadWatches } from "./watches.mjs";
import { observe } from "./observe.mjs";
import { decide, newEntry } from "./decide.mjs";

export const MAX_VALUE_CHANGES = 5;
export const MAX_ROWS = 20;
const ALWAYS = new Set(["checked", "confidence", "note"]);

export function defaultGate(siteDir) {
  for (const args of [["test"], ["run", "check"]]) {
    const r = spawnSync("npm", args, { cwd: siteDir, encoding: "utf8" });
    if (r.status !== 0) return { ok: false, output: `${r.stdout}\n${r.stderr}`.slice(-3000) };
  }
  return { ok: true };
}

export async function runUpdater({ dataDir, watchesPath, statePath, stateOut, registry, fetcher, today, apply = false, gate = null, only = null }) {
  const files = new Map();
  const fileFor = (collection) => {
    const spec = COLLECTIONS.find((c) => c.name === collection);
    if (!spec || !spec.file) throw new Error(`collection ${collection} has no single YAML file`);
    if (!files.has(collection)) files.set(collection, loadYaml(join(dataDir, spec.file)));
    return files.get(collection);
  };
  const { watches, problems } = loadWatches(watchesPath, (c) => fileFor(c).rows(), registry);
  if (problems.length) return { today, problems, aborted: "invalid watches", edits: [], events: [] };
  for (const f of files.values()) {
    if (!f.roundTripsExactly()) return { today, problems: [`${f.path} does not round-trip byte-for-byte`], aborted: "round-trip", edits: [], events: [] };
  }

  const state = existsSync(statePath) ? JSON.parse(readFileSync(statePath, "utf8")) : { version: 1, watches: {} };
  const newState = { version: 1, watches: { ...state.watches } };
  const pages = new Map();
  const edits = [];
  const events = [];
  let failures = 0;
  let valueChanges = 0;
  const live = watches.filter((w) => !only || w.collection === only);
  const working = new Map(); // "collection/id" -> row as edited so far by earlier watches
  const allowed = new Map(); // "collection/id" -> fields this run may change on that row

  for (const w of live) {
    if (!pages.has(w.url)) pages.set(w.url, await fetcher.get(w.url));
    const obs = observe(w, pages.get(w.url));
    if (obs.kind === "failure") failures++;
    const rk = `${w.collection}/${w.rowId}`;
    if (!working.has(rk)) working.set(rk, { ...fileFor(w.collection).rows().find((r) => r.id === w.rowId) });
    const row = working.get(rk);
    const orig = fileFor(w.collection).rows().find((r) => r.id === w.rowId);
    const out = decide({ watch: w, row, obs, entry: state.watches[w.id] ?? newEntry(), today });
    newState.watches[w.id] = out.entry;
    events.push({ watch: w.id, ...out.event });
    if (out.valueChange) valueChanges++;
    const fields = Object.keys(out.edits);
    for (const k of fields) {
      if (!ALWAYS.has(k) && !(w.tier === "A" && k === w.field)) throw new Error(`write guard: ${w.id} tried to write ${k}`);
    }
    for (const k of fields) {
      edits.push({ collection: w.collection, id: w.rowId, field: k, from: orig[k] ?? null, to: out.edits[k], source: w.url });
      if (out.edits[k] === null) delete row[k]; else row[k] = out.edits[k];
    }
    allowed.set(rk, new Set([...(allowed.get(rk) ?? ALWAYS), ...(w.tier === "A" ? [w.field] : [])]));
  }

  const touched = new Set(edits.map((e) => `${e.collection}/${e.id}`));
  let aborted = null;
  if (valueChanges > MAX_VALUE_CHANGES) aborted = `circuit breaker: ${valueChanges} value changes (max ${MAX_VALUE_CHANGES})`;
  else if (touched.size > MAX_ROWS) aborted = `circuit breaker: ${touched.size} rows touched (max ${MAX_ROWS})`;
  else if (live.length >= 4 && failures / live.length > 0.5) aborted = `${failures} of ${live.length} watches failed; treating the run as broken`;
  const report = { today, watches: live.length, failures, valueChanges, rows: touched.size, edits, events, aborted, applied: false, gate: null };
  if (aborted || !apply) {
    // Dry-run: state is only written if a scratch path was given, so a second dry-run can show the debounce.
    if (stateOut && !aborted) writeFileSync(stateOut, JSON.stringify(sortKeys(newState), null, 2) + "\n");
    return report;
  }

  const beforeState = existsSync(statePath) ? readFileSync(statePath, "utf8") : null;
  const grouped = new Map();
  for (const e of edits) {
    const k = `${e.collection}/${e.id}`;
    grouped.set(k, { ...(grouped.get(k) ?? {}), collection: e.collection, id: e.id, [e.field]: e.to });
  }
  const snapshot = new Map([...files].map(([c, f]) => [c, f.rows()]));
  for (const g of grouped.values()) {
    const { collection, id, ...fields } = g;
    fileFor(collection).setRowFields(id, fields);
  }
  // Guard (design b.7): re-parse what we are about to write and compare with the parsed data
  // before. Any changed field outside the allowlist for that row aborts with nothing written.
  for (const [c, f] of files) {
    const after = parseYamlText(f.toString());
    for (const row of after) {
      const was = snapshot.get(c).find((r) => r.id === row.id);
      const ok = allowed.get(`${c}/${row.id}`) ?? new Set();
      for (const k of new Set([...Object.keys(row), ...Object.keys(was ?? {})])) {
        if (JSON.stringify(row[k]) !== JSON.stringify(was?.[k]) && !ok.has(k)) {
          report.aborted = `write guard: ${c}/${row.id} field ${k} changed outside the allowlist`;
          return report;
        }
      }
    }
    if (after.length !== snapshot.get(c).length) { report.aborted = `write guard: ${c} row count changed`; return report; }
  }
  const written = [];
  const restoreAll = () => {
    for (const f of written) writeFileSync(f.path, f.text);
    writeFileSync(statePath, beforeState ?? JSON.stringify({ version: 1, watches: {} }, null, 2) + "\n");
  };
  try {
    for (const [, f] of files) {
      if (f.toString() !== f.text) { atomicWrite(f.path, f.toString()); written.push(f); }
    }
    atomicWrite(statePath, JSON.stringify(sortKeys(newState), null, 2) + "\n");
  } catch (e) {
    restoreAll();
    report.aborted = `write failed (${e.code ?? e.message}); every file restored`;
    return report;
  }
  if (gate) {
    const g = gate();
    report.gate = g.ok ? "passed" : "failed";
    if (!g.ok) {
      restoreAll();
      report.aborted = "gate failed; every file restored";
      report.gateOutput = g.output;
      return report;
    }
  }
  report.applied = true;
  return report;
}

// Write to a temp file in the same directory, then rename: a crash leaves the old file intact.
const atomicWrite = (path, text) => { const t = `${path}.tmp-${process.pid}`; writeFileSync(t, text); renameSync(t, path); };
const sortKeys = (s) => ({ version: s.version, watches: Object.fromEntries(Object.entries(s.watches).sort(([a], [b]) => a.localeCompare(b))) });

// One line per edit, the format used for the dry-run output and the commit body.
export const formatEdit = (e) => `${e.collection}/${e.id} ${e.field}: ${JSON.stringify(e.from)} -> ${JSON.stringify(e.to)}`;

// Where a run's commit goes. Only a date-only run (every edit is a "checked" refresh) may be
// pushed straight to main. Any other edit (a changed value such as a price, a note, a
// confidence change) goes to a new branch for a person to review and is never pushed to main.
export function pushPlan(report) {
  const edits = report.edits ?? [];
  if (!edits.length) return { mode: "none", branch: null };
  if (edits.every((e) => e.field === "checked")) return { mode: "direct", branch: null };
  return { mode: "branch", branch: "updater/" + report.today };
}

export function commitMessage(report) {
  const vals = report.edits.filter((e) => !["checked"].includes(e.field) && e.field !== "note" && e.field !== "confidence");
  const notes = new Set(report.edits.filter((e) => e.field === "note" || e.field === "confidence").map((e) => `${e.collection}/${e.id}`));
  const dates = new Set(report.edits.filter((e) => e.field === "checked").map((e) => `${e.collection}/${e.id}`));
  const type = vals.length || notes.size ? "fix" : "chore";
  const parts = [];
  if (vals.length) parts.push(`${vals.length} value${vals.length > 1 ? "s" : ""}`);
  if (notes.size) parts.push(`${notes.size} note${notes.size > 1 ? "s" : ""}`);
  if (dates.size) parts.push(`${dates.size} date${dates.size > 1 ? "s" : ""} refreshed`);
  const body = report.edits.map((e) => `- ${formatEdit(e)}\n  source: ${e.source}`).join("\n");
  return `${type}(data): updater run ${report.today}, ${parts.join(", ")}\n\n${body}\n`;
}
