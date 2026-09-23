-- Persist the shop owner's Etsy OAuth grant for Warlock's server-side API bridge.
-- Existing browser sessions migrate lazily on their next authenticated request;
-- reconnecting through /api/etsy/connect also populates this record.
CREATE TABLE "EtsyConnection" (
  "id" TEXT NOT NULL,
  "encryptedSession" TEXT NOT NULL,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "EtsyConnection_pkey" PRIMARY KEY ("id")
);
