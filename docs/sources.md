# How this is compiled

This is the source of truth behind the site's `/sources/` page. It explains where the data
lives, what the trust labels mean, and how to send a correction.

## Where the data lives

Every fact on the site comes from a YAML file under `site/data/`: one row per provider, exam,
vendor course, cooling topic, learning-path step, vocabulary term, event, or leasing
requirement. There is no database and no CMS — the YAML files in git are the whole store.

Each collection is validated at build time (`npm run build`, and again in CI) against a JSON
Schema in `site/schemas/`. A row that doesn't match its schema, or that carries a figure with
no `source` or no `checked` date, fails the build. Facts are added and corrected by editing
YAML and opening a pull request or.

## `confidence: verified` vs `confidence: unverified`

Every row carries a `confidence` field:

- **`verified`** — the fact was checked directly against the entity's own source (its own
  website, its own filing, its own documentation) and matched.
- **`unverified`** — the fact could not be confirmed against a primary source, or was taken
  from a secondary source only. An `unverified` row also carries a `note:` saying what
  couldn't be confirmed. The site renders an "unverified" badge on these rows rather than
  hiding the gap.

Nothing is guessed. If a number, price or URL can't be confirmed, the row is marked
`unverified` with a note rather than filled in with a best guess.

## What a `checked` date means

`checked` is an ISO date recording the last time a human or an agent actually opened the
row's `source` URL and confirmed the fact against it. It is not the date the row was added,
and it is not a promise the fact is still true today — it is a record of when it was last
looked at.

### Staleness thresholds

- **Over 180 days:** the site marks the row's "last checked" date in amber. This is a nudge,
  not a problem — `npm run stale` surfaces the five oldest `checked` dates for the weekly
  routine to re-check.
- **Over 365 days:** the build emits a warning.
- In both cases, **staleness never fails the build.** The site must not break by standing
  still — a page that hasn't been re-checked in a while stays up, visibly flagged, rather than
  disappearing or blocking a deploy.

## Company figures are claims, not audits

Prices, capacities, specs and dates published by a company about itself are that company's own
claim, not an independently audited fact. The site links to the primary source so readers can
judge for themselves; it does not represent vendor-published figures as verified by anyone
other than the vendor.

## Licence

- **Content and data:** CC BY-NC 4.0 (`LICENSE-CONTENT`).
- **Build code:** PolyForm Noncommercial 1.0.0 (`LICENSE`).
- **Commercial use:** needs a paid licence; see `COMMERCIAL.md`.

## Sending a correction

Email corrections@neocloud.fyi or open a GitHub issue. A **source URL is required**
— a correction with no source to check it against can't be accepted. Say which page or row is wrong and what the correct value is.
