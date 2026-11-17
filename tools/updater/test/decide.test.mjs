// Tests for lib/decide.mjs: the write rule of docs/updater-design.md section b and e.
import test from "node:test";
import assert from "node:assert/strict";
import { decide, FAILURE_LIMIT, newEntry } from "../lib/decide.mjs";

const TODAY = "2026-10-14";
const A = { tier: "A", field: "cost" };
const B = { tier: "B", field: "cost" };
const row = (o = {}) => ({ cost: "USD 50, self-paced, 4 h", checked: "2026-10-06", confidence: "verified", ...o });
const okA = (facts) => ({ kind: "ok", facts });
const same = okA({ free: false, price: 50, hours: 4 });
const cheaper = okA({ free: false, price: 60, hours: 4 });
const run = (watch, r, obs, entry = newEntry()) => decide({ watch, row: r, obs, entry, today: TODAY });

test("confirmed on a verified row younger than 28 days: no edit", () => {
  const out = run(A, row({ checked: "2026-10-01" }), same);
  assert.deepEqual(out.edits, {});
});

test("confirmed on a verified row 28+ days old: only checked moves", () => {
  const out = run(A, row({ checked: "2026-09-10" }), same);
  assert.deepEqual(out.edits, { checked: TODAY });
});

test("confirmed never touches an unverified row", () => {
  const out = run(A, row({ confidence: "unverified", checked: "2026-01-01" }), same);
  assert.deepEqual(out.edits, {});
});

test("first sighting of a different value changes nothing on the site", () => {
  const out = run(A, row(), cheaper);
  assert.deepEqual(out.edits, {});
  assert.ok(out.entry.pending);
});

test("second consecutive sighting of the same new value applies it (Tier A)", () => {
  const first = run(A, row(), cheaper);
  const out = run(A, row(), cheaper, first.entry);
  assert.equal(out.edits.cost, "USD 60, self-paced, 4 h");
  assert.equal(out.edits.checked, TODAY);
  assert.equal(out.valueChange, true);
  assert.equal(out.entry.pending, null);
  assert.equal(out.edits.confidence, undefined);
});

test("a different second observation restarts the debounce", () => {
  const first = run(A, row(), cheaper);
  const out = run(A, row(), okA({ free: false, price: 70, hours: 4 }), first.entry);
  assert.deepEqual(out.edits, {});
  assert.notEqual(out.entry.pending, first.entry.pending);
});

test("a value outside the sanity bounds is a disagreement note, not a write", () => {
  const wild = okA({ free: false, price: 5000, hours: 4 });
  const first = run(A, row(), wild);
  const out = run(A, row(), wild, first.entry);
  assert.equal(out.edits.cost, undefined);
  assert.equal(out.edits.confidence, "unverified");
  assert.match(out.edits.note, /^\[Updater, 2026-10-14\] The page now states USD 5,000/);
  assert.equal(out.entry.prior_confidence, "verified");
});

test("Tier B never writes a value: absent twice gives note + demotion", () => {
  const obs = { kind: "ok", missing: ["USD 50"] };
  const first = run(B, row(), obs);
  assert.deepEqual(first.edits, {});
  const out = run(B, row({ note: "Opened by hand." }), obs, first.entry);
  assert.equal(out.edits.cost, undefined);
  assert.equal(out.edits.confidence, "unverified");
  assert.equal(out.edits.note, "Opened by hand. [Updater, 2026-10-14] The page no longer shows: USD 50. Value kept.");
});

test("a repeat disagreement run is idempotent (no date churn)", () => {
  const obs = { kind: "ok", missing: ["USD 50"] };
  const r = row({ confidence: "unverified", note: "[Updater, 2026-10-07] The page no longer shows: USD 50. Value kept." });
  const entry = { ...newEntry(), pending: "B:USD 50", prior_confidence: "verified" };
  const out = run(B, r, obs, entry);
  assert.deepEqual(out.edits, {});
});

test("when the page agrees again, the updater's note goes and its own demotion is undone", () => {
  const r = row({ checked: "2026-08-01", confidence: "unverified", note: "Opened by hand. [Updater, 2026-10-07] The page no longer shows: USD 50. Value kept." });
  const entry = { ...newEntry(), prior_confidence: "verified" };
  const out = run(B, r, { kind: "ok", missing: [] }, entry);
  assert.equal(out.edits.note, "Opened by hand.");
  assert.equal(out.edits.confidence, "verified");
  assert.equal(out.edits.checked, TODAY);
  assert.equal(out.entry.prior_confidence, null);
});

test("a human demotion is never undone: no updater marker means no restore", () => {
  const r = row({ confidence: "unverified", note: "Person says: unsure." });
  const out = run(B, r, { kind: "ok", missing: [] }, { ...newEntry(), prior_confidence: "verified" });
  assert.equal(out.edits.confidence, undefined);
});

test("failures are not evidence: value, date and confidence stay; note only after the limit", () => {
  let entry = newEntry();
  for (let i = 1; i < FAILURE_LIMIT; i++) {
    const out = run(A, row(), { kind: "failure", reason: "HTTP 403" }, entry);
    assert.deepEqual(out.edits, {});
    entry = out.entry;
  }
  const out = run(A, row(), { kind: "failure", reason: "HTTP 403" }, entry);
  assert.equal(out.edits.cost, undefined);
  assert.equal(out.edits.confidence, undefined);
  assert.match(out.edits.note, /\[Updater, 2026-10-14\] The source could not be read on 3 runs in a row \(HTTP 403\)/);
});

test("a success after failures resets the counter and removes the unreachable note", () => {
  const r = row({ note: "[Updater, 2026-10-07] The source could not be read on 3 runs in a row (HTTP 403). The value above is unchanged and unconfirmed since 2026-10-06." });
  const out = run(A, r, same, { ...newEntry(), failures: 3 });
  assert.equal(out.entry.failures, 0);
  assert.equal(out.edits.note, null);
});

test("a failure between two sightings breaks the debounce: they must be consecutive", () => {
  const first = run(A, row(), cheaper);
  const gap = run(A, row(), { kind: "failure", reason: "timeout" }, first.entry);
  assert.equal(gap.entry.pending, null);
  const out = run(A, row(), cheaper, gap.entry);
  assert.deepEqual(out.edits, {});
});

test("a free/paid flip is a note, never a write", () => {
  const free = okA({ free: true, price: null, hours: 4 });
  const first = run(A, row(), free);
  const out = run(A, row(), free, first.entry);
  assert.equal(out.edits.cost, undefined);
  assert.equal(out.edits.confidence, "unverified");
});

test("server-controlled text never reaches a note", () => {
  let entry = newEntry(); let out;
  for (let i = 0; i < FAILURE_LIMIT; i++) { out = run(A, row(), { kind: "failure", reason: "moved to https://evil.example/x" }, entry); entry = out.entry; }
  assert.doesNotMatch(out.edits.note, /evil/);
});

test("applying a change on an unverified row does not stamp checked", () => {
  const r = row({ confidence: "unverified" });
  const first = run(A, r, cheaper);
  const out = run(A, r, cheaper, first.entry);
  assert.equal(out.edits.cost, "USD 60, self-paced, 4 h");
  assert.equal(out.edits.checked, undefined);
});

test("an unparsable recorded value is reported, never written", () => {
  const out = run(A, row({ cost: "Varies by region" }), cheaper);
  assert.deepEqual(out.edits, {});
  assert.equal(out.event.type, "unparsable");
});
