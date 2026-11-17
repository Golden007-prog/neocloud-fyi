// Read site/data/*.yml into plain JS. Missing files return an empty list so the
// scaffold builds before Stage B has written any data.
// NEOCLOUD_DATA_DIR overrides the data directory (used by scripts/validate.test.mjs).
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { join, dirname, basename } from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "yaml";
import { COLLECTIONS } from "./collections.mjs";

export const DATA_DIR =
  process.env.NEOCLOUD_DATA_DIR ??
  join(dirname(fileURLToPath(import.meta.url)), "..", "data");

function readYaml(path) {
  return parse(readFileSync(path, "utf8")) ?? null;
}

function globDir(spec) {
  return join(DATA_DIR, spec.glob.split("/")[0]);
}

// True when Stage B has actually written this collection's data. validate.mjs uses it to
// skip a collection that does not exist yet, so an empty checkout still builds.
export function collectionExists(name) {
  const spec = COLLECTIONS.find((c) => c.name === name);
  if (!spec) throw new Error(`unknown collection: ${name}`);
  if (spec.glob) {
    const dir = globDir(spec);
    return existsSync(dir) && readdirSync(dir).some((f) => f.endsWith(".yml"));
  }
  return existsSync(join(DATA_DIR, spec.file));
}

export function loadCollection(name) {
  const spec = COLLECTIONS.find((c) => c.name === name);
  if (!spec) throw new Error(`unknown collection: ${name}`);
  if (spec.glob) {
    const dir = globDir(spec);
    if (!existsSync(dir)) return [];
    return readdirSync(dir)
      .filter((f) => f.endsWith(".yml"))
      .sort()
      .flatMap((f) => {
        const doc = readYaml(join(dir, f));
        if (doc == null) return [];
        return Array.isArray(doc) ? doc : [{ id: basename(f, ".yml"), ...doc }];
      });
  }
  const path = join(DATA_DIR, spec.file);
  if (!existsSync(path)) return spec.kind === "object" ? {} : [];
  return readYaml(path) ?? (spec.kind === "object" ? {} : []);
}

export function loadAll() {
  return Object.fromEntries(COLLECTIONS.map((c) => [c.name, loadCollection(c.name)]));
}
