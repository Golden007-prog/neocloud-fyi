// verdict.js — filter the exam and vendor-course index tables by verdict chip.
// Every row is server-rendered; this only toggles `hidden`. Binds each filter group
// to its table by a shared [data-verdict-table] value (not an id), so the same file
// runs unmodified on both /exams/ and /courses/.
document.querySelectorAll(".filters[data-verdict-table]").forEach(function (group) {
  var table = document.querySelector(
    'table[data-verdict-table="' + group.getAttribute("data-verdict-table") + '"]'
  );
  if (!table) return;
  var rows = table.querySelectorAll("tbody tr");
  var buttons = group.querySelectorAll("button[data-verdict]");
  buttons.forEach(function (btn) {
    btn.addEventListener("click", function () {
      var v = btn.getAttribute("data-verdict");
      buttons.forEach(function (b) {
        b.setAttribute("aria-pressed", String(b === btn));
      });
      rows.forEach(function (r) {
        r.hidden = v !== "all" && r.getAttribute("data-verdict") !== v;
      });
    });
  });
});
