// Eleventy config for neocloud.fyi. Run from site/: `npm run build`.
// Input site/src, output site/_site. Facts live in site/data/*.yml and reach templates
// through the loaders in site/src/_data/.
import { mkdirSync, writeFileSync } from "node:fs";
import { loadCollection } from "./lib/load.mjs";
import { assertTurnstileKey } from "./lib/turnstile.mjs";
import { providersJson, providersCsv } from "./lib/open-data.mjs";

export default function (eleventyConfig) {
  eleventyConfig.addPassthroughCopy({ "src/_assets/css": "assets/css" });
  eleventyConfig.addPassthroughCopy({ "src/_assets/js": "assets/js" });
  eleventyConfig.addPassthroughCopy({ "src/_assets/fonts": "assets/fonts" });

  // Default permalink: src/pages/<x>.njk -> /<x>/index.html, so the src/pages/ folder does
  // not appear in any URL. A template that sets its own `permalink` overrides this.
  eleventyConfig.addGlobalData("permalink", () => (data) => {
    const stem = data.page.filePathStem.replace(/^\/pages(?=\/|$)/, "");
    return stem === "/index" || stem === "" ? "/index.html" : `${stem}/index.html`;
  });

  // ISO date (YYYY-MM-DD) from a date string or Date, for the source line.
  eleventyConfig.addFilter("isoDate", (d) =>
    d instanceof Date ? d.toISOString().slice(0, 10) : String(d).slice(0, 10),
  );

  // The n rows with the latest `checked` date, newest first; ties broken by id so the
  // list is stable between builds. Used by the home page's "Recently checked" list.
  eleventyConfig.addFilter("recentlyChecked", (rows, n = 5) => {
    const iso = (d) => (d instanceof Date ? d.toISOString().slice(0, 10) : String(d).slice(0, 10));
    return [...rows]
      .sort((a, b) => iso(b.checked).localeCompare(iso(a.checked)) || String(a.id).localeCompare(String(b.id)))
      .slice(0, n);
  });

  // Days between a checked date and today, for the staleness partial.
  eleventyConfig.addFilter("ageDays", (d) => {
    const iso = d instanceof Date ? d.toISOString().slice(0, 10) : String(d).slice(0, 10);
    const then = Date.parse(iso);
    if (Number.isNaN(then)) return null;
    return Math.floor((Date.now() - then) / 86400000);
  });

  // Nunjucks {% if %}/{% include %} blocks leave lines of pure indentation behind, which
  // html-validate reports as no-trailing-whitespace. Stage C cannot add a transform, so
  // strip it here, once, for every page.
  eleventyConfig.addTransform("trimTrailingWhitespace", function (content) {
    if (!(this.page.outputPath || "").endsWith(".html")) return content;
    return content.replace(/[ \t]+$/gm, "");
  });

  // Fail the build if the corrections form's Turnstile widget would render with no site key.
  eleventyConfig.addTransform("turnstileKeyGuard", function (content) {
    const out = this.page.outputPath || "";
    if (out.endsWith(".html")) assertTurnstileKey(content, out);
    return content;
  });

  // Open data: /data/providers.json and /data/providers.csv (CC BY-NC 4.0), written from the same
  // providers.yml the pages render from. See lib/open-data.mjs.
  eleventyConfig.on("eleventy.after", ({ dir }) => {
    const providers = loadCollection("providers");
    const out = `${dir.output}/data`;
    mkdirSync(out, { recursive: true });
    writeFileSync(`${out}/providers.json`, providersJson(providers, new Date().toISOString().slice(0, 10)));
    writeFileSync(`${out}/providers.csv`, providersCsv(providers));
  });

  return {
    dir: { input: "src", includes: "_includes", data: "_data", output: "_site" },
    markdownTemplateEngine: "njk",
    htmlTemplateEngine: "njk",
    templateFormats: ["njk", "md", "html"],
  };
}
