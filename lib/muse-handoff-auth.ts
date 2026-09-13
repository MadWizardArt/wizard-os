import { createHmac, timingSafeEqual } from "crypto";
import { NextRequest, NextResponse } from "next/server";

const COOKIE_NAME = "muse_handoff_session";
const SESSION_MESSAGE = "wizard-os:muse-handoff:v1";
const MAX_AGE = 60 * 60 * 24 * 30;

function expectedSecret() {
  return process.env.MUSE_HANDOFF_SECRET || "";
}

function sessionToken(secret: string) {
  return createHmac("sha256", secret).update(SESSION_MESSAGE).digest("hex");
}

export function secretMatches(supplied: string) {
  const expected = expectedSecret();
  if (!expected || !supplied) return false;
  const a = Buffer.from(supplied);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function hasMuseHandoffSession(request: NextRequest) {
  const secret = expectedSecret();
  if (!secret) return false;
  const supplied = request.cookies.get(COOKIE_NAME)?.value || "";
  const expected = sessionToken(secret);
  const a = Buffer.from(supplied);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function setMuseHandoffSession(response: NextResponse) {
  const secret = expectedSecret();
  if (!secret) return response;
  response.cookies.set(COOKIE_NAME, sessionToken(secret), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    maxAge: MAX_AGE,
  });
  return response;
}

export function clearMuseHandoffSession(response: NextResponse) {
  response.cookies.set(COOKIE_NAME, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    maxAge: 0,
  });
  return response;
}
