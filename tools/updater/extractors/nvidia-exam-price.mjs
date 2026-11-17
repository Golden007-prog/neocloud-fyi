// Extractor for NVIDIA certification pages (www.nvidia.com/en-us/learn/certification/...).
// The exam details block reads "<strong>Price</strong>: $400" (colon inside or outside the
// tag). Usage: extractNvidiaExamPrice(html, "NCP-AIN") -> { ok: true, facts } | { ok: false, reason }
// Deterministic: the anchor (exam code) must appear on the page, and "Price" followed by a
// dollar amount (decimals kept) must match exactly once, inside the anchor's own
// section (from the anchor to the next other exam code). Hours are not carried: facts.hours is null.
import { htmlToLines } from "../lib/text.mjs";

// Other exam codes end the anchor's section (the page lists several exams, each with its own Price).
const OTHER_CODE = /\bNC[A-Z]-[A-Z0-9]{2,6}\b/g;
const PRICE_RE = /\bPrice\s*:?\s*\$\s?(\d{1,3}(?:,\d{3})+(?:\.\d+)?|\d+(?:\.\d+)?)(?![\d,])/g;

// Text slices that belong to the anchor: from each occurrence to the next different exam code.
function anchorSections(text, anchor) {
  const low = text.toLowerCase(), a = anchor.toLowerCase();
  const codes = [...text.matchAll(OTHER_CODE)].filter((m) => m[0].toLowerCase() !== a);
  const out = [];
  for (let i = low.indexOf(a); i !== -1; i = low.indexOf(a, i + a.length)) {
    const next = codes.find((m) => m.index > i);
    out.push(text.slice(i, next ? next.index : text.length));
  }
  return out;
}

export function extractNvidiaExamPrice(html, anchor) {
  const text = htmlToLines(html).join(" ");
  if (!text.toLowerCase().includes(anchor.toLowerCase())) return { ok: false, reason: "anchor-not-found" };
  const hits = anchorSections(text, anchor).flatMap((sec) => [...sec.matchAll(PRICE_RE)]);
  if (hits.length === 0) return { ok: false, reason: "layout-changed" };
  if (hits.length > 1) return { ok: false, reason: "price-not-unique" };
  return { ok: true, facts: { free: false, price: Number(hits[0][1].replace(/,/g, "")), hours: null } };
}
