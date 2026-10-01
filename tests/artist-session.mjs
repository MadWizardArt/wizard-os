import assert from "node:assert/strict";

function artistKey() {
  const value = process.env.MUSE_ARTIST_ACCESS_KEY;
  assert.ok(value, "MUSE_ARTIST_ACCESS_KEY is required for authenticated integration tests.");
  return value;
}

export async function createArtistSession(base) {
  const response = await fetch(`${base}/api/museum/artist-session`, {
    method: "POST",
    headers: { "content-type": "application/json", origin: base },
    body: JSON.stringify({ accessKey: artistKey() }),
  });
  assert.equal(response.status, 200, `Artist login failed: ${await response.text()}`);
  const setCookie = response.headers.get("set-cookie");
  assert.ok(setCookie, "Artist login must issue a session cookie.");
  return setCookie.split(";", 1)[0];
}

export function withArtist(base, cookie, init = {}) {
  const headers = new Headers(init.headers);
  headers.set("cookie", cookie);
  if (!new Set(["GET", "HEAD", "OPTIONS"]).has(init.method || "GET") && !headers.has("origin")) {
    headers.set("origin", base);
  }
  return { ...init, headers };
}

export async function unlockBrowser(page, base) {
  const response = await page.request.post(`${base}/api/museum/artist-session`, {
    headers: { origin: base },
    data: { accessKey: artistKey() },
  });
  assert.equal(response.status(), 200, `Browser Artist login failed: ${await response.text()}`);
}
