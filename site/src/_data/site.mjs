// Every list collection, keyed by name: site.providers, site["vendor-courses"], ...
import { COLLECTIONS } from "../../lib/collections.mjs";
import { loadCollection } from "../../lib/load.mjs";
export default function () {
  return Object.fromEntries(
    COLLECTIONS.filter((c) => c.kind === "list").map((c) => [c.name, loadCollection(c.name)])
  );
}
