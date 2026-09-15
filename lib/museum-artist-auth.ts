import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import type { NextRequest, NextResponse } from "next/server";

export const ARTIST_SESSION_COOKIE = "wizard_artist_session";
const SESSION_HOURS = 12;

function accessKey() {
  return process.env.MUSE_ARTIST_ACCESS_KEY?.trim() || "";
}

function sessionSecret() {
  return process.env.MUSE_ARTIST_SESSION_SECRET?.trim() || accessKey();
}

function digest(value: string) {
  return createHmac("sha256", sessionSecret()).update(value).digest("hex");
}

function safeEqual(a: string, b: string) {
  const aa = Buffer.from(a);
  const bb = Buffer.from(b);
  return aa.length === bb.length && timingSafeEqual(aa, bb);
}

export function artistAccessConfigured() {
  return accessKey().length >= 16 && sessionSecret().length >= 16;
}

export function verifyArtistAccessKey(candidate: unknown) {
  const configured = accessKey();
  if (!artistAccessConfigured() || typeof candidate !== "string") return false;
  const supplied = candidate.trim();
  if (!supplied) return false;
  return safeEqual(createHmac("sha256", configured).update(supplied).digest("hex"), createHmac("sha256", configured).update(configured).digest("hex"));
}

export function createArtistSessionToken() {
  if (!artistAccessConfigured()) throw new Error("Artist access is not configured.");
  const expiresAt = Date.now() + SESSION_HOURS * 60 * 60 * 1000;
  const nonce = randomBytes(18).toString("hex");
  const body = `${expiresAt}.${nonce}`;
  return { token: `${body}.${digest(body)}`, expiresAt };
}

export function verifyArtistSession(request: NextRequest) {
  if (!artistAccessConfigured()) return false;
  const token = request.cookies.get(ARTIST_SESSION_COOKIE)?.value || "";
  const [expiresRaw, nonce, signature, extra] = token.split(".");
  if (!expiresRaw || !nonce || !signature || extra) return false;
  const expiresAt = Number(expiresRaw);
  if (!Number.isFinite(expiresAt) || expiresAt <= Date.now()) return false;
  const body = `${expiresRaw}.${nonce}`;
  return safeEqual(signature, digest(body));
}

export function setArtistSessionCookie(response: NextResponse, token: string, expiresAt: number) {
  response.cookies.set(ARTIST_SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    expires: new Date(expiresAt),
  });
}

export function clearArtistSessionCookie(response: NextResponse) {
  response.cookies.set(ARTIST_SESSION_COOKIE, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    expires: new Date(0),
  });
}

export function intelligenceFuelEnabled() {
  return process.env.MUSE_INTELLIGENCE_ENABLED === "true" && artistAccessConfigured();
}

export function intelligenceBudget() {
  const maxRuns = Math.min(Math.max(Number(process.env.MUSE_INTELLIGENCE_MAX_RUNS_PER_DAY) || 3, 1), 12);
  const dailyTokens = Math.min(Math.max(Number(process.env.MUSE_INTELLIGENCE_DAILY_TOKEN_BUDGET) || 15000, 2000), 200000);
  const maxOutputTokens = Math.min(Math.max(Number(process.env.MUSE_INTELLIGENCE_MAX_OUTPUT_TOKENS) || 1000, 300), 2400);
  return { maxRuns, dailyTokens, maxOutputTokens };
}
