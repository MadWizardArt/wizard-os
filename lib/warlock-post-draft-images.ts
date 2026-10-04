import type { PrismaClient } from "../app/generated/prisma/client";
import { attachmentIntake, attachProductFileSchema } from "./warlock-attachment.ts";
import { readIntakeBytes, materializeIntakeAsset, verifyIntakeAsset } from "./warlock-intake-assets.ts";
type Storage = {
    read: typeof readIntakeBytes;
    save: typeof materializeIntakeAsset;
    verify: typeof verifyIntakeAsset;
};
const storage: Storage = { read: readIntakeBytes, save: materializeIntakeAsset, verify: verifyIntakeAsset };
/** Stage presentation images only. Never reopen full intake after execution. */
export async function attachPostDraftImage(raw: unknown, db: PrismaClient, files: Storage = storage) {
    const input = attachProductFileSchema.parse(raw);
    if (!["hero", "mockup"].includes(input.role))
        throw Error("post_draft_attachment_image_only");
    if (!input.fulfillment)
        throw Error("post_draft_attachment_fulfillment_required");
    const product = await db.spellmarkProduct.findUnique({ where: { id: input.productId }, include: { listings: true } });
    if (!product)
        throw Error("product_not_found");
    const listing = product.listings.find(l => l.fulfillment === input.fulfillment);
    if (!listing?.etsyListingId)
        throw Error("post_draft_etsy_listing_missing");
    const normalized = attachmentIntake(input, product), source = normalized.assets![0], file = normalized.files![0];
    const assetInput = { ...source, fileId: undefined, url: file.download_url, name: source.name ?? file.file_name?.normalize("NFKD").replace(/[^A-Za-z0-9._-]/g, "_"), contentType: file.mime_type };
    const bytes = await files.read(assetInput);
    if (!["image/png", "image/jpeg", "image/webp"].includes(bytes.contentType))
        throw Error("post_draft_attachment_image_type_unsupported");
    return db.$transaction(async (tx) => {
        await tx.$queryRaw `SELECT pg_advisory_xact_lock(hashtext(${"post-draft-image:" + input.productId}))::text`;
        const current = await tx.spellmarkListing.findFirst({ where: { id: listing.id, productId: input.productId, etsyListingId: listing.etsyListingId } });
        if (!current)
            throw Error("post_draft_listing_changed");
        const pathname = `warlock/${input.productId}/intake/${input.role}/${bytes.digest}/${assetInput.name}`;
        let asset = await tx.spellmarkAsset.findFirst({ where: { productId: input.productId, pathname } });
        const reused = Boolean(asset);
        if (asset)
            await files.verify(asset);
        else {
            const stored = await files.save(input.productId, assetInput, bytes);
            asset = await tx.spellmarkAsset.create({ data: { ...stored, productId: input.productId } });
        }
        // Preserve existing image links until a separately confirmed Etsy update succeeds.
        const result = { productId: input.productId, assetId: asset.id, fulfillment: input.fulfillment, role: asset.role, fileName: asset.fileName,
            state: "IMAGE_STAGED", etsyMutated: false, reused, suggestedRank: input.position ?? null,
            nextAction: "Use inspect_etsy_listing_images, then update_etsy_listing_image with this assetId, the chosen rank, current image ID (or null for an empty slot), snapshot fingerprint, a new requestId and explicit confirmation. Do not rerun draft execution to upload photos." };
        await tx.spellmarkJournal.upsert({ where: { productId_requestId: { productId: input.productId, requestId: "post-draft-image:" + asset.id } }, update: {}, create: { productId: input.productId, requestId: "post-draft-image:" + asset.id, kind: "POST_DRAFT_IMAGE_ATTACHMENT", bodyJson: JSON.stringify(result) } });
        return result;
    }, { timeout: 60000, maxWait: 10000 });
}
