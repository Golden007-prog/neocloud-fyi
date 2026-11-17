// Tests for the NVIDIA exam price extractor and parseCost decimals (round-6 findings #1, #2).
import test from "node:test";
import assert from "node:assert/strict";
import { extractNvidiaExamPrice } from "../extractors/nvidia-exam-price.mjs";
import { parseCost } from "../lib/facts.mjs";

test("decimal price is not truncated", () => {
  const r = extractNvidiaExamPrice("<p>NCP-AIN</p><p><strong>Price</strong>: $450.50</p>", "NCP-AIN");
  assert.equal(r.ok, true);
  assert.equal(r.facts.price, 450.5);
  assert.equal(parseCost("USD 450.50, self-paced").price, 450.5);
});

test("price from another exam section is rejected", () => {
  const html = "<h3>NCP-AIN</h3><p>Exam details</p><h3>NCP-AIO</h3><p><strong>Price</strong>: $500</p>";
  const r = extractNvidiaExamPrice(html, "NCP-AIN");
  assert.equal(r.ok, false);
});

test("price inside the anchor's own section is still read", () => {
  const html = "<h3>NCP-AIN</h3><p><strong>Price</strong>: $400</p><h3>NCP-AIO</h3><p><strong>Price</strong>: $500</p>";
  assert.equal(extractNvidiaExamPrice(html, "NCP-AIN").facts.price, 400);
});
