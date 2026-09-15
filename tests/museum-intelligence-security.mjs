import assert from "node:assert/strict";

const base = process.env.WIZARD_TEST_BASE_URL || "http://127.0.0.1:3000";

async function request(path, init) {
  const response = await fetch(`${base}${path}`, init);
  let body = null;
  try { body = await response.json(); } catch {}
  return { response, body };
}

const session = await request("/api/museum/artist-session");
assert.equal(session.response.status, 200, "Artist session status must remain readable so the lock screen can render.");
assert.equal(session.body.configured, false, "CI must not have an Artist key configured.");
assert.equal(session.body.authenticated, false, "Anonymous CI request must not be authenticated.");
assert.equal(session.body.fuelEnabled, false, "AI fuel must remain disabled without Artist access configuration.");
assert.equal(Object.hasOwn(session.body, "accessKey"), false, "Session status must never expose an Artist key.");

for (const path of ["/api/museum/knowledge", "/api/museum/intelligence"]) {
  const result = await request(path);
  assert.equal(result.response.status, 401, `${path} must reject anonymous reads.`);
  assert.match(String(result.body?.error || ""), /Artist session required/i);
}

const knowledgeWrite = await request("/api/museum/knowledge", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ title: "Nope", content: "Nope", sourceRef: "test" }),
});
assert.equal(knowledgeWrite.response.status, 401, "Knowledge Vault writes must reject anonymous requests.");

const questWrite = await request("/api/museum/intelligence", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ museId: "novy", category: "system", question: "Nope", reason: "Nope", expectedValue: "Nope" }),
});
assert.equal(questWrite.response.status, 401, "Quest creation must reject anonymous requests.");

const questRun = await request("/api/museum/intelligence", {
  method: "PATCH",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ id: "not-a-real-quest", action: "run" }),
});
assert.equal(questRun.response.status, 401, "Quest fueling must reject anonymous requests before any model path can be reached.");

console.log("Selective Intelligence Artist Gate security checks passed.");
