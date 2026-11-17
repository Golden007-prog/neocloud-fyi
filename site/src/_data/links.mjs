// Bidirectional cross-link index. If the fabric path names cooling, the cooling page gets
// fabric back automatically, so a link cannot rot one way.
import { COLLECTIONS } from "../../lib/collections.mjs";
import { loadCollection } from "../../lib/load.mjs";
import { urlFor } from "../../lib/urls.mjs";

export default function () {
  const rows = [];
  for (const c of COLLECTIONS) {
    if (c.kind !== "list") continue;
    for (const r of loadCollection(c.name) ?? []) {
      if (r && r.id) rows.push({ ...r, _collection: c.name });
    }
  }
  const byId = new Map(rows.map((r) => [r.id, r]));
  const links = Object.fromEntries(rows.map((r) => [r.id, []]));
  const seen = new Set();

  const push = (from, to, reason) => {
    const target = byId.get(to);
    if (!target) return; // validate.mjs rule 3 already failed the build on this
    if (!links[from]) return;
    const key = `${from}>${to}`;
    if (seen.has(key)) return;
    seen.add(key);
    links[from].push({
      id: target.id,
      collection: target._collection,
      name: target.name ?? target.title ?? target.term ?? target.label ?? target.id,
      url: urlFor(target._collection, target.id),
      reason: reason ?? null,
    });
  };

  for (const r of rows) {
    for (const other of r.related ?? []) {
      const reason = (r.related_reasons ?? {})[other] ?? null;
      push(r.id, other, reason);          // declared direction, with its prose reason
      push(other, r.id, reason);          // and the inverse, same reason
    }
  }
  for (const id of Object.keys(links)) links[id].sort((a, b) => a.name.localeCompare(b.name));
  return links;
}
