import { createHmac, randomBytes, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import type { NextRequest, NextResponse } from "next/server";
import { prisma } from "./prisma";

export const ARTIST_SESSION_COOKIE = "wizard_artist_session";
const SESSION_HOURS = 12;
const REMEMBERED_SESSION_DAYS = 30;
const ARTIST_CREDENTIAL_ID = "primary";
const MIN_PASSWORD_LENGTH = 12;
const scrypt = promisify(scryptCallback);

function accessKey() {
  return process.env.MUSE_ARTIST_ACCESS_KEY?.trim() || "";
}

function sessionSecret() {
  return process.env.MUSE_ARTIST_SESSION_SECRET?.trim() || accessKey();
}

function ingestKey() {
  return process.env.MUSE_KNOWLEDGE_INGEST_KEY?.trim() || "";
}

function digest(value: string) {
  return createHmac("sha256", sessionSecret()).update(value).digest("hex");
}

function safeEqual(a: string, b: string) {
  const aa = Buffer.from(a);
  const bb = Buffer.from(b);
  return aa.length === bb.length && timingSafeEqual(aa, bb);
}

function keyedFingerprint(key: string, value: string) {
  return createHmac("sha256", key).update(value).digest("hex");
}

export function artistAccessConfigured() {
  return accessKey().length >= 16 && sessionSecret().length >= 16;
}

export function knowledgeIngestConfigured() {
  return ingestKey().length >= 24;
}

export function verifyArtistAccessKey(candidate: unknown) {
  const configured = accessKey();
  if (!artistAccessConfigured() || typeof candidate !== "string") return false;
  const supplied = candidate.trim();
  if (!supplied) return false;
  return safeEqual(keyedFingerprint(configured, supplied), keyedFingerprint(configured, configured));
}

async function passwordDigest(password: string, salt: string) {
  return (await scrypt(password, salt, 64)) as Buffer;
}

export async function artistPasswordConfigured() {
  return Boolean(await prisma.artistCredential.findUnique({
    where: { id: ARTIST_CREDENTIAL_ID },
    select: { id: true },
  }));
}

export function validateArtistPassword(password: unknown) {
  if (typeof password !== "string") return "Choose a password.";
  if (password.length < MIN_PASSWORD_LENGTH) return `Use at least ${MIN_PASSWORD_LENGTH} characters.`;
  if (password.length > 128) return "Use no more than 128 characters.";
  return null;
}

export async function configureArtistPassword(password: string) {
  const validation = validateArtistPassword(password);
  if (validation) throw new Error(validation);
  const salt = randomBytes(24).toString("base64url");
  const hash = (await passwordDigest(password, salt)).toString("base64url");
  return prisma.artistCredential.create({
    data: { id: ARTIST_CREDENTIAL_ID, passwordSalt: salt, passwordHash: hash },
  });
}

export async function verifyArtistPassword(candidate: unknown) {
  if (typeof candidate !== "string" || !candidate) return false;
  const credential = await prisma.artistCredential.findUnique({
    where: { id: ARTIST_CREDENTIAL_ID },
  });
  if (!credential) return false;
  const supplied = await passwordDigest(candidate, credential.passwordSalt);
  const expected = Buffer.from(credential.passwordHash, "base64url");
  return supplied.length === expected.length && timingSafeEqual(supplied, expected);
}

export function verifyKnowledgeIngestKey(candidate: unknown) {
  const configured = ingestKey();
  if (!knowledgeIngestConfigured() || typeof candidate !== "string") return false;
  const supplied = candidate.trim();
  if (!supplied) return false;
  return safeEqual(keyedFingerprint(configured, supplied), keyedFingerprint(configured, configured));
}

export function createArtistSessionToken(remember = false) {
  if (!artistAccessConfigured()) throw new Error("Artist access is not configured.");
  const duration = remember
    ? REMEMBERED_SESSION_DAYS * 24 * 60 * 60 * 1000
    : SESSION_HOURS * 60 * 60 * 1000;
  const expiresAt = Date.now() + duration;
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
  const maxRuns = Math.min(Math.max(Number(process.env.MUSE_INTELLIGENCE_MAX_RUNS_PER_DAY) || 4, 1), 12);
  const dailyTokens = Math.min(Math.max(Number(process.env.MUSE_INTELLIGENCE_DAILY_TOKEN_BUDGET) || 15000, 2000), 200000);
  const maxOutputTokens = Math.min(Math.max(Number(process.env.MUSE_INTELLIGENCE_MAX_OUTPUT_TOKENS) || 1000, 300), 2400);
  return { maxRuns, dailyTokens, maxOutputTokens };
}
