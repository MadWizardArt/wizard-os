import { etsyHeaders } from "../etsy-client";

/** Reconciliation has a GET-only Etsy transport, with no mutation argument. */
export async function readEtsyForReconciliation(accessToken: string, path: string): Promise<Record<string, unknown>> {
  if (!/^\/shops\/[1-9]\d*\/listings\?state=draft&limit=1$/.test(path) && !/^\/listings\/[1-9]\d*(\/inventory\?legacy=false|\/images)?$/.test(path) && !/^\/shops\/[1-9]\d*\/listings\/[1-9]\d*\/files$/.test(path)) throw new Error("etsy_reconciliation_path_invalid");
  const response = await fetch("https://api.etsy.com/v3/application" + path, {
    method: "GET", headers: etsyHeaders(accessToken), cache: "no-store",
    redirect: "error", signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) throw new Error("etsy_http_" + response.status);
  const payload: unknown = await response.json().catch(() => null);
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) throw new Error("etsy_invalid_response");
  return payload as Record<string, unknown>;
}
