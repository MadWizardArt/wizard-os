import test from "node:test";
import assert from "node:assert/strict";
import { readProduct, readVariant } from "../lib/warlock-products.ts";

test("canonical product metadata requires a real title and bounded fields", () => {
  assert.equal(readProduct({ title: "" }), null);
  assert.equal(readProduct({ title: "x".repeat(141) }), null);
  assert.equal(readProduct({ title: "Owl", status: "PUBLISHED" }), null);
  assert.deepEqual(readProduct({ title: " Volans Aethereus ", collection: " Cabinet of Curiosities " }), {
    title: "Volans Aethereus", collection: "Cabinet of Curiosities",
    description: "", artworkReference: "", notes: "", status: "DESIGN",
  });
});

test("digital and physical variants cannot cross fulfillment boundaries", () => {
  assert.equal(readVariant({ fulfillment: "DIGITAL", label: "Folio", printfulVariantId: 7 }), null);
  assert.equal(readVariant({ fulfillment: "PHYSICAL", label: "Print", printfulVariantId: 7 }), null);
  assert.equal(readVariant({ fulfillment: "PHYSICAL", label: "Print", printfulProductId: -1, printfulVariantId: 3 }), null);
  assert.equal(readVariant({ fulfillment: "PHYSICAL", label: "Print", printfulProductId: 42, printfulVariantId: 123 }), null, "a mapped physical edition must specify its store");
  assert.equal(readVariant({ fulfillment: "DIGITAL", label: "Folio", printfulStoreId: 4999878 }), null);
  assert.equal(readVariant({ fulfillment: "PHYSICAL", label: "Print", printfulProductId: 42, printfulVariantId: 123, printfulStoreId: 0 }), null);
  assert.deepEqual(readVariant({ fulfillment: "PHYSICAL", label: " 8x10 ", printfulProductId: 42, printfulVariantId: 123, printfulStoreId: 4999878 }), {
    fulfillment: "PHYSICAL", label: "8x10", printfulProductId: 42, printfulVariantId: 123, printfulStoreId: 4999878,
  });
  assert.deepEqual(readVariant({ fulfillment: "DIGITAL", label: "8 printable folios" }), {
    fulfillment: "DIGITAL", label: "8 printable folios", printfulProductId: null, printfulVariantId: null, printfulStoreId: null,
  });
});
