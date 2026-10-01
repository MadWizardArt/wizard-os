import * as z from "zod/v4";
const cents=z.number().int().positive().max(2147483647);
export const livePriceInspectionShape={productId:z.string().trim().min(1).max(100)};
export const livePriceUpdateShape={...livePriceInspectionShape,
 expectedInventoryFingerprint:z.string().regex(/^[a-f0-9]{64}$/),
 prices:z.array(z.object({variantId:z.string().trim().min(1).max(100),expectedEtsyPriceCents:cents,expectedPrintfulRetailPriceCents:z.number().int().min(0).max(2147483647).nullable(),retailPriceCents:cents}).strict()).min(1).max(6),
 confirmLivePriceWrite:z.literal(true),
};
export const livePriceUpdateSchema=z.object(livePriceUpdateShape).strict();
