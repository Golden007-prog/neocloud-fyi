// The committed watches.yml must be valid against the committed site data and registry.
import test from "node:test";
import assert from "node:assert/strict";
import { loadWatches } from "../lib/watches.mjs";
import { loadRegistry } from "../lib/registry.mjs";
import { loadYaml } from "../lib/yamlio.mjs";
import { COLLECTIONS } from "../../../site/lib/collections.mjs";

const here = (p) => new URL(p, import.meta.url).pathname;

test("watches.yml has no problems against site/data", () => {
  const rowsOf = (c) => loadYaml(here("../../../site/data/") + COLLECTIONS.find((x) => x.name === c).file).rows();
  const { watches, problems } = loadWatches(here("../watches.yml"), rowsOf, loadRegistry(here("../sources.yml")));
  assert.deepEqual(problems, []);
  assert.ok(watches.length >= 1);
});
