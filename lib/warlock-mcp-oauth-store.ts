import { prisma } from "./prisma";
import {
  CHATGPT_CLIENT_ID,
  CHATGPT_REDIRECT_URI,
  WARLOCK_OAUTH_SCOPE,
  accessTokenExpiresAt,
  accessTokenExpiresInSeconds,
  authorizationCodeExpiresAt,
  operatorKeyFingerprint,
  pkceChallenge,
  randomAccessToken,
  randomAuthorizationCode,
  randomRefreshToken,
  refreshTokenExpiresAt,
  tokenHash,
  warlockMcpResource,
} from "./warlock-mcp-oauth";

type AuthorizationCodeInput = {
  clientId: string;
  redirectUri: string;
  resource: string;
  scope: string;
  codeChallenge: string;
};

type AuthorizationCodeExchange = {
  code: string;
  clientId: string;
  redirectUri: string;
  resource: string;
  codeVerifier: string;
};

type RefreshExchange = {
  refreshToken: string;
  clientId: string;
  resource?: string | null;
};

function tokenResponse(accessToken: string, refreshToken: string, scope: string) {
  return {
    access_token: accessToken,
    token_type: "Bearer",
    expires_in: accessTokenExpiresInSeconds(),
    refresh_token: refreshToken,
    scope,
  };
}

function currentFingerprintMatches(value: string) {
  return value === operatorKeyFingerprint();
}

export async function createWarlockAuthorizationCode(input: AuthorizationCodeInput) {
  const code = randomAuthorizationCode();
  const now = new Date();

  await prisma.warlockOAuthCode.deleteMany({
    where: {
      OR: [
        { expiresAt: { lte: now } },
        { consumedAt: { not: null } },
      ],
    },
  }).catch(() => undefined);

  await prisma.warlockOAuthCode.create({
    data: {
      codeHash: tokenHash(code),
      clientId: input.clientId,
      redirectUri: input.redirectUri,
      resource: input.resource,
      scope: input.scope,
      codeChallenge: input.codeChallenge,
      expiresAt: authorizationCodeExpiresAt(now),
    },
  });

  return code;
}

async function createGrant(clientId: string, resource: string, scope: string) {
  const accessToken = randomAccessToken();
  const refreshToken = randomRefreshToken();
  const now = new Date();

  await prisma.warlockOAuthGrant.create({
    data: {
      clientId,
      resource,
      scope,
      accessTokenHash: tokenHash(accessToken),
      refreshTokenHash: tokenHash(refreshToken),
      accessExpiresAt: accessTokenExpiresAt(now),
      refreshExpiresAt: refreshTokenExpiresAt(now),
      operatorKeyFingerprint: operatorKeyFingerprint(),
    },
  });

  return tokenResponse(accessToken, refreshToken, scope);
}

export async function exchangeWarlockAuthorizationCode(input: AuthorizationCodeExchange) {
  if (
    input.clientId !== CHATGPT_CLIENT_ID ||
    input.redirectUri !== CHATGPT_REDIRECT_URI ||
    input.resource !== warlockMcpResource()
  ) {
    throw new Error("invalid_grant");
  }

  const now = new Date();
  const codeHash = tokenHash(input.code);
  const record = await prisma.warlockOAuthCode.findUnique({ where: { codeHash } });
  if (
    !record ||
    record.consumedAt ||
    record.expiresAt <= now ||
    record.clientId !== input.clientId ||
    record.redirectUri !== input.redirectUri ||
    record.resource !== input.resource
  ) {
    throw new Error("invalid_grant");
  }

  let challenge: string;
  try {
    challenge = pkceChallenge(input.codeVerifier);
  } catch {
    throw new Error("invalid_grant");
  }
  if (challenge !== record.codeChallenge) throw new Error("invalid_grant");

  const consumed = await prisma.warlockOAuthCode.updateMany({
    where: {
      codeHash,
      consumedAt: null,
      expiresAt: { gt: now },
    },
    data: { consumedAt: now },
  });
  if (consumed.count !== 1) throw new Error("invalid_grant");

  return createGrant(record.clientId, record.resource, record.scope);
}

export async function refreshWarlockOAuthGrant(input: RefreshExchange) {
  if (input.clientId !== CHATGPT_CLIENT_ID) throw new Error("invalid_client");

  const now = new Date();
  const refreshHash = tokenHash(input.refreshToken);
  const grant = await prisma.warlockOAuthGrant.findUnique({
    where: { refreshTokenHash: refreshHash },
  });

  if (
    !grant ||
    grant.revokedAt ||
    grant.refreshExpiresAt <= now ||
    grant.clientId !== input.clientId ||
    !currentFingerprintMatches(grant.operatorKeyFingerprint) ||
    (input.resource && input.resource !== grant.resource)
  ) {
    throw new Error("invalid_grant");
  }

  const accessToken = randomAccessToken();
  const refreshToken = randomRefreshToken();
  const accessHash = tokenHash(accessToken);
  const nextRefreshHash = tokenHash(refreshToken);

  const rotated = await prisma.warlockOAuthGrant.updateMany({
    where: {
      id: grant.id,
      refreshTokenHash: refreshHash,
      revokedAt: null,
      refreshExpiresAt: { gt: now },
    },
    data: {
      accessTokenHash: accessHash,
      refreshTokenHash: nextRefreshHash,
      accessExpiresAt: accessTokenExpiresAt(now),
      refreshExpiresAt: refreshTokenExpiresAt(now),
      operatorKeyFingerprint: operatorKeyFingerprint(),
    },
  });
  if (rotated.count !== 1) throw new Error("invalid_grant");

  return tokenResponse(accessToken, refreshToken, grant.scope);
}

export async function isValidWarlockOAuthAccessToken(token: string) {
  if (!token.startsWith("waa_")) return false;
  const grant = await prisma.warlockOAuthGrant.findUnique({
    where: { accessTokenHash: tokenHash(token) },
  });
  if (!grant) return false;

  const now = new Date();
  if (
    grant.revokedAt ||
    grant.accessExpiresAt <= now ||
    grant.resource !== warlockMcpResource() ||
    !grant.scope.split(/\s+/).includes(WARLOCK_OAUTH_SCOPE) ||
    !currentFingerprintMatches(grant.operatorKeyFingerprint)
  ) {
    return false;
  }

  return true;
}
