import type { WarlockProductManifest } from "../warlock-mcp/manifest.ts";
import type { SupplierPreflight } from "./printful-preflight.ts";
export function withLivePrintfulQuotes(manifest:WarlockProductManifest,supplier:SupplierPreflight):WarlockProductManifest {
  if(!supplier.pass) throw new Error("supplier_preflight_failed");
  return { ...manifest, variants:manifest.variants.map(variant=>{
    if(variant.fulfillment!=="PHYSICAL")return variant;
    const quote=supplier.variants.find(check=>check.variantId===variant.id)?.quote;
    if(!quote || quote.catalogProductId!==variant.printfulProductId || quote.catalogVariantId!==variant.printfulVariantId || quote.storeId!==variant.printfulStoreId || quote.currency!=="USD" || quote.availability!=="in_stock") throw new Error("live_production_quote_missing_or_mismatched");
    const age=Date.now()-Date.parse(quote.quotedAt);
    if(!Number.isFinite(age) || age< -5000 || age>120000)throw new Error("live_production_quote_expired");
    return {...variant,productionBaseCents:quote.productionBaseCents,productionQuotedAt:quote.quotedAt,productionQuoteJson:JSON.stringify(quote),currency:quote.currency};
  }) };
}
