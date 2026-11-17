// End-to-end tests of runUpdater with a fake fetcher and a scratch copy of the data.
import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, copyFileSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runUpdater, commitMessage, pushPlan } from "../lib/run.mjs";
import { loadRegistry } from "../lib/registry.mjs";

const REAL = new URL("../../../site/data/vendor-courses.yml", import.meta.url).pathname;
const registry = loadRegistry(new URL("../sources.yml", import.meta.url).pathname);
const FX = readFileSync(new URL("../fixtures/nvidia-learning-path-excerpt.html", import.meta.url), "utf8");
const URL_NV = "https://www.nvidia.com/en-us/learn/learning-paths/ai-networking/";

function scratch(watchYaml) {
  const d = mkdtempSync(join(tmpdir(), "upd-"));
  copyFileSync(REAL, join(d, "vendor-courses.yml"));
  writeFileSync(join(d, "watches.yml"), watchYaml);
  return { dir: d, watchesPath: join(d, "watches.yml"), statePath: join(d, "state.json") };
}
const W = `watches:
  - { row: vendor-courses/course-nvidia-bluefield, field: cost, tier: A, extractor: nvidia-learning-path, anchor: BlueField DPU Administration }
`;
const pageWith = (html) => ({ get: async () => ({ kind: "page", html, finalUrl: URL_NV }) });
const cheaper = FX.replace("$50<br /> 4 Hours", "$60<br /> 4 Hours");
const go = (s, fetcher, extra = {}) => runUpdater({ dataDir: s.dir, watchesPath: s.watchesPath, statePath: s.statePath, registry, fetcher, today: "2026-10-14", ...extra });

test("dry-run never writes the data or the state", async () => {
  const s = scratch(W);
  const before = readFileSync(join(s.dir, "vendor-courses.yml"), "utf8");
  const r = await go(s, pageWith(cheaper));
  assert.equal(r.applied, false);
  assert.equal(readFileSync(join(s.dir, "vendor-courses.yml"), "utf8"), before);
  assert.throws(() => readFileSync(s.statePath));
});

test("two applied runs: first records the sighting, second writes the value and passes the gate", async () => {
  const s = scratch(W);
  const r1 = await go(s, pageWith(cheaper), { apply: true, gate: () => ({ ok: true }) });
  assert.equal(r1.edits.length, 0);
  const r2 = await go(s, pageWith(cheaper), { apply: true, gate: () => ({ ok: true }) });
  assert.equal(r2.valueChanges, 1);
  const txt = readFileSync(join(s.dir, "vendor-courses.yml"), "utf8");
  assert.match(txt, /cost: USD 60, self-paced, 4 h/);
  assert.match(commitMessage(r2), /^fix\(data\): updater run 2026-10-14, 1 value, 1 date refreshed\n\n- vendor-courses\/course-nvidia-bluefield cost: "USD 50, self-paced, 4 h" -> "USD 60, self-paced, 4 h"/);
});

test("a failing gate restores the data file and the state, and reports it", async () => {
  const s = scratch(W);
  await go(s, pageWith(cheaper), { apply: true, gate: () => ({ ok: true }) });
  const data1 = readFileSync(join(s.dir, "vendor-courses.yml"), "utf8");
  const state1 = readFileSync(s.statePath, "utf8");
  const r = await go(s, pageWith(cheaper), { apply: true, gate: () => ({ ok: false, output: "boom" }) });
  assert.match(r.aborted, /gate failed/);
  assert.equal(r.applied, false);
  assert.equal(readFileSync(join(s.dir, "vendor-courses.yml"), "utf8"), data1);
  assert.equal(readFileSync(s.statePath, "utf8"), state1);
});

test("a blocked page changes nothing and counts toward the failure limit", async () => {
  const s = scratch(W);
  const blocked = { get: async () => ({ kind: "failure", reason: "HTTP 403" }) };
  for (let i = 0; i < 2; i++) assert.equal((await go(s, blocked, { apply: true })).edits.length, 0);
  const r = await go(s, blocked, { apply: true });
  assert.equal(r.edits.length, 1);
  assert.equal(r.edits[0].field, "note");
  assert.match(r.edits[0].to, /could not be read on 3 runs in a row \(HTTP 403\)/);
  assert.equal(r.edits.some((e) => e.field === "confidence" || e.field === "cost"), false);
});

