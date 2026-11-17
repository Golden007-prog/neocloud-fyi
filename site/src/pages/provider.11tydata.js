// Template-specific computed data for provider.njk (matches by basename per Eleventy's
// "template and directory specific data files" convention — applies only to provider.njk,
// not to sibling page templates in this directory).
//
// Every field here is a plain JS function, not a Nunjucks front-matter template string
// (e.g. "{{ row.name }}"). Two reasons:
//  - `related` and `crumbs` must stay real arrays of objects. A templated string always
//    renders to a string, turning an array into "[object Object],[object Object]".
//  - Nunjucks autoescapes template-string output by default, so a scalar field written as
//    "{{ row.note }}" gets HTML-escaped once when the computed value is resolved and again
//    when the layout prints it — an apostrophe in a note or lede would come out double
//    escaped ("&amp;#39;"). A JS function copies the value through untouched.
// See docs/plan.md Task C1 / Stage C shared rules for the general hazard.
export default {
  eleventyComputed: {
    title: (data) => data.row.name,
    eyebrow: () => "Provider",
    lede: (data) => data.row.sells,
    source: (data) => data.row.source,
    checked: (data) => data.row.checked,
    confidence: (data) => data.row.confidence,
    note: (data) => data.row.note,
    related: (data) => data.links[data.row.id] ?? [],
    crumbs: (data) => [
      { url: "/providers/", label: "Providers" },
      { url: `/providers/${data.row.id}/`, label: data.row.name },
    ],
  },
};
