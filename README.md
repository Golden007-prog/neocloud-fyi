# neocloud.fyi

A map of the neoclouds (GPU cloud providers) and the knowledge needed to build and run one:
who the providers are, what they sell, how GPU data centres work (fabric, operations, racks,
power, cooling), and which exams and vendor courses are worth the time. Live at
https://neocloud.fyi. It is a work in progress: a source-linked evidence corpus.

Every row has a source link and a last-checked date, or is marked `confidence: unverified`.
Company figures are claims, not audits.

## Run it locally

Needs Node 20 or newer.

```bash
cd site
npm install
npm run validate   # schemas, trust rules, scrub rules
npm test           # unit tests
npm run build      # validate, then Eleventy into site/_site
npm run serve      # local preview
npm run check      # build + html-validate + link check
```

Facts live in `site/data/*.yml`; pages in `site/src/pages/` render from them.
`tools/updater/` is an optional job that re-checks the pages the data cites (`npm test` there).
Maintainers can set private build-blocking words with `NEOCLOUD_FORBIDDEN_STRINGS`.

## Contribute

- **Fix a figure:** edit the YAML row in `site/data/`, add or keep its `source` URL, set
  `checked` to the date you opened the source, and set `confidence: verified` only if you
  checked it against the entity's own page. Open a pull request, or open an issue if you
  prefer. A correction without a source link cannot be accepted.
- **Add a provider:** add a row to `site/data/providers.yml` with the same fields as its
  neighbours (`npm run validate` tells you what is missing) and open a pull request.
- Look for issues labelled `good first issue` and `help wanted`.
- Do not paste private or confidential material, or text copied from sources that do not
  allow it. Link to the source instead.

How the data is compiled: `docs/sources.md`.

## Licence

- Code: [PolyForm Noncommercial 1.0.0](LICENSE) (source-available, not OSI open source).
- Content and data: [CC BY-NC 4.0](LICENSE-CONTENT).
- Credit Riera Technologies Ltd and neocloud.fyi. Commercial use needs a paid licence:
  see [COMMERCIAL.md](COMMERCIAL.md).
- IBM Plex fonts under `site/src/_assets/fonts/` keep their own licence (SIL OFL 1.1).
