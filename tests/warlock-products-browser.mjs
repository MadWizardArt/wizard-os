import { chromium } from "@playwright/test";
import assert from "node:assert/strict";
const base = process.env.TEST_BASE_URL || "http://127.0.0.1:3000";
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await page.goto(`${base}/etsy`);
  await page.getByRole("heading", { name: "Warlock", exact: true }).waitFor();
  await page.getByRole("navigation", { name: "Warlock workspace" }).getByRole("button", { name: /Products/ }).click();
  await page.getByText("One artwork, many editions.").waitFor();
  assert.equal(await page.getByText("Volans Aethereus", { exact: true }).count(), 0, "do not seed demo products");
  await page.getByRole("navigation", { name: "Warlock workspace" }).getByRole("button", { name: /Production/ }).click();
  await page.getByRole("heading", { name: "Printful Cost Desk" }).waitFor();
  assert.ok(page.url().includes("tab=production"));
  await page.getByRole("navigation", { name: "Warlock workspace" }).getByRole("button", { name: /Listings/ }).click();
  await page.getByText("Your existing Etsy draft tools remain intact.", { exact: false }).waitFor();
  const unauth = await page.request.get(`${base}/api/warlock/products`);
  assert.equal(unauth.status(), 401, "private product data requires Artist Gate");
  const write = await page.request.post(`${base}/api/warlock/products`, { data: { title: "Unauthorized" } });
  assert.equal(write.status(), 401, "product writes require Artist Gate");
  console.log("PASS: unified Warlock tabs, existing Etsy tools, no demo records, artist-gated product API.");
} finally { await browser.close(); }
