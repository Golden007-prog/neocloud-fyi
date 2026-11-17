// The canonical URL for any row id. Anchored collections (vocabulary, events, leasing)
// return /page/#id; collections with their own entry pages return /prefix/id/.
import { COLLECTIONS } from "./collections.mjs";

export function urlFor(collection, id) {
  const spec = COLLECTIONS.find((c) => c.name === collection);
  if (!spec || !spec.urlPrefix) return null;
  return spec.urlPrefix.endsWith("#") ? `${spec.urlPrefix}${id}` : `${spec.urlPrefix}${id}/`;
}
