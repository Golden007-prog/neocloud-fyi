// HTML -> text lines. Usage: htmlToLines(html) returns trimmed, non-empty lines, one per
// tag boundary. Scripts and styles are dropped, entities decoded. No dependency on purpose.
const ENT = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", ndash: "-", mdash: "-" };

export function decodeEntities(s) {
  return s.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (m, e) => {
    if (e[0] === "#") {
      const n = e[1].toLowerCase() === "x" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      // Untrusted input: an out-of-range or surrogate code point must not throw.
      return Number.isInteger(n) && n > 0 && n <= 0x10ffff && !(n >= 0xd800 && n <= 0xdfff) ? String.fromCodePoint(n) : m;
    }
    return ENT[e.toLowerCase()] ?? m;
  });
}

const MAX_INPUT = 6_000_000;

// Linear-time tag stripper. Scripts, styles and comments are dropped; an unclosed one drops the
// rest of the page rather than leaking its text. Every other tag becomes a line break.
function stripTags(html) {
  const src = html.length > MAX_INPUT ? html.slice(0, MAX_INPUT) : html;
  const low = src.toLowerCase();
  const out = [];
  let i = 0;
  while (i < src.length) {
    const lt = src.indexOf("<", i);
    if (lt === -1) { out.push(src.slice(i)); break; }
    out.push(src.slice(i, lt));
    let end;
    if (low.startsWith("<!--", lt)) {
      end = src.indexOf("-->", lt + 4);
      if (end === -1) break;
      i = end + 3; out.push("\n"); continue;
    }
    const raw = /^<(script|style)\b/.exec(low.slice(lt, lt + 8));
    if (raw) {
      end = low.indexOf(`</${raw[1]}`, lt);
      if (end === -1) break;
      end = src.indexOf(">", end);
      if (end === -1) break;
      i = end + 1; out.push("\n"); continue;
    }
    end = src.indexOf(">", lt);
    if (end === -1) break;
    out.push("\n");
    i = end + 1;
  }
  return out.join("");
}

export function htmlToLines(html) {
  return decodeEntities(stripTags(html))
    .split("\n")
    .map((l) => l.replace(/\s+/g, " ").trim())
    .filter(Boolean);
}

// Whitespace-collapsed, lower-cased text for substring checks.
export const flat = (lines) => lines.join(" ").toLowerCase();
