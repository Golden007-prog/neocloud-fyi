// Read and edit a collection's YAML file without disturbing anything else in it.
// Usage: const f = loadYaml(path); f.rows(); f.setRowFields(id, {note: "x", checked: "…"}); f.toString()
// Uses the `yaml` Document API so comments and key order survive. roundTripsExactly() is the
// safety check: the updater refuses to edit a file whose untouched round trip is not
// byte-identical, because it could not then show a clean diff.
import { readFileSync } from "node:fs";
import { parseDocument } from "yaml";

const OPTS = { lineWidth: 0, flowCollectionPadding: false };

export function loadYaml(path) {
  const text = readFileSync(path, "utf8");
  const doc = parseDocument(text);
  if (doc.errors.length) throw new Error(`${path}: ${doc.errors[0].message}`);
  const items = () => (doc.contents?.items ?? []);
  const find = (id) => items().find((m) => m.get && m.get("id") === id);
  return {
    path,
    text,
    roundTripsExactly: () => parseDocument(text).toString(OPTS) === text,
    rows: () => doc.toJS(),
    // fields: { key: string | null }; null removes the key.
    setRowFields(id, fields) {
      const m = find(id);
      if (!m) throw new Error(`${path}: no row with id ${id}`);
      for (const [k, v] of Object.entries(fields)) {
        if (v === null) m.delete(k);
        else m.set(k, v);
      }
    },
    toString: () => doc.toString(OPTS),
  };
}
