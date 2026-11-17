#!/usr/bin/env node
// Unattended updater for site/data. Design: docs/updater-design.md
//
//   node run.mjs --dry-run                    print what a run would change; write nothing
//   node run.mjs --dry-run --state-out s.json also write the new debounce state to a scratch file
//   node run.mjs --apply                      write changes, then run the gate (npm test +
//                                             npm run check in site/); restore everything on failure
// Options: --watches FILE (default tools/updater/watches.yml)  --data-dir DIR (default site/data)  --state FILE (default tools/updater/state.json)
//          --only COLLECTION  --today YYYY-MM-DD  --no-gate  --commit-message FILE  --plan-out FILE  --json
// --plan-out writes "direct" (date-only run: push to main), "branch <name>" (any changed value,
// note or confidence: push to that new branch, never main) or "none" (nothing to commit).
// Exit codes: 0 ok (including "nothing to change"), 1 aborted (breaker, invalid watches, gate),
//             2 bad usage. The kill switch is the file tools/updater/DISABLED.
import { existsSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { runUpdater, defaultGate, formatEdit, commitMessage, pushPlan } from "./lib/run.mjs";
import { loadRegistry } from "./lib/registry.mjs";
import { createFetcher } from "./lib/fetcher.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "../..");
const { values: a } = parseArgs({
  options: {
    "dry-run": { type: "boolean" }, apply: { type: "boolean" }, json: { type: "boolean" }, "no-gate": { type: "boolean" },
    "data-dir": { type: "string" }, watches: { type: "string" }, state: { type: "string" }, "state-out": { type: "string" },
    only: { type: "string" }, today: { type: "string" }, "commit-message": { type: "string" }, "plan-out": { type: "string" },
  },
});
if (!!a["dry-run"] === !!a.apply) { console.error("give exactly one of --dry-run or --apply"); process.exit(2); }
if (existsSync(join(HERE, "DISABLED"))) { console.log("DISABLED file present: nothing to do"); process.exit(0); }

const report = await runUpdater({
  dataDir: a["data-dir"] ?? join(ROOT, "site/data"),
  watchesPath: a.watches ?? join(HERE, "watches.yml"),
  statePath: a.state ?? join(HERE, "state.json"),
  stateOut: a["state-out"],
  registry: loadRegistry(join(HERE, "sources.yml")),
  fetcher: createFetcher(),
  today: a.today ?? new Date().toISOString().slice(0, 10),
  apply: !!a.apply,
  gate: a.apply && !a["no-gate"] ? () => defaultGate(join(ROOT, "site")) : null,
  only: a.only ?? null,
});

if (a.json) console.log(JSON.stringify(report, null, 2));
else {
  console.log(`updater ${a.apply ? "APPLY" : "DRY-RUN"} ${report.today}: ${report.watches ?? 0} watches, ${report.failures ?? 0} failed, ${report.valueChanges ?? 0} value changes, ${report.rows ?? 0} rows touched`);
  for (const p of report.problems ?? []) console.log(`PROBLEM ${p}`);
  for (const ev of report.events ?? []) console.log(`  ${ev.watch}: ${ev.type}${ev.reason ? ` (${ev.reason})` : ""}${ev.key ? ` [${ev.kind}]` : ""}`);
  for (const e of report.edits ?? []) console.log(`${a.apply ? "WROTE" : "WOULD"} ${formatEdit(e)}`);
  if (report.aborted) console.log(`ABORTED: ${report.aborted}`);
  if (report.gate) console.log(`gate: ${report.gate}`);
}
if (a["commit-message"] && report.applied && report.edits.length) writeFileSync(a["commit-message"], commitMessage(report));
if (a["plan-out"]) {
  const p = pushPlan(report);
  writeFileSync(a["plan-out"], (p.mode === "branch" ? "branch " + p.branch : p.mode) + "\n");
}
process.exit(report.aborted ? 1 : 0);
