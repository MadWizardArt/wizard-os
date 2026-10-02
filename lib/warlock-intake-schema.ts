import * as z from "zod/v4";
const money = z.number().int().min(0).max(2147483647);
const profile = z.union([z.string().regex(/^[1-9]\d{0,18}$/), z.number().int().positive().max(Number.MAX_SAFE_INTEGER)]);
const listing = z.object({
  fulfillment: z.enum(["DIGITAL", "PHYSICAL"]).optional(),
  title: z.string().trim().min(1).max(140).optional(),
  description: z.string().trim().max(11800).optional(),
  price: z.number().positive().max(21474836).optional(),
  launchPrice: z.number().positive().max(21474836).optional(),
  tags: z.array(z.string().trim().min(1).max(20)).max(13).optional(),
  categorySearch: z.string().trim().max(200).optional(),
  digitalDelivery: z.enum(["INSTANT_DOWNLOAD", "MADE_TO_ORDER"]).optional().describe("MADE_TO_ORDER for personalized digital work delivered after purchase; no instant-download file is required or uploaded."),
  listingType: z.enum(["download", "physical"]).optional(),
  taxonomyId: z.number().int().positive().max(2147483647).optional(),
  shippingProfileId: profile.optional(), readinessStateId: profile.optional(),
});
// ChatGPT file objects declare all four supported properties; only URL and ID are required.
export const chatGptFileSchema = z.object({
  download_url: z.string().url().max(8000),
  file_id: z.string().trim().min(1).max(200),
  mime_type: z.string().max(100).optional(),
  file_name: z.string().max(240).optional(),
}).strict();
export const intakeProductShape = {
  files: z.array(chatGptFileSchema).max(40).optional(),
  productId: z.string().trim().min(1).max(100).optional(),
  source: z.string().trim().min(1).max(80).optional(),
  product: z.object({
    title: z.string().trim().min(1).max(140), collection: z.string().trim().max(100).optional(),
    description: z.string().trim().max(6000).optional(), artworkReference: z.string().trim().max(500).optional(),
    notes: z.string().trim().max(4000).optional(), status: z.enum(["DESIGN", "PRODUCTION", "PRICING", "LISTING", "READY"]).optional(),
  }),
  variants: z.array(z.object({
    variantId: z.string().min(1).max(100).optional(), fulfillment: z.enum(["DIGITAL", "PHYSICAL"]),
    label: z.string().trim().min(1).max(140),
    printfulProductId: z.number().int().positive().max(2147483647).nullable().optional(),
    printfulVariantId: z.number().int().positive().max(2147483647).nullable().optional(),
    printfulStoreId: z.number().int().positive().max(2147483647).nullable().optional(),
    retailPriceCents: money.optional(), productionBaseCents: money.optional(),
    productionQuotedAt: z.iso.datetime().optional(), currency: z.literal("USD").optional(),
  })).max(50).optional(),
  listing: listing.optional(), listings: z.array(listing).max(2).optional(),
  assets: z.array(z.object({
    name: z.string().trim().min(1).max(240).optional(),
    role: z.enum(["hero", "mockup", "customer_file", "master", "other"]),
    assetId: z.string().min(1).max(100).optional().describe("Existing canonical Warlock asset ID; never a ChatGPT file ID."),
    fileId: z.string().min(1).max(200).optional().describe("ChatGPT file_id matching an entry in the top-level files parameter."), url: z.string().url().max(4000).optional(),
    base64: z.string().max(4 * 1024 * 1024).optional(), contentType: z.string().max(100).optional(),
    fulfillment: z.enum(["DIGITAL", "PHYSICAL"]).optional(), position: z.number().int().min(1).max(20).optional(),
  }).refine(a => [a.assetId, a.fileId, a.url, a.base64].filter(x => x !== undefined).length === 1, "Provide exactly one of assetId, fileId, url, or base64.")).max(40).optional(),
  confirmIntake: z.literal(true),
};
export const intakeProductSchema = z.object(intakeProductShape).refine(v => !(v.listing && v.listings), "Use listing or listings, not both.");
export type IntakeInput = z.infer<typeof intakeProductSchema>;
