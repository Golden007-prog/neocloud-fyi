// Parse and re-render the "cost" style strings used on the site ("USD 50, self-paced, 4 h").
// Comparison is by facts, so a change of wording is not a change of value.
const PRICE = /(?:USD|US\$|\$)\s?(\d{1,3}(?:,\d{3})+(?:\.\d+)?|\d+(?:\.\d+)?)/i;
const HOURS = /(\d+(?:\.\d+)?)\s*(?:h|hours?)\b/i;
const FORMAT = /\b(self-paced|instructor-led)\b/i;

export function parseCost(s) {
  if (typeof s !== "string") return null;
  const p = s.match(PRICE);
  const h = s.match(HOURS);
  const f = s.match(FORMAT);
  return {
    free: !p && /\bfree\b/i.test(s),
    price: p ? Number(p[1].replace(/,/g, "")) : null,
    hours: h ? Number(h[1]) : null,
    format: f ? f[1].toLowerCase() : null,
  };
}

// Equality on the facts the extractor can supply: free/price and hours.
export function sameCost(a, b) {
  return !!a && !!b && !!a.free === !!b.free && (a.price ?? null) === (b.price ?? null) && (a.hours ?? null) === (b.hours ?? null);
}

const fmtPrice = (n) => `USD ${n.toLocaleString("en-US", { minimumFractionDigits: Number.isInteger(n) ? 0 : 2 })}`;

// Rewrite only the price/free and hours tokens of the recorded string; keep all other words.
export function renderCostLike(recorded, facts) {
  let out = recorded;
  const priceText = facts.free ? "Free" : fmtPrice(facts.price);
  if (PRICE.test(out)) out = out.replace(PRICE, priceText);
  else if (/\bfree\b/i.test(out)) out = out.replace(/\bfree\b/i, priceText);
  if (facts.hours != null && HOURS.test(out)) out = out.replace(HOURS, `${facts.hours} h`);
  return out;
}
