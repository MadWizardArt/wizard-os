import { createHash } from "node:crypto";
import * as z from "zod/v4";
import type { WarlockProductManifest, WarlockManifestListing, WarlockManifestAsset } from "../warlock-mcp/manifest.ts";
import { etsyListingType } from "./etsy-listing-type.ts";
const id = z.string().min(1).max(100);
export const imageInspectionShape = { productId: id, fulfillment: z.enum(["PHYSICAL", "DIGITAL"]) };
export const imageUpdateShape = { ...imageInspectionShape, assetId: id, rank: z.number().int().min(1).max(20),
    expectedImageId: z.string().regex(/^[1-9]\d*$/).nullable().describe("Current Etsy image ID at this rank from inspection; null only for the next empty slot."),
    expectedImagesFingerprint: z.string().regex(/^[a-f0-9]{64}$/), requestId: z.string().regex(/^[A-Za-z0-9_-]{8,100}$/).describe("Unique operation ID. Reuse exactly on retries; never blindly repeat an uncertain upload with a new ID."), confirmImageWrite: z.literal(true) };
export const imageUpdateSchema = z.strictObject(imageUpdateShape);
export type ImageUpdate = z.infer<typeof imageUpdateSchema>;
export type Json = Record<string, unknown>;
export type ImageRead = (path: string) => Promise<Json>;
export function imageFingerprint(value: unknown) { return createHash("sha256").update(JSON.stringify(value)).digest("hex"); }
function object(v: unknown): Json { if (!v || typeof v !== "object" || Array.isArray(v))
    throw Error("etsy_image_response_invalid"); return v as Json; }
function remoteId(v: unknown) { if (!["number", "string"].includes(typeof v) || !/^[1-9]\d*$/.test(String(v)) || !Number.isSafeInteger(Number(v)))
    throw Error("etsy_image_response_invalid"); return String(v); }
