import { get } from "@vercel/blob";
import { prisma } from "../prisma";
import { etsyHeaders } from "../etsy-client";
import { getWarlockEtsyOperatorContext } from "../warlock-auth";
import { findWarlockProduct } from "../warlock-mcp/repository";
import { verifyIntakeAsset } from "../warlock-intake-assets";
import { assertCommerceDraftWritesEnabled } from "./write-guard";
import { readEtsyForReconciliation } from "./etsy-reconciliation-read";
import { executeImageUpdate, imageListing, imagePlan, imageFingerprint, imageUpdateSchema, inspectListingImages, safeImageError, type ImageOperation, type ImageUpdate } from "./listing-images";
async function context(input: {
    productId: string;
    fulfillment: string;
}) {
    const manifest = await findWarlockProduct({ productId: input.productId });
    if (!manifest)
        throw Error("etsy_image_product_missing");
    const { auth, shopId } = await getWarlockEtsyOperatorContext();
    const read = (path: string) => readEtsyForReconciliation(auth.session.access_token, path);
    return { manifest, shopId, read, token: auth.session.access_token, listing: imageListing(manifest, input.fulfillment) };
}
export async function inspectEtsyListingImages(input: {
    productId: string;
    fulfillment: string;
}) {
    const { manifest, shopId, read, listing } = await context(input);
    return { ...await inspectListingImages(listing, shopId, read), productId: manifest.id, fulfillment: listing.fulfillment,
        availableAssets: manifest.assets.filter(a => ["hero", "mockup"].includes(a.role)).map(a => ({ assetId: a.id, role: a.role, fileName: a.fileName })),
        canonicalImages: listing.assets.filter(a => a.kind === "image").map(a => ({ assetId: a.asset.id, rank: a.position, imageId: a.etsyRemoteId })),
        nextAction: "Review the selected image and exact rank with the owner before confirming update_etsy_listing_image. Refresh this inspection after each update." };
}
/** Durable intent precedes the only external write. Unknown outcomes are never replayed. */
export async function updateEtsyListingImage(raw: ImageUpdate) {
    const input = imageUpdateSchema.parse(raw);
    assertCommerceDraftWritesEnabled();
    const { manifest, shopId, read, token, listing } = await context(input);
    const key = { productId: input.productId, requestId: "etsy-image:" + input.requestId };
    const lockKey = { productId: input.productId, requestId: "etsy-image-lock:" + listing.id };
    const prior = await prisma.spellmarkJournal.findUnique({ where: { productId_requestId: key } });
    const previous = prior ? JSON.parse(prior.bodyJson) as ImageOperation : null;
    if (previous && imageFingerprint(previous.input) !== imageFingerprint(input))
        throw Error("etsy_image_request_conflict");
    if (previous && !previous.remoteImageId)
        return { state: "NEEDS_REVIEW", errorCode: "etsy_image_upload_outcome_unknown", nextAction: "Inspect Etsy before authorizing a new request. This request will not upload again." };
    const before = previous?.before ?? await inspectListingImages(listing, shopId, read);
    const { asset } = imagePlan(manifest, input, before);
    let operation: ImageOperation = previous ?? { input, before, state: "STARTED", startedAt: new Date().toISOString() };
    const lease = crypto.randomUUID();
    const expiresAt = Date.now() + 240000;
    await prisma.$transaction(async (tx) => {
        await tx.$queryRaw `SELECT pg_advisory_xact_lock(hashtext(${lockKey.requestId}))::text`;
        const lock = await tx.spellmarkJournal.findUnique({ where: { productId_requestId: lockKey } });
        if (lock && Number(JSON.parse(lock.bodyJson).expiresAt) > Date.now())
            throw Error("etsy_image_update_in_progress");
        const current = await tx.spellmarkJournal.findUnique({ where: { productId_requestId: key } });
        if (!previous && current)
            throw Error("etsy_image_request_already_started");
        const bodyJson = JSON.stringify({ lease, expiresAt });
        await tx.spellmarkJournal.upsert({ where: { productId_requestId: lockKey }, create: { ...lockKey, kind: "ETSY_IMAGE_LOCK", bodyJson }, update: { bodyJson } });
        if (!current)
            await tx.spellmarkJournal.create({ data: { ...key, kind: "ETSY_IMAGE_UPDATE", bodyJson: JSON.stringify(operation) } });
    });
    const persist = async () => { await prisma.spellmarkJournal.update({ where: { productId_requestId: key }, data: { bodyJson: JSON.stringify(operation) } }); };
    try {
        const result = await executeImageUpdate(manifest, input, shopId, before, {
            read,
            upload: async (_asset, rank, overwrite) => {
                await verifyIntakeAsset({ ...asset, productId: input.productId });
                if (asset.byteSize > 20 * 1024 * 1024)
                    throw Error("asset_too_large");
                const blob = await get(asset.blobUrl, { access: "private" });
                if (!blob || blob.statusCode !== 200)
                    throw Error("asset_unavailable");
                const reader = blob.stream.getReader();
                const chunks: Uint8Array[] = [];
                let size = 0;
                try {
                    while (true) {
                        const part = await reader.read();
                        if (part.done)
                            break;
                        size += part.value.length;
                        if (size > 20 * 1024 * 1024)
                            throw Error("asset_too_large");
                        chunks.push(part.value);
                    }
                }
                finally {
                    await reader.cancel();
                }
                if (size !== asset.byteSize)
                    throw Error("asset_size_mismatch");
                const form = new FormData();
                form.set("image", new Blob([Buffer.concat(chunks)], { type: asset.contentType }), asset.fileName);
                form.set("rank", String(rank));
                form.set("overwrite", String(overwrite));
                // Recheck after downloading bytes, immediately before mutation.
                if ((await inspectListingImages(listing, shopId, read)).imagesFingerprint !== before.imagesFingerprint)
                    throw Error("etsy_image_snapshot_changed");
                const lock = await prisma.spellmarkJournal.findUnique({ where: { productId_requestId: lockKey } });
                if (!lock || JSON.parse(lock.bodyJson).lease !== lease || Date.now() > expiresAt - 90000)
                    throw Error("etsy_image_lease_expired");
                const response = await fetch(`https://api.etsy.com/v3/application/shops/${shopId}/listings/${listing.etsyListingId}/images`, { method: "POST", headers: etsyHeaders(token), body: form, redirect: "error", signal: AbortSignal.timeout(30000) });
                if (!response.ok)
                    throw Error("etsy_http_" + response.status);
                return await response.json();
            },
            recordRemoteId: async (id) => { operation = { ...operation, remoteImageId: id, state: "UPLOADED" }; await persist(); },
            save: async (id, after) => {
                await prisma.$transaction(async (tx) => {
                    const current = await tx.spellmarkListing.findUnique({ where: { id: listing.id } });
                    if (current?.etsyListingId !== listing.etsyListingId)
                        throw Error("etsy_image_listing_changed");
                    await tx.spellmarkListingAsset.upsert({ where: { listingId_kind_position: { listingId: listing.id, kind: "image", position: input.rank } }, create: { listingId: listing.id, assetId: asset.id, kind: "image", position: input.rank, etsyRemoteId: id, etsySyncedAt: new Date() }, update: { assetId: asset.id, etsyRemoteId: id, etsySyncedAt: new Date() } });
                    operation = { ...operation, remoteImageId: id, state: "IMAGE_VERIFIED", after };
                    await tx.spellmarkJournal.update({ where: { productId_requestId: key }, data: { bodyJson: JSON.stringify(operation) } });
                });
            }
        }, previous?.remoteImageId);
        operation = { ...operation, ...result };
        await persist();
        return result;
    }
    catch (error) {
        operation = { ...operation, state: "NEEDS_REVIEW", errorCode: safeImageError(error) };
        await persist();
        return { state: operation.state, errorCode: operation.errorCode, remoteImageId: operation.remoteImageId };
    }
    finally {
        await prisma.$transaction(async (tx) => {
            await tx.$queryRaw `SELECT pg_advisory_xact_lock(hashtext(${lockKey.requestId}))::text`;
            const lock = await tx.spellmarkJournal.findUnique({ where: { productId_requestId: lockKey } });
            if (lock && JSON.parse(lock.bodyJson).lease === lease)
                await tx.spellmarkJournal.delete({ where: { productId_requestId: lockKey } });
        });
    }
}
