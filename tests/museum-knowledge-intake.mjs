import assert from "node:assert/strict";

const base = process.env.WIZARD_TEST_BASE_URL || "http://127.0.0.1:3000";
const key = process.env.MUSE_KNOWLEDGE_INGEST_KEY || "";
assert.ok(key.length >= 24, "CI must configure a non-production Knowledge Intake test key.");

async function request(init) {
  const response = await fetch(`${base}/api/museum/knowledge/intake`, init);
  let body = null;
  try { body = await response.json(); } catch {}
  return { response, body };
}

const anonymous = await request({ method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({}) });
assert.equal(anonymous.response.status, 401, "Configured Knowledge Intake must reject anonymous submissions.");

const wrong = await request({
  method: "POST",
  headers: { "content-type": "application/json", authorization: "Bearer definitely-the-wrong-intake-key" },
  body: JSON.stringify({ title: "Wrong key", content: "Should not enter.", sourceRef: "ci:wrong" }),
});
assert.equal(wrong.response.status, 401, "Knowledge Intake must reject the wrong service key.");

const accepted = await request({
  method: "POST",
  headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
  body: JSON.stringify({
    capsules: [{
      title: "CI Project capsule",
      content: "A Project-derived capsule should enter the Inbox inert until the Artist verifies it.",
      kind: "artist_directive",
      sourceRef: "Nine Muses Project · CI intake verification",
      category: "system",
      targetMuseIds: ["novy"],
      tags: ["ci", "knowledge intake"],
      verifiedByArtist: true
    }]
  }),
});
assert.equal(accepted.response.status, 202, "Authorized bridge submission should be accepted into the Inbox.");
assert.equal(accepted.body.accepted.length, 1);
assert.equal(accepted.body.accepted[0].verifiedByArtist, false, "External intake must force capsules to unverified even if the sender claims Artist approval.");
assert.match(accepted.body.policy, /No capsule becomes active/i);

const status = await fetch(`${base}/api/museum/knowledge/intake`);
assert.equal(status.status, 401, "Bridge configuration details remain Artist-session protected.");

console.log("Council Knowledge Intake bridge checks passed.");
