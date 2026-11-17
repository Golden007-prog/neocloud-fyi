// Every collection on the site, in one place. validate.mjs, the _data loaders and
// lib/urls.mjs all read this, so a new collection is added here once.
export const COLLECTIONS = [
  { name: "meta",           file: "meta.yml",           schema: "meta",           kind: "object", urlPrefix: null,            entryPages: false },
  { name: "categories",     file: "categories.yml",     schema: "categories",     kind: "list",   urlPrefix: "/providers/category/", entryPages: true },
  { name: "providers",      file: "providers.yml",      schema: "providers",      kind: "list",   urlPrefix: "/providers/",   entryPages: true },
  { name: "exams",          file: "exams.yml",          schema: "exams",          kind: "list",   urlPrefix: "/exams/",       entryPages: true },
  { name: "vendor-courses", file: "vendor-courses.yml", schema: "vendor-courses", kind: "list",   urlPrefix: "/courses/",     entryPages: true },
  { name: "cooling-topics", file: "cooling-topics.yml", schema: "cooling-topics", kind: "list",   urlPrefix: "/cooling/",     entryPages: true },
  { name: "paths",          glob: "paths/*.yml",        schema: "paths",          kind: "list",   urlPrefix: "/paths/",       entryPages: true },
  { name: "vocabulary",     file: "vocabulary.yml",     schema: "vocabulary",     kind: "list",   urlPrefix: "/vocabulary/#", entryPages: false },
  { name: "events",         file: "events.yml",         schema: "events",         kind: "list",   urlPrefix: "/events/#",     entryPages: false },
  { name: "leasing",        file: "leasing.yml",        schema: "leasing",        kind: "list",   urlPrefix: "/leasing/#",    entryPages: false },
];

// Hosts that sell exam questions. R5: a URL on one of these fails the build.
export const DENY_HOSTS = [
  "validexamdumps.com", "passitexams.com", "skillcertpro.com", "p2pcerts.com",
  "pass4test.com", "certsland.com", "examsboost.com", "certificationpractice.com",
  "preporato.com", "flashgenius.net",
];

// Build-blocking scrub terms. Rule 5 in scripts/validate.mjs fails the build if any of these
// appears anywhere under site/. This file is itself exempt (see RULE5_EXEMPT in validate.mjs).
//
// The maintainer's real list is private and is not stored in this repo. Set it in the
// environment, comma separated, before building:
//   NEOCLOUD_FORBIDDEN_STRINGS="term one,term two" npm run build
// Without the variable the list is three inert placeholders, so the rule still runs in tests.
const PLACEHOLDERS = ["placeholder-term-1", "placeholder-term-2", "placeholder-term-3"];
const fromEnv = (process.env.NEOCLOUD_FORBIDDEN_STRINGS ?? "")
  .split(",").map((t) => t.trim().toLowerCase()).filter(Boolean);
export const FORBIDDEN_STRINGS = fromEnv.length ? fromEnv : PLACEHOLDERS;

export const STALE_WARN_DAYS = 365;
export const STALE_AMBER_DAYS = 180;
