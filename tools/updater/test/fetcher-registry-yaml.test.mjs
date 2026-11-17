// Tests for lib/fetcher.mjs, lib/registry.mjs and lib/yamlio.mjs.
import test from "node:test";
import assert from "node:assert/strict";
import { readdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createFetcher, robotsAllows } from "../lib/fetcher.mjs";
import { loadRegistry } from "../lib/registry.mjs";
import { loadYaml } from "../lib/yamlio.mjs";

const DATA = new URL("../../../site/data/", import.meta.url).pathname;
const resp = (status, body = "x".repeat(2000), url, location) => ({ ok: status >= 200 && status < 300, status, url, headers: { get: (h) => (h === "location" ? location : null) }, text: async () => body, arrayBuffer: async () => Buffer.from(body) });
const mk = (map) => createFetcher({ delayMs: 0, fetchImpl: async (u) => { const r = map[u]; if (r instanceof Error) throw r; return r ?? resp(404, "", u); } });

test("robotsAllows: longest rule wins, * group applies", () => {
  const t = "User-agent: *\nDisallow: /private\nAllow: /private/ok\n";
  assert.equal(robotsAllows(t, "/private/x"), false);
  assert.equal(robotsAllows(t, "/private/ok/y"), true);
  assert.equal(robotsAllows(t, "/open"), true);
});

test("fetcher classifies every problem as a failure with a reason", async () => {
  const U = "https://a.example/page";
  const cases = [
    [resp(403, "", U), /HTTP 403/],
    [resp(429, "", U), /HTTP 429/],
    [resp(404, "", U), /HTTP 404/],
    [resp(301, "", U, "https://a.example/other"), /moved/],
    [resp(302, "", U, "https://b.example/page"), /moved/],
    [resp(302, "", U, "file:///etc/passwd"), /moved/],
    [resp(200, "tiny", U), /under 1 KB/],
    [Object.assign(new Error("t"), { name: "TimeoutError" }), /timeout/],
  ];
  for (const [r, re] of cases) {
    const f = mk({ "https://a.example/robots.txt": resp(404, "", ""), [U]: r });
    const out = await f.get(U);
    assert.equal(out.kind, "failure");
    assert.match(out.reason, re);
  }
});

test("fetcher returns the page on 200 and treats a trailing-slash redirect as the same page", async () => {
  const U = "https://a.example/page";
  const f = mk({ "https://a.example/robots.txt": resp(200, "User-agent: *\nDisallow: /nope\n", ""), [U]: resp(301, "", U, U + "/"), [U + "/"]: resp(200, "y".repeat(2000), U + "/") });
  const out = await f.get(U);
  assert.equal(out.kind, "page");
});

test("fetcher obeys robots.txt and backs off a host after a 429", async () => {
  const f = mk({ "https://a.example/robots.txt": resp(200, "User-agent: *\nDisallow: /nope\n", ""), "https://a.example/one": resp(429, "", "https://a.example/one") });
  assert.match((await f.get("https://a.example/nope")).reason, /robots/);
  assert.match((await f.get("https://a.example/one")).reason, /429/);
  assert.match((await f.get("https://a.example/two")).reason, /429 earlier/);
});

test("registry: restricted hosts are refused, vendors default to quote-only", () => {
  const reg = loadRegistry(new URL("../sources.yml", import.meta.url).pathname);
  for (const u of ["https://www.ree.es/x", "https://www.edistribucion.com/", "https://www.capareseau.fr/", "https://www.peeringdb.com/aup", "https://www.dcbyte.com/", "https://www.baxtel.com/", "https://www.datacentermap.com/", "https://www.eudca.org/", "https://www.tsodsoplatform.eu/x"]) {
    assert.throws(() => reg.assertAllowed(u), /restricted/, u);
  }
  assert.equal(reg.assertAllowed("https://www.nvidia.com/en-us/learn/").status, "unreviewed-quote-only");
  assert.equal(reg.lookup("https://epoch.ai/data/x.csv").licence, "CC BY");
  for (const e of reg.entries.filter((e) => e.status === "permitted")) assert.ok(e.licence && e.obligation, e.host);
});

test("yamlio: every file the updater may write round-trips byte-for-byte", () => {
  for (const f of readdirSync(DATA).filter((n) => n.endsWith(".yml") && n !== "meta.yml")) {
    assert.ok(loadYaml(DATA + f).roundTripsExactly(), f);
  }
});

test("yamlio: editing one field changes only that line; null removes a key", () => {
  const d = mkdtempSync(join(tmpdir(), "upd-"));
  const p = join(d, "x.yml");
  writeFileSync(p, "# keep me\n- id: a\n  cost: USD 50\n  note: old\n  checked: 2026-01-01\n- id: b\n  cost: free\n");
  const f = loadYaml(p);
  f.setRowFields("a", { cost: "USD 60", note: null });
  f.setRowFields("b", { note: "[Updater, 2026-10-14] says: hi" });
  assert.equal(f.toString(), "# keep me\n- id: a\n  cost: USD 60\n  checked: 2026-01-01\n- id: b\n  cost: free\n  note: \"[Updater, 2026-10-14] says: hi\"\n");
  assert.throws(() => f.setRowFields("zzz", { cost: "x" }), /no row/);
});

test("fetcher never requests an off-host redirect target", async () => {
  const asked = [];
  const U = "https://a.example/page";
  const f = createFetcher({ delayMs: 0, fetchImpl: async (u) => { asked.push(u); return u.endsWith("robots.txt") ? resp(404, "", u) : resp(302, "", u, "http://169.254.169.254/latest/meta-data"); } });
  const out = await f.get(U);
  assert.match(out.reason, /moved/);
  assert.deepEqual(asked.filter((u) => u.includes("169.254")), []);
});

test("fetcher fails closed when robots.txt is unreadable (5xx), and does not follow a robots redirect", async () => {
  const asked = [];
  const f = createFetcher({ delayMs: 0, fetchImpl: async (u) => { asked.push(u); return u.endsWith("robots.txt") ? resp(503, "", u) : resp(200, "x".repeat(2000), u); } });
  assert.match((await f.get("https://a.example/p")).reason, /robots.txt unreadable/);
  const g = createFetcher({ delayMs: 0, fetchImpl: async (u) => { asked.push(u); return u.endsWith("robots.txt") ? resp(302, "", u, "http://169.254.169.254/") : resp(200, "x".repeat(2000), u); } });
  assert.match((await g.get("https://b.example/p")).reason, /unreadable/);
  assert.deepEqual(asked.filter((u) => u.includes("169.254")), []);
});

test("fetcher refuses an http downgrade or a port change on redirect", async () => {
  const U = "https://a.example/p";
  for (const loc of ["http://a.example/p", "https://a.example:8443/p"]) {
    const f = mk({ "https://a.example/robots.txt": resp(404, "", ""), [U]: resp(301, "", U, loc) });
    assert.match((await f.get(U)).reason, /moved/);
  }
});
