import { createHash } from "node:crypto";

export type Json = Record<string, unknown>;
export function record(value: unknown): Json {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("printful_invalid_response");
  return value as Json;
}
export function rows(value: unknown): Json[] {
  if (!Array.isArray(value)) throw new Error("printful_invalid_response");
  return value.map(record);
}
export async function printfulGet(path: string, storeId?: number): Promise<Json> {
  if (!/^\/(?:products|stores|v2\/catalog-variants)(?:[/?]|$)/.test(path)) throw new Error("printful_path_rejected");
  const token = process.env.PRINTFUL_PRIVATE_TOKEN?.trim();
  if (!token) throw new Error("printful_token_missing");
  const headers: Record<string, string> = { Authorization: "Bearer " + token, "X-PF-Language": "en_US" };
  if (storeId) headers["X-PF-Store-Id"] = String(storeId);
  let response: Response;
  try { response = await fetch("https://api.printful.com" + path, { headers, cache: "no-store", redirect: "error", signal: AbortSignal.timeout(12000) }); }
  catch { throw new Error("printful_unavailable"); }
  if (!response.ok) throw new Error("printful_http_" + response.status);
  let payload: unknown;
  try { payload = await response.json(); } catch { throw new Error("printful_invalid_response"); }
  return record(payload);
}
export type Get = typeof printfulGet;
const cache = new Map<string, { until: number; verifiedAt: string; products: Json[] }>();
export async function searchPrintfulCatalog(input: { storeId?: number; query: string; offset?: number; limit?: number }, get: Get = printfulGet) {
  if (!input.storeId) {
    const stores = rows((await get("/stores")).result).map(store => ({storeId:store.id,name:store.name,type:store.type}));
    return { source:"Printful API",verifiedAt:new Date().toISOString(),stores,
      nextAction:"Select the intended Printful storeId, then repeat the catalog search. Never guess between Etsy and other connected stores." };
  }
  const offset = input.offset ?? 0, limit = input.limit ?? 20;
  const key = createHash("sha256").update((process.env.PRINTFUL_PRIVATE_TOKEN ?? "") + ":" + input.storeId).digest("hex");
  let snapshot = get === printfulGet ? cache.get(key) : undefined;
  if (!snapshot || snapshot.until <= Date.now()) {
    const [catalog, stores] = await Promise.all([get("/products", input.storeId), get("/stores")]);
    if (!rows(stores.result).some(store => store.id === input.storeId)) throw new Error("printful_store_not_accessible");
    snapshot = { until: Date.now() + 300000, verifiedAt: new Date().toISOString(), products: rows(catalog.result) };
    if (get === printfulGet) { if (cache.size >= 12) cache.clear(); cache.set(key, snapshot); }
  }
  const terms = input.query.toLowerCase().split(/\s+/).filter(Boolean);
  const matches = snapshot.products.filter(p => p.is_discontinued !== true && terms.every(term => [p.title,p.brand,p.model,p.type_name].join(" ").toLowerCase().includes(term)));
  return { source: "Printful Catalog API", verifiedAt: snapshot.verifiedAt, cacheSeconds: 300, total: matches.length,
    nextOffset: offset + limit < matches.length ? offset + limit : null,
    products: matches.slice(offset, offset + limit).map(p => ({ productId:p.id, title:p.title, brand:p.brand, model:p.model, type:p.type_name, image:p.image, variantCount:p.variant_count })),
    nextAction: "Resolve a chosen product's exact variants; catalog discovery is not a production quote." };
}
export async function resolvePrintfulCatalog(input: { storeId: number; productId: number; colors?: string[]; sizes?: string[] }, get: Get = printfulGet) {
  const [detail, stores] = await Promise.all([get("/products/" + input.productId, input.storeId), get("/stores")]);
  if (!rows(stores.result).some(s => s.id === input.storeId)) throw new Error("printful_store_not_accessible");
  const result = record(detail.result), product = record(result.product), variants = rows(result.variants);
  if (product.id !== input.productId || product.is_discontinued === true) throw new Error("printful_product_unavailable");
  const includes = (values: string[] | undefined, value: unknown) => !values?.length || values.some(v => v.toLowerCase() === String(value).toLowerCase());
  const matched = variants.filter(v => includes(input.colors,v.color) && includes(input.sizes,v.size));
  return { source:"Printful Catalog API", verifiedAt:new Date().toISOString(), storeAccessible:true,
    product:{ productId:product.id, title:product.title, brand:product.brand, model:product.model, techniques:product.techniques, files:product.files, options:product.options },
    availableColors:[...new Set(variants.map(v=>v.color))], availableSizes:[...new Set(variants.map(v=>v.size))],
    variants:matched.map(v=>({ catalogVariantId:v.id, productId:v.product_id, name:v.name, color:v.color, size:v.size, image:v.image })),
    nextAction:"Select an exact catalogVariantId and use configure_printful_variant to fetch and save a live USD quote. Default single-print configuration only; extra placements/options are not configured automatically." };
}
export function cents(value: unknown): number {
  if (typeof value !== "string" || !/^\d+(?:\.\d{1,2})?$/.test(value)) throw new Error("printful_price_invalid");
  const [whole, fraction = ""] = value.split(".");
  const amount = Number(whole) * 100 + Number(fraction.padEnd(2,"0"));
  if (!Number.isSafeInteger(amount) || amount < 0 || amount > 2147483647) throw new Error("printful_price_invalid");
  return amount;
}
export type PrintfulQuote = {
  catalogProductId:number; catalogVariantId:number; storeId:number; technique:string;
  fileType:string; placement:string; sellingRegion:"north_america"; currency:"USD";
  productionBaseCents:number; quotedAt:string; source:"Printful Catalog API v2";
  availability:"in_stock" | "unavailable" | "unknown";
  exclusions:string[];
};
export async function quotePrintfulVariant(input: { storeId:number; productId:number; catalogVariantId:number }, get: Get = printfulGet): Promise<PrintfulQuote> {
  const id = input.catalogVariantId;
  const [detail, prices, stock, stores] = await Promise.all([
    get("/products/variant/"+id,input.storeId),
    get("/v2/catalog-variants/"+id+"/prices?currency=USD&selling_region_name=north_america",input.storeId),
    get("/v2/catalog-variants/"+id+"/availability?selling_region_name=north_america",input.storeId), get("/stores"),
  ]);
  if (!rows(stores.result).some(s=>s.id===input.storeId)) throw new Error("printful_store_not_accessible");
  const legacy=record(detail.result), variant=record(legacy.variant), product=record(legacy.product);
  if(variant.id!==id || variant.product_id!==input.productId || product.id!==input.productId) throw new Error("printful_catalog_identity_mismatch");
  if(product.is_discontinued===true) throw new Error("printful_product_unavailable");
  const data=record(prices.data), pricedVariant=record(data.variant), pricedProduct=record(data.product);
  if(data.currency!=="USD" || pricedVariant.id!==id || pricedProduct.id!==input.productId) throw new Error("printful_quote_identity_or_currency_mismatch");
  const defaults=rows(product.techniques).filter(t=>t.is_default===true);
  if(defaults.length!==1) throw new Error("printful_default_technique_ambiguous");
  const technique=String(defaults[0].key).toLowerCase();
  if (technique.includes("embroidery")) throw new Error("printful_embroidery_setup_not_supported");
  // The existing sync executor sends one default print file and no extra options.
  const file=rows(product.files).find(f=>f.id==="default");
  if(!file || (file.additional_price!==null && cents(file.additional_price)!==0)) throw new Error("printful_default_placement_surcharge_unsupported");
  const priceTechniques=rows(pricedVariant.techniques).filter(t=>String(t.technique_key).toLowerCase()===technique);
  if(priceTechniques.length!==1) throw new Error("printful_technique_quote_missing");
  const placements=rows(pricedProduct.placements).filter(p=>String(p.technique_key).toLowerCase()===technique && (p.id===file.type || p.id===file.id));
  if(placements.length!==1) throw new Error("printful_default_placement_quote_missing_or_ambiguous");
  const placement=placements[0];
  const layers=rows(placement.layers);
  if(layers.length!==1 || layers[0].type!=="file" || cents(layers[0].additional_price)!==0) throw new Error("printful_extra_layer_cost_unsupported");
  const productionBaseCents=cents(priceTechniques[0].discounted_price ?? priceTechniques[0].price);
  if(productionBaseCents<=0) throw new Error("printful_price_invalid");
  const statuses=rows(record(stock.data).techniques).filter(t=>String(t.technique).toLowerCase()===technique)
    .flatMap(t=>rows(t.selling_regions)).filter(r=>["north_america","usa","canada"].includes(String(r.name)))
    .map(r=>String(r.availability).toLowerCase());
  const availability=statuses.includes("in stock") ? "in_stock" : statuses.length ? "unavailable" : "unknown";
  return { catalogProductId:input.productId, catalogVariantId:id, storeId:input.storeId, technique,
    fileType:String(file.type), placement:String(placement.id), sellingRegion:"north_america", currency:"USD",
    productionBaseCents, quotedAt:new Date().toISOString(), source:"Printful Catalog API v2", availability,
    exclusions:["Shipping","Taxes","Additional placements and options","Embroidery digitization","Order-specific fees"] };
}

export function safePrintfulError(error:unknown) {
  const message=error instanceof Error ? error.message : "";
  return /^(?:printful_[a-z0-9_]+|physical_variant_not_owned_by_product|executed_variant_mapping_locked)$/.test(message) ? message : "printful_request_failed";
}
