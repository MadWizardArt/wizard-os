-- Warlock MCP v8: standards-compatible OAuth 2.1 bridge for ChatGPT.
CREATE TABLE "WarlockOAuthCode" (
  "codeHash" TEXT NOT NULL,
  "clientId" TEXT NOT NULL,
  "redirectUri" TEXT NOT NULL,
  "resource" TEXT NOT NULL,
  "scope" TEXT NOT NULL,
  "codeChallenge" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "consumedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "WarlockOAuthCode_pkey" PRIMARY KEY ("codeHash")
);

CREATE INDEX "WarlockOAuthCode_expiresAt_idx"
  ON "WarlockOAuthCode"("expiresAt");

CREATE TABLE "WarlockOAuthGrant" (
  "id" TEXT NOT NULL,
  "clientId" TEXT NOT NULL,
  "resource" TEXT NOT NULL,
  "scope" TEXT NOT NULL,
  "accessTokenHash" TEXT NOT NULL,
  "refreshTokenHash" TEXT NOT NULL,
  "accessExpiresAt" TIMESTAMP(3) NOT NULL,
  "refreshExpiresAt" TIMESTAMP(3) NOT NULL,
  "operatorKeyFingerprint" TEXT NOT NULL,
  "revokedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "WarlockOAuthGrant_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "WarlockOAuthGrant_accessTokenHash_key"
  ON "WarlockOAuthGrant"("accessTokenHash");
CREATE UNIQUE INDEX "WarlockOAuthGrant_refreshTokenHash_key"
  ON "WarlockOAuthGrant"("refreshTokenHash");
CREATE INDEX "WarlockOAuthGrant_accessExpiresAt_idx"
  ON "WarlockOAuthGrant"("accessExpiresAt");
CREATE INDEX "WarlockOAuthGrant_refreshExpiresAt_idx"
  ON "WarlockOAuthGrant"("refreshExpiresAt");
CREATE INDEX "WarlockOAuthGrant_revokedAt_idx"
  ON "WarlockOAuthGrant"("revokedAt");
