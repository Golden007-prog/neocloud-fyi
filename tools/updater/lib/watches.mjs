// Load and validate watches.yml against the site data and the source registry.
// A watch is the only way the updater gets a URL to fetch, and that URL must be one the row
// already cites (its `source`, or a URL a person wrote in its `note`). The updater never
// invents a URL (docs/updater-design.md section a).
//   Tier A: { id?, row: "collection/id", field, tier: "A", extractor, anchor, url? }
//   Tier B: { row, field, tier: "B", anchor, expect: [string], window?, url? }
// `url` defaults to the row's `source`.
import { readFileSync } from "node:fs";
import { parse } from "yaml";
import { parseCost } from "./facts.mjs";
import { EXTRACTORS } from "../extractors/index.mjs";

const URL_RE = /https?:\/\/[^\s"'<>)]+/g;
export const citedUrls = (row) => new Set([row.source, ...((row.note ?? "").match(URL_RE) ?? [])].filter(Boolean).map((u) => u.replace(/[.,;]+$/, "")));

// Fields a watch may name as its `field`: Tier A can only write these (and only through a parser).
export const A_FIELDS = new Set(["cost", "price"]);

// rowsOf(collection) -> array of rows. Returns the list of problems (empty when valid).
export function loadWatches(path, rowsOf, registry) {
  const watches = (parse(readFileSync(path, "utf8")) ?? { watches: [] }).watches ?? [];
  const problems = [];
  const seen = new Set();
  for (const w of watches) {
    const at = `${w.row}#${w.field}`;
    w.id = at;
    // One updater note segment exists per row, so a row has at most one watch.
    if (seen.has(w.row)) problems.push(`${at}: row already has a watch (one per row)`);
    seen.add(w.row);
    const [collection, id] = String(w.row).split("/");
    const row = rowsOf(collection)?.find((r) => r.id === id);
    if (!row) { problems.push(`${at}: no such row`); continue; }
    w.collection = collection; w.rowId = id;
    w.url ??= row.source;
    if (!citedUrls(row).has(w.url)) problems.push(`${at}: url ${w.url} is not cited by the row`);
    try { registry.assertAllowed(w.url); } catch (e) { problems.push(`${at}: ${e.message}`); }
    if (!["A", "B"].includes(w.tier)) problems.push(`${at}: tier must be A or B`);
    if (!w.anchor) problems.push(`${at}: anchor is required`);
    if (!(w.field in row)) problems.push(`${at}: row has no field ${w.field}`);
    if (w.tier === "A") {
      if (!EXTRACTORS[w.extractor]) problems.push(`${at}: unknown extractor ${w.extractor}`);
      if (!A_FIELDS.has(w.field)) problems.push(`${at}: Tier A may not write ${w.field}`);
      const p = parseCost(row[w.field]);
      if (!p || (!p.free && p.price == null && p.hours == null)) problems.push(`${at}: recorded value does not parse`);
    } else if (!Array.isArray(w.expect) || !w.expect.length) problems.push(`${at}: Tier B needs expect`);
  }
  return { watches, problems };
}
