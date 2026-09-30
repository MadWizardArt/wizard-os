import * as z from "zod/v4";
import { intakeProductSchema } from "./warlock-intake-schema.ts";

// Keep the native wire descriptor simple. The shared intake schema validates
// URLs, lengths, source permissions and bytes after ChatGPT resolves the file.
export const attachProductFileShape = {
  productId: z.string().min(1).max(100),
  file: z.object({
    download_url: z.string(), file_id: z.string(),
    mime_type: z.string().optional(), file_name: z.string().optional(),
  }).strict().describe("Native ChatGPT attachment. ChatGPT resolves the selected file ID into this object before invoking Warlock; never invent download URLs."),
  role: z.enum(["hero", "mockup", "customer_file", "master", "other"]),
  name: z.string().trim().min(1).max(240).optional(),
  fulfillment: z.enum(["DIGITAL", "PHYSICAL"]).optional(),
  position: z.number().int().min(1).max(20).optional(),
  confirmAttachment: z.literal(true),
};
export const attachProductFileSchema = z.object(attachProductFileShape);

export function attachmentIntake(raw: unknown, product: { id: string; title: string }) {
  const input = attachProductFileSchema.parse(raw);
  if (input.productId !== product.id) throw new Error("attachment_product_mismatch");
  return intakeProductSchema.parse({
    productId: product.id, product: { title: product.title }, confirmIntake: true,
    files: [input.file],
    assets: [{ fileId: input.file.file_id, role: input.role, name: input.name,
      fulfillment: input.fulfillment, position: input.position }],
  });
}
