import assert from "node:assert/strict";

const base = process.env.WIZARD_TEST_BASE_URL || "http://127.0.0.1:3000";

async function request(path, init = {}) {
  const response = await fetch(`${base}${path}`, init);
  let body = null;
  try { body = await response.json(); } catch {}
  return { response, body };
}

const created = await request("/api/campaigns", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({
    action: "campaign",
    title: "Lifecycle CI Campaign",
    status: "Draft",
    startDate: "2026-09-20",
    endDate: "2026-09-30",
    targetCents: 10000,
    notes: "Disposable CI lifecycle record",
  }),
});
assert.equal(created.response.status, 200, `Campaign creation failed: ${JSON.stringify(created.body)}`);
const id = created.body?.result?.id;
assert.ok(id, "Lifecycle test campaign must have an id.");

for (const expected of ["Preparing", "Live", "Fulfillment", "Closed"]) {
  const advanced = await request("/api/campaigns/lifecycle", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ id, action: "advance" }),
  });
  assert.equal(advanced.response.status, 200, `Advance to ${expected} failed: ${JSON.stringify(advanced.body)}`);
  assert.equal(advanced.body?.status, expected, `Campaign should advance to ${expected}.`);
}

const beyondClosed = await request("/api/campaigns/lifecycle", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ id, action: "advance" }),
});
assert.equal(beyondClosed.response.status, 409, "Closed campaigns must not advance further.");

const crossOrigin = await request("/api/campaigns/lifecycle", {
  method: "POST",
  headers: { "content-type": "application/json", origin: "https://example.invalid" },
  body: JSON.stringify({ id, action: "advance" }),
});
assert.equal(crossOrigin.response.status, 403, "Cross-origin campaign progression must be rejected.");

console.log("Campaign lifecycle integration checks passed.");
