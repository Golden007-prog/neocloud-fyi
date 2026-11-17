// Progressive filter for the provider table. Rows are server-rendered; this only hides.
(() => {
  const table = document.querySelector("#providers");
  if (!table) return;
  const rows = [...table.tBodies[0].rows];
  const q = document.querySelector("#psearch");
  const count = document.querySelector("#count");
  let cat = "all";
  const apply = () => {
    const needle = (q?.value ?? "").trim().toLowerCase();
    let shown = 0;
    for (const r of rows) {
      const okCat = cat === "all" || r.dataset.cat === cat;
      const okText = !needle || r.dataset.search.includes(needle);
      r.hidden = !(okCat && okText);
      if (!r.hidden) shown++;
    }
    if (count) count.textContent = `${shown} of ${rows.length}`;
  };
  for (const b of document.querySelectorAll("[data-catbtn]")) {
    b.addEventListener("click", () => {
      cat = b.dataset.catbtn;
      for (const o of document.querySelectorAll("[data-catbtn]")) o.setAttribute("aria-pressed", String(o === b));
      apply();
    });
  }
  q?.addEventListener("input", apply);
  apply();
})();
