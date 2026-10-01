import { NextRequest, NextResponse } from "next/server";
import {
  artistAccessConfigured,
  artistPasswordConfigured,
  clearArtistSessionCookie,
  configureArtistPassword,
  createArtistSessionToken,
  intelligenceBudget,
  intelligenceFuelEnabled,
  knowledgeIngestConfigured,
  setArtistSessionCookie,
  validateArtistPassword,
  verifyArtistAccessKey,
  verifyArtistPassword,
  verifyArtistSession,
} from "../../../../lib/museum-artist-auth";
import { isSameOrigin } from "../../../../lib/request-security";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function state(request: NextRequest) {
  return {
    configured: artistAccessConfigured(),
    passwordConfigured: await artistPasswordConfigured(),
    authenticated: verifyArtistSession(request),
    fuelEnabled: intelligenceFuelEnabled(),
    knowledgeIntakeConfigured: knowledgeIngestConfigured(),
    model: process.env.MUSE_INTELLIGENCE_MODEL || "openai/gpt-5.6-sol",
    budget: intelligenceBudget(),
  };
}

export async function GET(request: NextRequest) {
  return NextResponse.json(await state(request));
}

export async function POST(request: NextRequest) {
  if (!isSameOrigin(request)) return NextResponse.json({ error: "Cross-origin Artist login is not accepted." }, { status: 403 });
  if (!artistAccessConfigured()) {
    return NextResponse.json({ error: "Artist access is not configured on Wizard OS yet." }, { status: 503 });
  }

  const body = await request.json().catch(() => ({}));
  const passwordConfigured = await artistPasswordConfigured();

  if (body.setupPassword === true) {
    if (passwordConfigured) {
      return NextResponse.json({ error: "The Artist password is already configured." }, { status: 409 });
    }
    if (!verifyArtistAccessKey(body.accessKey)) {
      return NextResponse.json({ error: "The current Artist key was not accepted." }, { status: 401 });
    }
    const validation = validateArtistPassword(body.password);
    if (validation) return NextResponse.json({ error: validation }, { status: 400 });
    await configureArtistPassword(body.password);
  } else {
    const passwordAccepted = passwordConfigured && await verifyArtistPassword(body.password);
    const recoveryKeyAccepted = verifyArtistAccessKey(body.accessKey);
    if (!passwordAccepted && !recoveryKeyAccepted) {
      return NextResponse.json({ error: passwordConfigured ? "Artist password was not accepted." : "Set up your Artist password first." }, { status: 401 });
    }
  }

  const { token, expiresAt } = createArtistSessionToken(body.remember === true);
  const response = NextResponse.json({ ...await state(request), authenticated: true, expiresAt });
  setArtistSessionCookie(response, token, expiresAt);
  return response;
}

export async function DELETE(request: NextRequest) {
  if (!isSameOrigin(request)) return NextResponse.json({ error: "Cross-origin Artist logout is not accepted." }, { status: 403 });
  const response = NextResponse.json({ authenticated: false });
  clearArtistSessionCookie(response);
  return response;
}
