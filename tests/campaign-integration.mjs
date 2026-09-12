import assert from "node:assert/strict";
const base = "http://127.0.0.1:3000";
async function state() {
  const r = await fetch(base + "/api/campaigns");
  assert.equal(r.status, 200, await r.clone().text());
  return r.json();
}
async function save(body) {
  const r = await fetch(base + "/api/campaigns", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  assert.equal(r.status, 200, await r.clone().text());
  return (await r.json()).result;
}
let s = await state();
assert.equal(s.transactions.length, 0);
await save({ action: "initialize" });
await save({ action: "initialize" });
s = await state();
assert.equal(s.campaigns.length, 2);
assert.equal(s.campaigns.flatMap((c) => c.tasks).length, 6);
assert.equal(s.priorWorkOrders.length, 1);
assert.equal(s.goal.receivedCents, 0);
const c = s.campaigns[0],
  winter = s.campaigns[1];
const task = await save({
  action: "task",
  campaignId: c.id,
  title: "Persistence acceptance task",
  dueDate: "2026-09-24",
  dueTime: "17:30",
  category: "Preparation",
  completed: false,
});
const p = await save({
  action: "painting",
  title: "TEST painting",
  thumbnail: "",
  dimensions: "8 × 10 in",
  medium: "Acrylic",
  framing: "Framed",
  availability: "Available",
  regularPriceCents: 20000,
});
await save({
  action: "linkPainting",
  campaignId: c.id,
  projectId: p.projectId,
  salePriceCents: 15000,
});
await save({
  action: "linkPainting",
  campaignId: winter.id,
  projectId: p.projectId,
  salePriceCents: 17500,
});
s = await state();
assert.equal(
  s.campaigns[0].tasks.find((t) => t.id === task.id).dueTime,
  "17:30",
);
assert.equal(s.paintings[0].regularPriceCents, 20000);
assert.equal(s.campaigns[0].artwork[0].salePriceCents, 15000);
await save({ action: "task", ...task, dueDate: "2026-09-23", completed: true });
s = await state();
assert.equal(
  s.campaigns[0].tasks.find((t) => t.id === task.id).completed,
  true,
);
const receipt = {
  action: "receipt",
  campaignId: c.id,
  projectId: p.projectId,
  type: "INCOME",
  amountCents: 17000,
  salesTaxCents: 1000,
  shippingCents: 1000,
  receivedDate: "2026-09-25",
  source: "Test only",
  markSold: true,
  receiptKey: "test-idempotent",
};
await save(receipt);
await save(receipt);
await save({
  ...receipt,
  type: "REFUND",
  amountCents: 5000,
  salesTaxCents: 0,
  shippingCents: 0,
  markSold: false,
  receiptKey: "test-refund",
});
s = await state();
assert.equal(s.transactions.length, 2);
assert.equal(s.goal.receivedCents, 10000);
assert.equal(s.campaigns[0].receivedCents, 10000);
assert.ok(
  s.campaigns.every((c) => c.artwork[0].painting.availability === "Sold"),
);
assert.equal(s.paintings[0].regularPriceCents, 20000);
const m = await (
  await fetch(base + "/api/metrics/income?month=2026-09")
).json();
assert.equal(m.qualifyingCents, 0);
console.log(
  "PASS: setup reuse, persistence reads, shared tasks, prices, cross-campaign sold availability, idempotent receipts, refunds, monthly goal isolation",
);
