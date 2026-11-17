// Polite fetcher. Usage: const f = createFetcher({ delayMs: 5000 }); await f.get(url)
//   -> { kind: "page", html, finalUrl } | { kind: "failure", reason }
// Honours robots.txt, spaces requests per host, caps size, and classifies every problem as a
// failure. A failure is never evidence about a value (design section e). It does not try to get
// round a block: a 403 or 429 is simply reported.
const UA = "neocloud-fyi-updater/0.1 (research; https://neocloud.fyi)";
const MAX_BYTES = 5_000_000;
const MIN_BYTES = 1000;
const norm = (u) => new URL(u).hostname.replace(/^www\./, "").toLowerCase();
const trimPath = (p) => p.replace(/\/+$/, "").toLowerCase();

// Minimal robots.txt: longest matching rule in the `*` group (or our own agent) wins.
export function robotsAllows(txt, path) {
  const rules = [];
  let applies = false;
  let seenAgent = false;
  for (const raw of txt.split("\n")) {
    const line = raw.replace(/#.*/, "").trim();
    const m = line.match(/^([a-z-]+)\s*:\s*(.*)$/i);
    if (!m) continue;
    const k = m[1].toLowerCase();
    if (k === "user-agent") {
      if (!seenAgent) applies = false;
      seenAgent = true;
      const a = m[2].trim().toLowerCase();
      if (a === "*" || (a !== "" && UA.toLowerCase().startsWith(a))) applies = true;
    } else {
      seenAgent = false;
      if (applies && (k === "allow" || k === "disallow") && m[2]) rules.push({ allow: k === "allow", p: m[2] });
    }
  }
  const hits = rules.filter((r) => path.startsWith(r.p.replace(/\*$/, ""))).sort((a, b) => b.p.length - a.p.length);
  return hits.length ? hits[0].allow : true;
}

// Read a body without buffering more than MAX_BYTES; null when it is larger.
async function readCapped(res) {
  if (!res.body?.getReader) {
    const b = Buffer.from(await res.arrayBuffer());
    return b.length > MAX_BYTES ? null : b;
  }
  const chunks = [];
  let n = 0;
  const reader = res.body.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    n += value.length;
    if (n > MAX_BYTES) { await reader.cancel(); return null; }
    chunks.push(Buffer.from(value));
  }
  return Buffer.concat(chunks);
}

export function createFetcher({ fetchImpl = fetch, delayMs = 5000, timeoutMs = 30000, sleep = (ms) => new Promise((r) => setTimeout(r, ms)) } = {}) {
  const last = new Map();
  const robots = new Map();
  const backoff = new Set();

  async function paced(host) {
    const wait = (last.get(host) ?? 0) + delayMs - Date.now();
    if (wait > 0) await sleep(wait);
    last.set(host, Date.now());
  }

  // robots.txt: 2xx is read (first 500 KB), 4xx means no rules (RFC 9309), anything else
  // (5xx, timeout, redirect off-host) means "unreadable", and the page is then not fetched.
  async function robotsFor(url) {
    const u = new URL(url);
    if (!robots.has(u.origin)) {
      await paced(norm(url));
      let txt = null;
      try {
        const r = await fetchImpl(`${u.origin}/robots.txt`, { headers: { "user-agent": UA }, redirect: "manual", signal: AbortSignal.timeout(timeoutMs) });
        if (r.status >= 200 && r.status < 300) txt = (await r.text()).slice(0, 500_000);
        else if (r.status >= 400 && r.status < 500) txt = "";
      } catch { /* unreadable */ }
      robots.set(u.origin, txt);
    }
    return robots.get(u.origin);
  }

  return {
    async get(url) {
      const host = norm(url);
      if (backoff.has(host)) return { kind: "failure", reason: "HTTP 429 earlier in this run" };
      const rtxt = await robotsFor(url);
      if (rtxt === null) return { kind: "failure", reason: "robots.txt unreadable" };
      if (!robotsAllows(rtxt, new URL(url).pathname)) return { kind: "failure", reason: "robots.txt disallows" };
      await paced(host);
      // Redirects are followed by hand so that no request is ever sent to a host, or a path,
      // other than the one the row cites. A hop elsewhere is reported as "moved", unfetched.
      let res;
      let current = url;
      try {
        for (let hop = 0; ; hop++) {
          res = await fetchImpl(current, { headers: { "user-agent": UA, accept: "text/html" }, redirect: "manual", signal: AbortSignal.timeout(timeoutMs) });
          if (res.status < 300 || res.status >= 400) break;
          const loc = res.headers?.get?.("location");
          if (!loc || hop >= 5) return { kind: "failure", reason: "redirect loop or missing location" };
          const next = new URL(loc, current).toString();
          const n = new URL(next);
          const o = new URL(url);
          if (norm(next) !== host || trimPath(n.pathname) !== trimPath(o.pathname) || n.protocol !== "https:" || n.port !== o.port) {
            // Fixed wording only: the Location value is server-controlled and must not reach a note.
            return { kind: "failure", reason: "moved (redirect to another host, path or scheme)" };
          }
          current = next;
        }
      } catch (e) {
        return { kind: "failure", reason: e?.name === "TimeoutError" ? "timeout" : "network error" };
      }
      if (res.status === 429) backoff.add(host);
      if (!res.ok) return { kind: "failure", reason: `HTTP ${res.status}` };
      const finalUrl = current;
      const buf = await readCapped(res);
      if (buf === null) return { kind: "failure", reason: "response over 5 MB" };
      if (buf.length < MIN_BYTES) return { kind: "failure", reason: "page under 1 KB" };
      return { kind: "page", html: buf.toString("utf8"), finalUrl };
    },
  };
}
