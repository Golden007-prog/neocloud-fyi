// Source registry: which hosts the updater may fetch, with their licence record.
// Usage: const reg = loadRegistry("sources.yml"); reg.lookup(url) -> entry; reg.assertAllowed(url)
// `restricted` hosts are a hard deny (terms withhold republication or automated access).
import { readFileSync } from "node:fs";
import { parse } from "yaml";

export function loadRegistry(path) {
  const entries = parse(readFileSync(path, "utf8")).sources;
  const hostOf = (u) => new URL(u).hostname.replace(/^www\./, "").toLowerCase();
  const lookup = (url) => {
    const h = hostOf(url);
    const hit = entries.find((e) => e.host !== "*" && (h === e.host || h.endsWith(`.${e.host}`)));
    return hit ?? entries.find((e) => e.host === "*");
  };
  return {
    entries,
    lookup,
    assertAllowed(url) {
      const e = lookup(url);
      if (!e) throw new Error(`no registry entry for ${url}`);
      if (e.status === "restricted") throw new Error(`${hostOf(url)} is restricted (${e.licence}); link only`);
      return e;
    },
  };
}
