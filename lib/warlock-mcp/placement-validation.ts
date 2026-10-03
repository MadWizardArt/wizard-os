import * as z from "zod/v4";
import { placementShape } from "../warlock-commerce/printful-placements.ts";

/** Validate before the SDK so protocol-level INVALID_ARGUMENT cannot hide field diagnostics. */
export function placementValidationResponse(message: unknown) {
  if (!message || typeof message !== "object" || Array.isArray(message)) return null;
  const rpc = message as Record<string, unknown>;
  if (rpc.jsonrpc !== "2.0" || rpc.method !== "tools/call" || !(typeof rpc.id === "string" || typeof rpc.id === "number")) return null;
  const params = rpc.params as {name?:unknown;arguments?:unknown} | undefined;
  if (params?.name !== "preview_printful_placements") return null;
  const result = z.strictObject(placementShape).safeParse(params.arguments);
  if (result.success) return null;
  const fields = result.error.issues.slice(0,30).map(issue => ({
    field:issue.path.map(String).join(".") || "arguments",
    code:issue.code,
    // Use schema-authored messages only, never echo submitted values or URLs.
    message:issue.code === "unrecognized_keys" ? "Unexpected field. Use only the advertised tool fields."
      : issue.code === "invalid_value" ? "Use an advertised placement value or true for limit_to_print_area."
      : issue.code === "too_small" || issue.code === "too_big" ? "Value is outside the advertised range."
      : "Missing field or incorrect type. Dimensions and offsets must be integer pixels at 300 DPI.",
  }));
  const payload = {error:"printful_placement_arguments_invalid",fields,
    nextAction:"Use get_product for canonical product, variant and master asset IDs. Include every physical variant. Each file needs assetId, type and position {area_width, area_height, width, height, top, left}. Use sleeve_right or sleeve_left. Coordinates are pixels at 300 DPI; do not guess the catalog print area. Correct these fields and retry preview; no supplier changes occurred."};
  console.warn("Warlock placement validation failed", {code:payload.error,fields:fields.map(f=>({field:f.field,code:f.code}))});
  return {jsonrpc:"2.0",id:rpc.id,result:{isError:true,content:[{type:"text",text:JSON.stringify(payload)}],structuredContent:payload}};
}
