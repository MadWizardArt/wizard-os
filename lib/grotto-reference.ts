import { createHmac, timingSafeEqual } from "node:crypto";

function secret() {
  const value = process.env.MUSE_ARTIST_SESSION_SECRET?.trim() || process.env.MUSE_ARTIST_ACCESS_KEY?.trim();
  if (!value || value.length < 16) throw new Error("Artist access is not configured.");
  return value;
}
function signature(id: string, expires: string) {
  return createHmac("sha256", secret()).update(`grotto-reference:${id}:${expires}`).digest("hex");
}
export function referenceUrl(id: string) {
  const host = process.env.VERCEL_PROJECT_PRODUCTION_URL || process.env.VERCEL_URL;
  if (!host) throw new Error("Image remix requires a deployed Atelier.");
  const expires = String(Date.now() + 30 * 60 * 1000);
  return `https://${host}/api/grotto/reference/${encodeURIComponent(id)}?expires=${expires}&signature=${signature(id, expires)}`;
}
export function verifyReference(id: string, expires: string, supplied: string) {
  if (!/^\d+$/.test(expires) || Number(expires) <= Date.now() || !/^[a-f0-9]{64}$/.test(supplied)) return false;
  try { return timingSafeEqual(Buffer.from(supplied), Buffer.from(signature(id, expires))); }
  catch { return false; }
}
