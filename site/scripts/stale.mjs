#!/usr/bin/env node
// The five oldest checked dates on the site, for the Friday routine. Never fails.
import { COLLECTIONS } from "../lib/collections.mjs";
import { loadCollection } from "../lib/load.mjs";

const rows = COLLECTIONS.filter((c) => c.kind === "list")
  .flatMap((c) => (loadCollection(c.name) ?? []).map((r) => ({ at: `${c.name}/${r.id}`, checked: r.checked })))
  .filter((r) => r.checked)
  .sort((a, b) => a.checked.localeCompare(b.checked))
  .slice(0, 5);

if (!rows.length) { console.log("no rows with a checked date yet"); process.exit(0); }
for (const r of rows) console.log(`${r.checked}  ${r.at}`);
