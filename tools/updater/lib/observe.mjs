// Turn a fetched page into an observation for decide(). Tier A runs the named extractor;
// Tier B looks for each expected token within `window` characters after the anchor.
import { htmlToLines, flat } from "./text.mjs";
import { EXTRACTORS } from "../extractors/index.mjs";

// A token ends at a boundary: "$495" is not found inside "$4950" or "$495,000".
const hasToken = (seg, tok) => {
  for (let i = seg.indexOf(tok); i !== -1; i = seg.indexOf(tok, i + 1)) {
    const next = seg[i + tok.length] ?? "";
    if (!(/\d$/.test(tok) && /[\d,.]/.test(next) && /\d/.test(seg[i + tok.length + (next === "," || next === "." ? 1 : 0)] ?? ""))) return true;
  }
  return false;
};

export function observe(watch, page) {
  if (page.kind === "failure") return { kind: "failure", reason: page.reason };
  if (watch.tier === "A") {
    const r = EXTRACTORS[watch.extractor](page.html, watch.anchor);
    return r.ok ? { kind: "ok", facts: r.facts } : { kind: "failure", reason: r.reason };
  }
  const text = flat(htmlToLines(page.html));
  const anchor = watch.anchor.toLowerCase().replace(/\s+/g, " ");
  const win = watch.window ?? 400;
  const starts = [];
  for (let i = text.indexOf(anchor); i !== -1; i = text.indexOf(anchor, i + 1)) starts.push(i);
  if (!starts.length) return { kind: "failure", reason: "anchor-not-found" };
  const want = watch.expect.map((t) => t.toLowerCase().replace(/\s+/g, " "));
  let best = want;
  for (const s of starts) {
    const seg = text.slice(s, s + anchor.length + win);
    const missing = watch.expect.filter((_, i) => !hasToken(seg, want[i]));
    if (missing.length < best.length || best === want) best = missing;
    if (!missing.length) return { kind: "ok", missing: [] };
  }
  return { kind: "ok", missing: best === want ? watch.expect : best };
}