export function imageListing(manifest: WarlockProductManifest, fulfillment: string) {
    const matches = manifest.listings.filter(l => l.fulfillment === fulfillment);
    if (matches.length !== 1 || !matches[0].etsyListingId || !/^[1-9]\d*$/.test(matches[0].etsyListingId))
        throw Error("etsy_image_listing_missing");
    return matches[0];
}
export async function inspectListingImages(listing: WarlockManifestListing, shopId: number, read: ImageRead) {
    const remote = await read("/listings/" + listing.etsyListingId);
    if (remoteId(remote.listing_id) !== listing.etsyListingId || remoteId(remote.shop_id) !== String(shopId))
        throw Error("etsy_image_listing_ownership_mismatch");
    if (!["draft", "active"].includes(String(remote.state)))
        throw Error("etsy_image_listing_state_unsupported");
    if (etsyListingType(remote) !== (listing.fulfillment === "PHYSICAL" ? "physical" : "download"))
        throw Error("etsy_image_listing_type_mismatch");
    const response = await read("/listings/" + listing.etsyListingId + "/images");
    if (!Array.isArray(response.results) || response.count !== response.results.length || response.results.length > 20)
        throw Error("etsy_image_response_incomplete");
    const images = response.results.map(value => { const row = object(value); if (remoteId(row.listing_id) !== listing.etsyListingId || !Number.isInteger(row.rank) || Number(row.rank) < 1 || Number(row.rank) > 20)
        throw Error("etsy_image_response_invalid"); return { imageId: remoteId(row.listing_image_id), rank: Number(row.rank) }; }).sort((a, b) => a.rank - b.rank);
    if (new Set(images.map(i => i.imageId)).size !== images.length || images.some((i, n) => i.rank !== n + 1))
        throw Error("etsy_image_rank_ambiguous");
    const snapshot = { etsyListingId: listing.etsyListingId, shopId, state: String(remote.state), images };
    return { ...snapshot, imagesFingerprint: imageFingerprint(snapshot) };
}
export type ImageSnapshot = Awaited<ReturnType<typeof inspectListingImages>>;
export function imagePlan(manifest: WarlockProductManifest, input: ImageUpdate, snapshot: ImageSnapshot) {
    if (input.productId !== manifest.id)
        throw Error("etsy_image_product_mismatch");
    const listing = imageListing(manifest, input.fulfillment), asset = manifest.assets.find(a => a.id === input.assetId);
    if (snapshot.etsyListingId !== listing.etsyListingId || snapshot.imagesFingerprint !== input.expectedImagesFingerprint)
        throw Error("etsy_image_snapshot_changed");
    if (!asset)
        throw Error("etsy_image_asset_not_owned");
    if (!["hero", "mockup"].includes(asset.role) || !["image/png", "image/jpeg", "image/webp"].includes(asset.contentType))
        throw Error("etsy_image_presentation_asset_required");
    const current = snapshot.images.find(i => i.rank === input.rank);
    if ((current?.imageId ?? null) !== input.expectedImageId || (!current && input.rank !== snapshot.images.length + 1))
        throw Error("etsy_image_slot_changed");
    const elsewhere = listing.assets.find(link => link.asset.id === asset.id && (link.kind !== "image" || link.position !== input.rank));
    if (elsewhere)
        throw Error("etsy_image_asset_already_linked_elsewhere");
    const link = listing.assets.find(link => link.kind === "image" && link.position === input.rank);
    return { listing, asset, alreadyMatches: Boolean(current && link?.asset.id === asset.id && link.etsyRemoteId === current.imageId) };
}
export function verifyImageResult(before: ImageSnapshot, after: ImageSnapshot, rank: number, imageId: string) {
    const expected = [...before.images.filter(i => i.rank !== rank), { imageId, rank }].sort((a, b) => a.rank - b.rank);
    if (before.etsyListingId !== after.etsyListingId || before.shopId !== after.shopId || before.state !== after.state || JSON.stringify(expected) !== JSON.stringify(after.images))
        throw Error("etsy_image_readback_mismatch");
}
export function safeImageError(error: unknown) { const code = error instanceof Error ? error.message : ""; return /^(etsy_(image_[a-z_]+|http_\d{3}|listing_type_[a-z_]+)|warlock_commerce_writes_disabled|asset_[a-z_]+)$/.test(code) ? code : "etsy_image_update_failed"; }
export type ImageOperation = {
    input: ImageUpdate;
    before: ImageSnapshot;
    state: string;
    remoteImageId?: string;
    errorCode?: string;
    after?: ImageSnapshot;
    startedAt: string;
};
export type ImageDependencies = {
    read: ImageRead;
    upload: (asset: WarlockManifestAsset, rank: number, overwrite: boolean) => Promise<Json>;
    recordRemoteId: (id: string) => Promise<void>;
    save: (id: string, after: ImageSnapshot) => Promise<void>;
};
/** One image per call. No inventory, metadata, file-delivery or Printful transport exists here. */
export async function executeImageUpdate(manifest: WarlockProductManifest, input: ImageUpdate, shopId: number, before: ImageSnapshot, deps: ImageDependencies, knownRemoteId?: string) {
    const { listing, asset, alreadyMatches } = imagePlan(manifest, input, before);
    let remoteImageId = knownRemoteId;
    try {
        if (!remoteImageId) {
            const fresh = await inspectListingImages(listing, shopId, deps.read);
            if (fresh.imagesFingerprint !== before.imagesFingerprint)
                throw Error("etsy_image_snapshot_changed");
            if (alreadyMatches)
                return { state: "IMAGE_VERIFIED", remoteImageId: input.expectedImageId!, after: fresh, reused: true };
            const result = await deps.upload(asset, input.rank, input.expectedImageId !== null);
            remoteImageId = remoteId(result.listing_image_id);
            await deps.recordRemoteId(remoteImageId);
            if (remoteId(result.listing_id) !== listing.etsyListingId)
                throw Error("etsy_image_response_invalid");
        }
        const after = await inspectListingImages(listing, shopId, deps.read);
        verifyImageResult(before, after, input.rank, remoteImageId);
        await deps.save(remoteImageId, after);
        return { state: "IMAGE_VERIFIED", remoteImageId, after, reused: Boolean(knownRemoteId) };
    }
    catch (error) {
        return { state: "NEEDS_REVIEW", ...(remoteImageId ? { remoteImageId } : {}), errorCode: safeImageError(error), nextAction: "Inspect current Etsy images before another write. Retry this same requestId to verify a recorded remote image without uploading again. If the upload outcome is unknown, visually inspect the slot before authorizing a new request." };
    }
}
