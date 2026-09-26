export const LISTING_STATUSES = ["CONFIG", "READY", "DRAFT_CREATED", "WAITING_PRINTFUL", "SYNCED"] as const;
export type ListingStatus = (typeof LISTING_STATUSES)[number];

export type ListingManifestInput = {
  fulfillment: "DIGITAL" | "PHYSICAL";
  title: string;
  description: string;
  tags: string[];
  taxonomyId: number | null;
  shippingProfileId: string | null;
  readinessStateId: string | null;
  quantity: number;
  whoMade: "i_did" | "collective" | "someone_else";
  whenMade: string;
  isSupply: boolean;
  shouldAutoRenew: boolean;
  status: ListingStatus;
};

export type ListingAssetInput = {
  assetId: string;
  kind: "image" | "customer_file";
  position: number;
};

function record(raw: unknown): Record<string, unknown> | null {
  return raw !== null && typeof raw === "object" && !Array.isArray(raw)
    ? raw as Record<string, unknown>
    : null;
}

function textField(raw: unknown, limit: number) {
  return typeof raw === "string" && raw.trim().length <= limit ? raw.trim() : null;
}

function positiveId(raw: unknown) {
  if (raw === null || raw === undefined || raw === "") return null;
  const n = Number(raw);
  return Number.isSafeInteger(n) && n > 0 && n <= 2147483647 ? n : null;
}

function externalId(raw: unknown) {
  if (raw === null || raw === undefined || raw === "") return null;
  if (typeof raw === "number") {
    if (!Number.isSafeInteger(raw) || raw <= 0) return null;
    return String(raw);
  }
  if (typeof raw !== "string") return null;
  const value = raw.trim();
  return /^[1-9]\d{0,18}$/.test(value) ? value : null;
}

export function readListingManifest(raw: unknown): ListingManifestInput | null {
  const value = record(raw);
  if (!value) return null;

  const fulfillment = value.fulfillment;
  if (fulfillment !== "DIGITAL" && fulfillment !== "PHYSICAL") return null;

  const title = textField(value.title, 140);
  const description = textField(value.description ?? "", 12000);
  const whenMade = textField(value.whenMade ?? "2020_2026", 50);
  const whoMade = value.whoMade ?? "i_did";
  const status = value.status ?? "CONFIG";
  const quantity = Number(value.quantity ?? 999);

  if (
    !title ||
    description === null ||
    whenMade === null ||
    !["i_did", "collective", "someone_else"].includes(String(whoMade)) ||
    !LISTING_STATUSES.includes(status as ListingStatus) ||
    !Number.isSafeInteger(quantity) ||
    quantity < 1 ||
    quantity > 999
  ) return null;

  const tags = Array.isArray(value.tags)
    ? value.tags.map((tag) => String(tag).trim()).filter(Boolean)
    : [];
  if (tags.length > 13 || tags.some((tag) => tag.length > 20)) return null;

  const taxonomyId = positiveId(value.taxonomyId);
  const shippingProfileId = externalId(value.shippingProfileId);
  const readinessStateId = externalId(value.readinessStateId);
  if (value.taxonomyId != null && taxonomyId === null) return null;
  if (value.shippingProfileId != null && shippingProfileId === null) return null;
  if (value.readinessStateId != null && readinessStateId === null) return null;
  if (fulfillment === "DIGITAL" && (shippingProfileId !== null || readinessStateId !== null)) return null;

  return {
    fulfillment,
    title,
    description,
    tags,
    taxonomyId,
    shippingProfileId,
    readinessStateId,
    quantity,
    whoMade: whoMade as ListingManifestInput["whoMade"],
    whenMade,
    isSupply: value.isSupply === true,
    shouldAutoRenew: value.shouldAutoRenew !== false,
    status: status as ListingStatus,
  };
}

export function readListingAssets(raw: unknown): ListingAssetInput[] | null {
  if (raw === undefined) return [];
  if (!Array.isArray(raw) || raw.length > 20) return null;

  const parsed: ListingAssetInput[] = [];
  const seenAssets = new Set<string>();
  const seenPositions = new Set<string>();

  for (const candidate of raw) {
    const value = record(candidate);
    if (!value) return null;
    const assetId = textField(value.assetId, 100);
    const kind = value.kind;
    const position = Number(value.position);
    if (
      !assetId ||
      (kind !== "image" && kind !== "customer_file") ||
      !Number.isSafeInteger(position) ||
      position < 1 ||
      position > 20
    ) return null;
    if (seenAssets.has(assetId)) return null;
    const positionKey = String(kind) + ":" + position;
    if (seenPositions.has(positionKey)) return null;
    seenAssets.add(assetId);
    seenPositions.add(positionKey);
    parsed.push({ assetId, kind, position });
  }

  return parsed.sort((a, b) => a.kind.localeCompare(b.kind) || a.position - b.position);
}

export function fulfillmentEnum(value: ListingManifestInput["fulfillment"]) {
  return value === "PHYSICAL" ? "PHYSICAL" as const : "DIGITAL" as const;
}
