// Template-specific computed data for provider-category.njk (matches by basename per
// Eleventy's "template and directory specific data files" convention — applies only to
// provider-category.njk). Every field is a plain JS function rather than a Nunjucks
// front-matter template string — see provider.11tydata.js for why: array fields would be
// stringified, and scalar fields with an apostrophe or ampersand would be HTML-escaped
// twice (once resolving the computed value, once when the layout prints it).
export default {
  eleventyComputed: {
    title: (data) => data.cat.label,
    eyebrow: () => "Provider category",
    lede: (data) => data.cat.description,
    source: (data) => data.cat.source,
    checked: (data) => data.cat.checked,
    confidence: (data) => data.cat.confidence,
    note: (data) => data.cat.note,
    related: (data) => data.links[data.cat.id] ?? [],
    crumbs: (data) => [
      { url: "/providers/", label: "Providers" },
      { url: `/providers/category/${data.cat.id}/`, label: data.cat.label },
    ],
  },
};
