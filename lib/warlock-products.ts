export const PRODUCT_STATUSES = ["DESIGN", "PRODUCTION", "PRICING", "LISTING", "READY"] as const;
export type ProductStatus = (typeof PRODUCT_STATUSES)[number];
export type ProductInput = { title: string; collection: string; description: string; artworkReference: string; notes: string; status: ProductStatus };
export type VariantInput = { fulfillment: "DIGITAL" | "PHYSICAL"; label: string; printfulProductId: number | null; printfulVariantId: number | null; printfulStoreId: number | null };

function record(raw: unknown): Record<string, unknown> | null {
  return raw !== null && typeof raw === "object" && !Array.isArray(raw) ? raw as Record<string, unknown> : null;
}
function field(raw: unknown, limit: number): string | null {
  return typeof raw === "string" && raw.trim().length <= limit ? raw.trim() : null;
}
function id(raw: unknown): number | null {
  if (raw === null || raw === undefined || raw === "") return null;
  const n = Number(raw);
  return Number.isSafeInteger(n) && n > 0 && n <= 2147483647 ? n : null;
}
export function readProduct(raw: unknown): ProductInput | null {
  const v = record(raw);
  if (!v) return null;
  const title = field(v.title, 140);
  const collection = field(v.collection ?? "", 100);
  const description = field(v.description ?? "", 6000);
  const artworkReference = field(v.artworkReference ?? "", 500);
  const notes = field(v.notes ?? "", 4000);
  const status = v.status ?? "DESIGN";
  if (!title || collection === null || description === null || artworkReference === null || notes === null ||
      typeof status !== "string" || !PRODUCT_STATUSES.includes(status as ProductStatus)) return null;
  return { title, collection, description, artworkReference, notes, status: status as ProductStatus };
}
export function readVariant(raw: unknown): VariantInput | null {
  const v = record(raw);
  if (!v) return null;
  const label = field(v.label, 140);
  if (!label || (v.fulfillment !== "DIGITAL" && v.fulfillment !== "PHYSICAL")) return null;
  const printfulProductId = id(v.printfulProductId);
  const printfulVariantId = id(v.printfulVariantId);
  const printfulStoreId = id(v.printfulStoreId);
  if (v.fulfillment === "DIGITAL" && (v.printfulProductId != null || v.printfulVariantId != null || v.printfulStoreId != null)) return null;
  if (v.fulfillment === "PHYSICAL" && ((v.printfulProductId != null) !== (v.printfulVariantId != null))) return null;
  if (v.fulfillment === "PHYSICAL" && printfulProductId !== null && printfulStoreId === null) return null;
  if (v.fulfillment === "PHYSICAL" && printfulProductId === null && printfulStoreId !== null) return null;
  if (v.printfulStoreId !== undefined && v.printfulStoreId !== null && printfulStoreId === null) return null;
  if ((v.printfulProductId !== undefined && v.printfulProductId !== null && printfulProductId === null) ||
      (v.printfulVariantId !== undefined && v.printfulVariantId !== null && printfulVariantId === null)) return null;
  return { fulfillment: v.fulfillment, label, printfulProductId, printfulVariantId, printfulStoreId };
}
export function sameOrigin(request: { headers: { get(name: string): string | null }; nextUrl: URL }) {
  const origin = request.headers.get("origin");
  if (!origin) return true;
  try { return new URL(origin).host === request.nextUrl.host; } catch { return false; }
}
