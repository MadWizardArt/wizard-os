import { NextRequest, NextResponse } from "next/server";
import {
  artistAccessConfigured,
  clearArtistSessionCookie,
  createArtistSessionToken,
  intelligenceBudget,
  intelligenceFuelEnabled,
  setArtistSessionCookie,
  verifyArtistAccessKey,
  verifyArtistSession,
} from "../../../../lib/museum-artist-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function sameOrigin(request: NextRequest) {
  const origin = request.headers.get("origin");
  if (!origin) return true;
  try {
    return new URL(origin).host === request.nextUrl.host;
  } catch {
    return false;
  }
}

function state(request: NextRequest) {
  return {
    configured: artistAccessConfigured(),
    authenticated: verifyArtistSession(request),
    fuelEnabled: intelligenceFuelEnabled(),
    model: process.env.MUSE_INTELLIGENCE_MODEL || "openai/gpt-5.6-sol",
    budget: intelligenceBudget(),
  };
}

export async function GET(request: NextRequest) {
  return NextResponse.json(state(request));
}

export async function POST(request: NextRequest) {
  if (!sameOrigin(request)) return NextResponse.json({ error: "Cross-origin Artist login is not accepted." }, { status: 403 });
  if (!artistAccessConfigured()) {
    return NextResponse.json({ error: "Artist access is not configured on Wizard OS yet." }, { status: 503 });
  }

  const body = await request.json().catch(() => ({}));
  if (!verifyArtistAccessKey(body.accessKey)) {
    return NextResponse.json({ error: "Artist key was not accepted." }, { status: 401 });
  }

  const { token, expiresAt } = createArtistSessionToken();
  const response = NextResponse.json({ ...state(request), authenticated: true, expiresAt });
  setArtistSessionCookie(response, token, expiresAt);
  return response;
}

export async function DELETE(request: NextRequest) {
  if (!sameOrigin(request)) return NextResponse.json({ error: "Cross-origin Artist logout is not accepted." }, { status: 403 });
  const response = NextResponse.json({ authenticated: false });
  clearArtistSessionCookie(response);
  return response;
}
