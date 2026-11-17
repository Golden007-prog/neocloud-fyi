// Extractor for NVIDIA learning-path pages (www.nvidia.com/en-us/learn/learning-paths/...).
// Each course is a card; once tags are split to lines it reads, in order:
//   [Self-Paced | Instructor-Led]   <- format pill, the line BEFORE the title
//   Course title (may end in "*")
//   $50 | $1500 | Free              <- price
//   4 Hours | 1 Hour                <- hours
// Usage: extractNvidiaCourse(html, "BlueField DPU Administration")
//   -> { ok: true, facts: {free, price, hours}, format } | { ok: false, reason }
// Deterministic: the title must match exactly one line, and the next two lines must be a
// price/Free and an hours line. Anything else is a failure, never a guess.
import { htmlToLines } from "../lib/text.mjs";

const norm = (s) => s.replace(/\*+$/, "").replace(/\s+/g, " ").trim().toLowerCase();

export function extractNvidiaCourse(html, title) {
  const lines = htmlToLines(html);
  const want = norm(title);
  const at = lines.flatMap((l, i) => (norm(l) === want ? [i] : []));
  if (at.length === 0) return { ok: false, reason: "anchor-not-found" };
  if (at.length > 1) return { ok: false, reason: "anchor-not-unique" };
  const i = at[0];
  const priceLine = lines[i + 1] ?? "";
  const hoursLine = lines[i + 2] ?? "";
  const pm = priceLine.match(/^(?:\$\s?(\d{1,3}(?:,\d{3})+|\d+)|(free))$/i);
  const hm = hoursLine.match(/^(\d+(?:\.\d+)?)\s*hours?$/i);
  if (!pm || !hm) return { ok: false, reason: "layout-changed" };
  const facts = pm[2]
    ? { free: true, price: null, hours: Number(hm[1]) }
    : { free: false, price: Number(pm[1].replace(/,/g, "")), hours: Number(hm[1]) };
  const fm = (lines[i - 1] ?? "").match(/^(self-paced|instructor-led)$/i);
  return { ok: true, facts, format: fm ? fm[1].toLowerCase() : null };
}