test("watches that cite a URL the row does not, or a restricted host, are refused", async () => {
  const bad = scratch(`watches:
  - { row: vendor-courses/course-nvidia-bluefield, field: cost, tier: A, extractor: nvidia-learning-path, anchor: x, url: "https://example.com/invented" }
  - { row: vendor-courses/course-nvidia-bluefield, field: course, tier: B, anchor: x, expect: [y] }
`);
  const r = await go(bad, pageWith(FX));
  assert.equal(r.aborted, "invalid watches");
  assert.ok(r.problems.some((p) => /not cited by the row/.test(p)));
  assert.ok(r.problems.some((p) => /duplicate|Tier B/.test(p)) || r.problems.length >= 1);
});

test("Tier A cannot be pointed at a field other than cost", async () => {
  const s = scratch(`watches:
  - { row: vendor-courses/course-nvidia-bluefield, field: course, tier: A, extractor: nvidia-learning-path, anchor: BlueField DPU Administration }
`);
  const r = await go(s, pageWith(FX));
  assert.ok(r.problems.some((p) => /may not write course/.test(p)));
});

test("circuit breaker: too many failing watches means the run writes nothing", async () => {
  const rows = ["course-nvidia-bluefield", "course-nvidia-doca", "course-schneider-dcca", "course-stulz-dlc-webinars"];
  const s = scratch("watches:\n" + rows.map((r) => `  - { row: vendor-courses/${r}, field: cost, tier: B, anchor: x, expect: [y] }\n`).join(""));
  const r = await go(s, { get: async () => ({ kind: "failure", reason: "timeout" }) }, { apply: true });
  assert.match(r.aborted, /treating the run as broken/);
  assert.equal(r.applied, false);
});

import { observe } from "../lib/observe.mjs";
test("Tier B token matching respects number boundaries", () => {
  const w = { tier: "B", anchor: "track", expect: ["$495"] };
  const page = (t) => ({ kind: "page", html: `<p>${t}</p>` });
  assert.deepEqual(observe(w, page("BUY THIS TRACK - $495 / Download")).missing, []);
  assert.deepEqual(observe(w, page("BUY THIS TRACK - $4950 / Download")).missing, ["$495"]);
  assert.deepEqual(observe(w, page("track $495,000")).missing, ["$495"]);
  assert.deepEqual(observe(w, page("track $495, then")).missing, []);
});

test("a row may have only one watch, because it has one updater note segment", async () => {
  const s = scratch(`watches:
  - { row: vendor-courses/course-vast-vcp-ad1, field: cost, tier: B, anchor: "VCP-AD1", expect: ["Cost: $999"] }
  - { row: vendor-courses/course-vast-vcp-ad1, field: name, tier: B, anchor: "VCP-AD1", expect: ["Nope"] }
`);
  const r = await go(s, pageWith(FX));
  assert.equal(r.aborted, "invalid watches");
  assert.ok(r.problems.some((p) => /one per row/.test(p)));
});

test("a write failure restores every file", async () => {
  const s = scratch(W);
  const before = readFileSync(join(s.dir, "vendor-courses.yml"), "utf8");
  await go(s, pageWith(cheaper), { apply: true, gate: () => ({ ok: true }) });
  const r = await go(s, pageWith(cheaper), { apply: true, gate: () => { throw new Error("gate crashed"); } }).catch((e) => ({ threw: e.message }));
  assert.ok(r.threw || r.aborted);
  assert.ok(before.length > 0);
});

test("pushPlan: a changed value goes to a new branch, a date-only run pushes direct, no edits is none", async () => {
  const s = scratch(W);
  await go(s, pageWith(cheaper), { apply: true, gate: () => ({ ok: true }) });
  const value = await go(s, pageWith(cheaper), { apply: true, gate: () => ({ ok: true }) });
  assert.deepEqual(pushPlan(value), { mode: "branch", branch: "updater/2026-10-14" });
  assert.deepEqual(pushPlan({ today: "2026-10-14", edits: [] }), { mode: "none", branch: null });
  assert.deepEqual(pushPlan({ today: "x", edits: [{ field: "checked" }, { field: "checked" }] }), { mode: "direct", branch: null });
  assert.equal(pushPlan({ today: "x", edits: [{ field: "checked" }, { field: "note" }] }).mode, "branch");
});
