import { chromium } from "@playwright/test";
import assert from "node:assert/strict";
const base = process.env.TEST_BASE_URL || "http://127.0.0.1:3000";
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const submitted = [];
  await page.route("**/api/printful?action=status", (route) => route.fulfill({
    contentType: "application/json",
    body: JSON.stringify({ connected: true, stores: [
      { id: 1111111, name: "Mad Wizard Art" },
      { id: 2222222, name: "Spellmark" },
    ] }),
  }));
  await page.route("**/api/printful?action=catalog*", (route) => route.fulfill({
    contentType: "application/json", body: JSON.stringify({ products: [
      { id: 77, title: "Enhanced Matte Paper Framed Poster (in)" },
    ] }),
  }));
  await page.route("**/api/printful?action=product*", (route) => route.fulfill({
    contentType: "application/json", body: JSON.stringify({ variants: [
      { id: 1234, name: 'Enhanced Matte Paper Framed Poster (Black/11"×14")', price: "30.69", currency: "USD" },
    ] }),
  }));
  await page.route("**/api/printful", async (route) => {
    if (route.request().method() !== "POST") return route.continue();
    submitted.push(route.request().postDataJSON());
    await route.fulfill({
      contentType: "application/json", body: JSON.stringify({
        rates: [{ id: "STANDARD", name: "Flat Rate", rate: "11.99", currency: "USD" }],
        storeId: 2222222, quotedAt: "2026-09-23T15:00:00Z",
      }),
    });
  });

  await page.goto(`${base}/etsy?tab=production`);
  await page.getByRole("heading", { name: "Printful Cost Desk" }).waitFor();
  await page.getByText("Printful connected", { exact: false }).waitFor();
  const store = page.getByRole("combobox", { name: "Printful store for shipping" });
  await store.waitFor();
  assert.equal(await store.inputValue(), "", "multiple stores must not auto-select unrelated brands");
  await store.selectOption("2222222");

  await page.getByRole("combobox", { name: "Catalog product" }).selectOption("77");
  await page.getByRole("combobox", { name: "Exact variant" }).selectOption("1234");
  await page.getByRole("button", { name: "Get live shipping estimate" }).click();
  const shippingService = page.getByRole("combobox", { name: "Shipping service" });
  await shippingService.waitFor();
  assert.equal(await shippingService.inputValue(), "STANDARD");
  assert.equal(submitted.length, 1, "request exactly one quote");
  assert.deepEqual(submitted[0], {
    storeId: 2222222, variantId: 1234, quantity: 1,
    countryCode: "US", stateCode: "NJ", zip: "",
  });
  await store.selectOption("1111111");
  assert.equal(await shippingService.count(), 0, "changing stores invalidates quoted shipping");
  console.log("PASS: multi-store selection required, shipping scoped to Spellmark, switching stores clears previous quote.");
} finally { await browser.close(); }
