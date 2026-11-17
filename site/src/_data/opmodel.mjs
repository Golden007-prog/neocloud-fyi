// How many provider rows still have an unknown operating model (absent counts as unknown).
// Used by providers.njk: opmodel.unknown, opmodel.total, opmodel.percent.
import { loadCollection } from "../../lib/load.mjs";
export default function () {
  const rows = loadCollection("providers");
  const unknown = rows.filter((r) => !r.operating_model || r.operating_model === "unknown").length;
  const total = rows.length;
  return { unknown, total, percent: total ? Math.round((unknown / total) * 100) : 0 };
}
