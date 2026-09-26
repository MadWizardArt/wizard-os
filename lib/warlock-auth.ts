import { createHash, timingSafeEqual } from "node:crypto";
import { NextRequest } from "next/server";
import { prisma } from "./prisma";
import { decryptSession } from "./etsy";
import { EtsySession, etsyUserId, getOwnedEtsyShop, getValidEtsySession } from "./etsy-client";

// Warlock is a single-owner private application. A server-side encrypted grant
// is shared by the owner's browser and by explicitly authorized API clients.
const CONNECTION_ID = "primary";
export const WARLOCK_OPERATOR_HEADER = "x-warlock-api-key";

function keyMatches(supplied: string) {
  const expected = process.env.WARLOCK_API_KEY;
  if (!expected || expected.length < 32 || !supplied) return false;
  const actualHash = createHash("sha256").update(supplied).digest();
  const expectedHash = createHash("sha256").update(expected).digest();
  return timingSafeEqual(actualHash, expectedHash);
}

export function isWarlockOperatorRequest(request: Pick<NextRequest, "headers">) {
  return keyMatches(request.headers.get(WARLOCK_OPERATOR_HEADER) ?? "");
}

export async function saveEtsyConnection(encryptedSession: string) {
  // Prevent an unauthenticated visitor from binding a different Etsy shop
  // to the operator's persistent grant via the public OAuth connect URL.
  const allowedShopId = Number(process.env.WARLOCK_SHOP_ID);
  if (!Number.isSafeInteger(allowedShopId) || allowedShopId <= 0) {
    throw new Error("WARLOCK_SHOP_ID must be configured before storing the Etsy grant");
  }
  const session = decryptSession<EtsySession>(encryptedSession);
  const shop = await getOwnedEtsyShop(session.access_token);
  if (Number(shop?.shop_id) !== allowedShopId) {
    throw new Error("etsy_shop_not_allowed");
  }
  await prisma.etsyConnection.upsert({
    where: { id: CONNECTION_ID },
    create: { id: CONNECTION_ID, encryptedSession },
    update: { encryptedSession },
  });
}

/**
 * Authenticate an Etsy API request through exactly one of:
 * - the existing authenticated Warlock browser cookie, or
 * - the separate, rotatable WARLOCK_API_KEY (intended for a direct connector).
 * A supplied invalid operator key is never downgraded to cookie access.
 */
export async function getEtsyRequestContext(request: NextRequest) {
  const suppliedKey = request.headers.get(WARLOCK_OPERATOR_HEADER);
  const cookieValue = request.cookies.get("etsy_session")?.value;
  const isOperator = suppliedKey !== null;
  if (isOperator ? !keyMatches(suppliedKey ?? "") : !cookieValue) return null;

  // A browser cookie proves the owner's prior Etsy OAuth authorization. Always
  // decrypt it before accepting the browser request, even when using a newer
  // refreshed token from the database.
  const browserSession = !isOperator && cookieValue
    ? decryptSession<EtsySession>(cookieValue)
    : null;

  const saved = await prisma.etsyConnection.findUnique({ where: { id: CONNECTION_ID } });
  if (isOperator && !saved) return null; // OAuth has not been completed.

  const encryptedSession = saved?.encryptedSession ?? cookieValue;
  if (!encryptedSession) return null;
  const storedSession = decryptSession<EtsySession>(encryptedSession);
  if (browserSession && etsyUserId(browserSession.access_token) !== etsyUserId(storedSession.access_token)) {
    // Never give a different Etsy account the existing saved shop's grant.
    return null;
  }

  const auth = await getValidEtsySession(encryptedSession);
  if (process.env.WARLOCK_SHOP_ID) {
    if (auth.refreshedCookieValue) {
      await saveEtsyConnection(auth.refreshedCookieValue);
    } else if (!saved) {
      // Upgrade an existing valid browser session without a new OAuth login.
      await saveEtsyConnection(encryptedSession);
    }
  }
  // Without the one-time shop allowlist, preserve ordinary browser access
  // but do not create a persistent grant available to direct API clients.

  const shop = await getOwnedEtsyShop(auth.session.access_token);
  const shopId = Number(shop?.shop_id);
  if (!shopId) throw new Error("etsy_shop_id_missing");
  if (isOperator && shopId !== Number(process.env.WARLOCK_SHOP_ID)) return null;
  return { auth, shop, shopId };
}


/**
 * Load the owner's stored Etsy grant for an already-authenticated Warlock
 * operator/MCP execution path. This function does not authenticate the caller;
 * callers must be behind the Warlock operator boundary.
 */
export async function getWarlockEtsyOperatorContext() {
  const allowedShopId = Number(process.env.WARLOCK_SHOP_ID);
  if (!Number.isSafeInteger(allowedShopId) || allowedShopId <= 0) {
    throw new Error("warlock_shop_id_missing");
  }

  const saved = await prisma.etsyConnection.findUnique({ where: { id: CONNECTION_ID } });
  if (!saved) throw new Error("etsy_not_connected");

  const auth = await getValidEtsySession(saved.encryptedSession);
  if (auth.refreshedCookieValue) {
    await saveEtsyConnection(auth.refreshedCookieValue);
  }

  const shop = await getOwnedEtsyShop(auth.session.access_token);
  const shopId = Number(shop?.shop_id);
  if (!shopId || shopId !== allowedShopId) {
    throw new Error("etsy_shop_not_allowed");
  }

  return { auth, shop, shopId };
}
