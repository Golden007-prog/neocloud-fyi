// Tests for lib/text.mjs and lib/facts.mjs and the NVIDIA extractor.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { htmlToLines } from "../lib/text.mjs";
import { parseCost, renderCostLike, sameCost } from "../lib/facts.mjs";
import { extractNvidiaCourse } from "../extractors/nvidia-learning-path.mjs";

const fx = readFileSync(new URL("../fixtures/nvidia-learning-path-excerpt.html", import.meta.url), "utf8");

test("htmlToLines drops scripts/styles, decodes entities, one line per tag boundary", () => {
  const l = htmlToLines("<style>x{}</style><script>var a=1</script><p>A &amp; B<br>$50</p>");
  assert.deepEqual(l, ["A & B", "$50"]);
});

test("parseCost reads price, free, hours and format from the site's own style", () => {
  assert.deepEqual(parseCost("USD 50, self-paced, 4 h"), { free: false, price: 50, hours: 4, format: "self-paced" });
  assert.deepEqual(parseCost("Free, 2 h"), { free: true, price: null, hours: 2, format: null });
  assert.deepEqual(parseCost("USD 1,500, private workshop, 12 h"), { free: false, price: 1500, hours: 12, format: null });
  assert.equal(parseCost("14 free modules, exam about USD 250").hours, null);
  assert.equal(parseCost(undefined), null);
});

test("sameCost compares facts, not strings", () => {
  assert.ok(sameCost(parseCost("USD 50, 4 h"), { free: false, price: 50, hours: 4 }));
  assert.ok(!sameCost(parseCost("USD 50, 4 h"), { free: false, price: 60, hours: 4 }));
  assert.ok(!sameCost(parseCost("Free, 2 h"), { free: false, price: 20, hours: 2 }));
});

test("renderCostLike substitutes only the changed tokens", () => {
  assert.equal(renderCostLike("USD 50, self-paced, 4 h", { free: false, price: 60, hours: 4 }), "USD 60, self-paced, 4 h");
  assert.equal(renderCostLike("USD 50, self-paced, 4 h", { free: false, price: 50, hours: 6 }), "USD 50, self-paced, 6 h");
  assert.equal(renderCostLike("Free, 2 h", { free: false, price: 20, hours: 2 }), "USD 20, 2 h");
  assert.equal(renderCostLike("USD 100, 5 h", { free: true, price: null, hours: 5 }), "Free, 5 h");
  assert.equal(renderCostLike("USD 1,500, 12 h", { free: false, price: 2000, hours: 12 }), "USD 2,000, 12 h");
});

test("NVIDIA extractor reads price and hours for a course, exactly once", () => {
  assert.deepEqual(extractNvidiaCourse(fx, "BlueField DPU Administration"), { ok: true, facts: { free: false, price: 50, hours: 4 }, format: "self-paced" });
  assert.deepEqual(extractNvidiaCourse(fx, "Introduction to Networking").facts, { free: true, price: null, hours: 2 });
  assert.equal(extractNvidiaCourse(fx, "Spectrum-X Networking Platform Administration Private Workshop").facts.price, 1500);
});

test("NVIDIA extractor reports not-found and not-unique as failures, never as values", () => {
  assert.deepEqual(extractNvidiaCourse(fx, "No Such Course"), { ok: false, reason: "anchor-not-found" });
  const dup = fx + fx;
  assert.deepEqual(extractNvidiaCourse(dup, "BlueField DPU Administration"), { ok: false, reason: "anchor-not-unique" });
  const broken = "<h3>BlueField DPU Administration*</h3><p>Contact us</p>";
  assert.deepEqual(extractNvidiaCourse(broken, "BlueField DPU Administration"), { ok: false, reason: "layout-changed" });
});

import { extractNvidiaExamPrice } from "../extractors/nvidia-exam-price.mjs";
const ex = readFileSync(new URL("../fixtures/nvidia-exam-price-excerpt.html", import.meta.url), "utf8");

test("NVIDIA exam extractor reads a price whichever side the colon is on, exactly once", () => {
  const one = (h) => extractNvidiaExamPrice(h, "NCP-AIN");
  assert.deepEqual(one(ex.split("<h1>NCP-AIO")[0]), { ok: true, facts: { free: false, price: 400, hours: null } });
  assert.equal(extractNvidiaExamPrice("<p>NCP-AIO</p><p><strong>Price: </strong>$500</p>", "NCP-AIO").facts.price, 500);
  assert.equal(extractNvidiaExamPrice("<p>NCP-AIO</p><p>Price: $1,250</p>", "NCP-AIO").facts.price, 1250);
});

test("NVIDIA exam extractor fails closed on a missing anchor, no price, or two prices", () => {
  assert.equal(extractNvidiaExamPrice(ex, "NCP-XYZ").reason, "anchor-not-found");
  assert.equal(extractNvidiaExamPrice("<p>NCP-AIN</p><p>Contact sales</p>", "NCP-AIN").reason, "layout-changed");
  assert.equal(extractNvidiaExamPrice("<p>NCP-AIN</p><p>Price: $400</p><p>Price: $450</p>", "NCP-AIN").reason, "price-not-unique");
  // On the full two-exam page each anchor reads only its own section.
  assert.equal(extractNvidiaExamPrice(ex, "NCP-AIN").facts.price, 400);
});

test("htmlToLines survives hostile numeric entities", () => {
  assert.deepEqual(htmlToLines("<p>a&#99999999;b &#xD800; &#0; &#x1F600;</p>"), ["a&#99999999;b &#xD800; &#0; \u{1F600}"]);
});

test("htmlToLines is linear on hostile input and never leaks an unclosed script", () => {
  const t0 = Date.now();
  htmlToLines("<script>".repeat(200000));
  htmlToLines("<".repeat(200000));
  assert.ok(Date.now() - t0 < 2000);
  assert.deepEqual(htmlToLines("<p>keep</p><script>secret text"), ["keep"]);
  assert.deepEqual(htmlToLines("<p>a</p><!-- hidden <b>x</b> --><p>b</p>"), ["a", "b"]);
});
