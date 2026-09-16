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
assert.equal(s.campaigns.length, 0);

const c = await save({
  action: "campaign",
  title: "End-of-September Studio Sale",
  status: "Preparing",
  startDate: "2026-09-25",
  endDate: "2026-09-30",
  targetCents: 400000,
  notes: "Disposable CI campaign fixture",
});
const winter = await save({
  action: "campaign",
  title: "Black Friday Winter Art Sale",
  status: "Draft",
  startDate: "2026-11-27",
  endDate: "2026-11-30",
  targetCents: 600000,
  notes: "Disposable CI campaign fixture",
});
for (let i = 0; i < 6; i++) {
  const due = new Date("2026-10-09T12:00:00Z");
  due.setUTCDate(due.getUTCDate() + i * 7);
  await save({
    action: "task",
    campaignId: winter.id,
    title: `Paint five winter paintings · week ${i + 1}`,
    dueDate: due.toISOString().slice(0, 10),
    dueTime: "",
    category: "Painting",
    completed: false,
  });
}
await save({
  action: "batch",
  campaignId: winter.id,
  title: "Small framed winter paintings",
  plannedQuantity: 30,
  weeklyQuantity: 5,
  unitPriceCents: 10000,
  startDate: "2026-10-05",
  completionDate: "2026-11-13",
});
await save({
  action: "goal",
  targetCents: 1400000,
  startDate: "2026-01-01",
  dueDate: "2026-12-31",
  basis: "Gross artwork receipts",
  excludeSalesTax: true,
  excludeShipping: true,
});

const retiredBootstrap = await fetch(base + "/api/campaigns", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ action: "initialize" }),
});
assert.equal(retiredBootstrap.status, 400, "Retired campaign bootstrap must stay unavailable.");

s = await state();
assert.equal(s.campaigns.length, 2);
assert.equal(s.campaigns.flatMap((campaign) => campaign.tasks).length, 6);
assert.equal(s.campaigns.find((campaign) => campaign.id === winter.id).batches.length, 1);
assert.equal(s.goal.targetCents, 1400000);
assert.equal(s.goal.receivedCents, 0);

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
  s.campaigns.find((campaign) => campaign.id === c.id).tasks.find((t) => t.id === task.id).dueTime,
  "17:30",
);
assert.equal(s.paintings[0].regularPriceCents, 20000);
assert.equal(
  s.campaigns.find((campaign) => campaign.id === c.id).artwork[0].salePriceCents,
  15000,
);
await save({ action: "task", ...task, dueDate: "2026-09-23", completed: true });
s = await state();
assert.equal(
  s.campaigns.find((campaign) => campaign.id === c.id).tasks.find((t) => t.id === task.id).completed,
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
assert.equal(
  s.campaigns.find((campaign) => campaign.id === c.id).receivedCents,
  10000,
);
assert.ok(
  s.campaigns.every((campaign) => campaign.artwork[0].painting.availability === "Sold"),
);
assert.equal(s.paintings[0].regularPriceCents, 20000);
const m = await (
  await fetch(base + "/api/metrics/income?month=2026-09")
).json();
assert.equal(m.qualifyingCents, 0);
console.log(
  "PASS: ordinary API fixtures, retired bootstrap, persistence reads, shared tasks, prices, cross-campaign sold availability, idempotent receipts, refunds, monthly goal isolation",
);
