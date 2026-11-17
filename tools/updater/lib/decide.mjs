// The write rule (docs/updater-design.md, sections b and e) as a pure function.
//   decide({ watch, row, obs, entry, today }) -> { edits, entry, event, valueChange }
// watch: { tier: "A" | "B", field }   row: the current row   today: "YYYY-MM-DD"
// obs:   { kind: "failure", reason } | { kind: "ok", facts }   (Tier A, from an extractor)
//        { kind: "ok", missing: [string] }                      (Tier B, expected tokens not seen)
// entry: per-watch state { pending, failures, prior_confidence } (see newEntry)
// edits: fields to set; `note: null` means remove the note. Only checked, confidence, note and
//        the watch's own value field can ever appear here.
// Nothing here fetches or reads files, so every rule is testable on its own.
import { parseCost, sameCost, renderCostLike } from "./facts.mjs";

export const FAILURE_LIMIT = 3;
export const CHECKED_MIN_AGE_DAYS = 28;
const SEG = /\s*\[Updater, (\d{4}-\d{2}-\d{2})\]\s*([\s\S]*)$/;
const UNREACHABLE = "The source could not be read";

export const newEntry = () => ({ pending: null, failures: 0, prior_confidence: null });

const ageDays = (from, today) => Math.floor((Date.parse(today) - Date.parse(from)) / 86400000);
const humanPart = (note) => (note ?? "").replace(SEG, "").trim();
const segment = (note) => { const m = (note ?? "").match(SEG); return m ? { date: m[1], text: m[2].trim() } : null; };
const withSegment = (note, today, text) => {
  const base = humanPart(note);
  return `${base ? base + " " : ""}[Updater, ${today}] ${text}`;
};
const describe = (f) => `${f.free ? "Free" : "USD " + f.price.toLocaleString("en-US")}${f.hours != null ? `, ${f.hours} h` : ""}`;

function sane(recorded, f) {
  if (!!recorded.free !== !!f.free) return false; // free <-> paid flips are shown, never written
  const ok = (a, b) => a == null || b == null || a === 0 || (b / a >= 0.25 && b / a <= 4);
  return ok(recorded.price, f.price) && ok(recorded.hours, f.hours);
}

export function decide({ watch, row, obs, entry, today }) {
  const e = { ...newEntry(), ...entry };
  const edits = {};
  const seg = segment(row.note);
  const removeSegment = () => {
    const h = humanPart(row.note);
    edits.note = h === "" ? null : h;
  };
  // Undo only what this updater did: a demotion that came with its own marker.
  const restore = () => {
    if (seg && e.prior_confidence === "verified" && row.confidence === "unverified") edits.confidence = "verified";
    e.prior_confidence = null;
  };
  const conf = () => edits.confidence ?? row.confidence;

  if (obs.kind === "failure") {
    e.failures += 1;
    e.pending = null; // the two sightings of a change must be consecutive runs
    const reason = String(obs.reason).replace(/https?:\/\/\S+/g, "").slice(0, 80).trim();
    if (e.failures >= FAILURE_LIMIT && !(seg && !seg.text.startsWith(UNREACHABLE))) {
      const text = `${UNREACHABLE} on ${e.failures} runs in a row (${reason}). The value above is unchanged and unconfirmed since ${row.checked}.`;
      // Same wording as before is not rewritten, so the date in the note does not churn.
      if (!seg || seg.text.replace(/\d+ runs/, "N runs") !== text.replace(/\d+ runs/, "N runs")) edits.note = withSegment(row.note, today, text);
    }
    return { edits, entry: e, event: { type: "failure", reason, failures: e.failures }, valueChange: false };
  }

  e.failures = 0;
  if (seg && seg.text.startsWith(UNREACHABLE)) removeSegment();

  let key = null;
  let kind = "confirmed";
  let recorded = null;
  if (watch.tier === "A") {
    recorded = parseCost(row[watch.field]);
    if (!recorded || (!recorded.free && recorded.price == null && recorded.hours == null)) {
      return { edits, entry: e, event: { type: "unparsable" }, valueChange: false };
    }
    if (!sameCost(recorded, obs.facts)) { kind = "changed"; key = `A:${JSON.stringify(obs.facts)}`; }
  } else if (obs.missing.length) {
    kind = "absent";
    key = `B:${obs.missing.join("|")}`;
  }

  if (kind === "confirmed") {
    e.pending = null;
    if (seg && !seg.text.startsWith(UNREACHABLE)) { removeSegment(); restore(); }
    if (conf() === "verified" && ageDays(row.checked, today) >= CHECKED_MIN_AGE_DAYS) edits.checked = today;
    return { edits, entry: e, event: { type: "confirmed" }, valueChange: false };
  }

  if (e.pending !== key) {
    e.pending = key;
    return { edits, entry: e, event: { type: "first-sighting", kind, key }, valueChange: false };
  }

  // Second consecutive sighting.
  if (watch.tier === "A" && kind === "changed" && sane(recorded, obs.facts)) {
    edits[watch.field] = renderCostLike(row[watch.field], obs.facts);
    if (seg) removeSegment();
    restore();
    if (conf() === "verified") edits.checked = today;
    e.pending = null;
    return { edits, entry: e, event: { type: "applied", from: row[watch.field], to: edits[watch.field] }, valueChange: true };
  }

  const text = kind === "changed"
    ? `The page now states ${describe(obs.facts)}; recorded "${row[watch.field]}". Value kept.`
    : `The page no longer shows: ${obs.missing.join("; ")}. Value kept.`;
  if (!seg || seg.text !== text) edits.note = withSegment(row.note, today, text);
  if (row.confidence === "verified") { edits.confidence = "unverified"; e.prior_confidence = "verified"; }
  return { edits, entry: e, event: { type: "disagreement", text }, valueChange: false };
}
