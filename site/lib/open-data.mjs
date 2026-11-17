// Open-data export of the providers list: JSON and CSV, one row per provider, each row
// carrying its source URL and checked date, under the site's content licence (CC BY-NC 4.0).
// Used by eleventy.config.mjs (written to _site/data/ after each build) and by
// scripts/open-data.test.mjs. Pure functions: no file or network access here.
//   import { providersJson, providersCsv, COLUMNS } from "./open-data.mjs";

export const LICENCE = "CC BY-NC 4.0";
export const LICENCE_URL = "https://creativecommons.org/licenses/by-nc/4.0/";
export const ATTRIBUTION = "neocloud.fyi (https://neocloud.fyi/)";

// Column order of the CSV and key order of each JSON row. Every column is a field of
// providers.yml; `licence` is repeated per row so a row copied alone keeps its licence.
export const COLUMNS = [
  "id", "name", "hq", "category", "operating_model", "operating_model_source",
  "operating_model_checked", "sells", "stack", "europe", "scale",
  "source", "checked", "confidence", "note", "licence",
];

// YAML may yield Date objects for unquoted dates; always emit YYYY-MM-DD.
const iso = (v) => (v instanceof Date ? v.toISOString().slice(0, 10) : v);

export function toRow(p) {
  const row = {};
  for (const c of COLUMNS) row[c] = c === "licence" ? LICENCE : iso(p[c]) ?? "";
  return row;
}

export function providersJson(providers, generated) {
  return JSON.stringify(
    {
      licence: LICENCE,
      licence_url: LICENCE_URL,
      attribution: ATTRIBUTION,
      generated,
      note: "Figures are company claims, not audits. Each row's source is the page it was read from; checked is the date it was last opened. confidence 'unverified' means the claim has not been re-checked by hand.",
      count: providers.length,
      providers: providers.map(toRow),
    },
    null,
    2,
  ) + "\n";
}

// RFC 4180: quote a field containing a comma, quote, CR or LF; double inner quotes.
const cell = (v) => (/[",\r\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v));

export function providersCsv(providers) {
  const lines = [COLUMNS.join(",")];
  for (const p of providers) {
    const row = toRow(p);
    lines.push(COLUMNS.map((c) => cell(row[c])).join(","));
  }
  return lines.join("\r\n") + "\r\n";
}
