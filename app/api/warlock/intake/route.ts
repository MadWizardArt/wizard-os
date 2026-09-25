import { NextRequest, NextResponse } from "next/server";
import { prisma } from "../../../../lib/prisma";
import { isWarlockOperatorRequest } from "../../../../lib/warlock-auth";
import { readProduct, readVariant } from "../../../../lib/warlock-products";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ListingDraft = {
  title?: string;
  description?: string;
  price?: number;
  launchPrice?: number;
  tags?: string[];
  categorySearch?: string;
  listingType?: "download" | "physical";
  taxonomyId?: number;
  shippingProfileId?: number;
  readinessStateId?: number;
};

type AssetRef = {
  name?: string;
  role?: "hero" | "mockup" | "customer_file" | "master" | "other";
  url?: string;
};

type IntakePayload = {
  source?: string;
  product?: unknown;
  variants?: unknown[];
  listing?: ListingDraft;
  assets?: AssetRef[];
};

const cleanString = (value: unknown, limit: number) =>
  typeof value === "string" ? value.trim().slice(0, limit) : "";

function cleanListing(raw: ListingDraft | undefined) {
  if (!raw) return null;
  const tags = Array.isArray(raw.tags)
    ? raw.tags.map((tag) => String(tag).trim()).filter(Boolean).slice(0, 13)
    : [];
  const price = Number(raw.price);
  const launchPrice = Number(raw.launchPrice);
  return {
    title: cleanString(raw.title, 140),
    description: cleanString(raw.description, 12000),
    price: Number.isFinite(price) ? price : null,
    launchPrice: Number.isFinite(launchPrice) ? launchPrice : null,
    tags,
    categorySearch: cleanString(raw.categorySearch, 200),
    listingType: raw.listingType === "physical" ? "physical" : "download",
    taxonomyId: Number.isSafeInteger(Number(raw.taxonomyId)) ? Number(raw.taxonomyId) : null,
    shippingProfileId: Number.isSafeInteger(Number(raw.shippingProfileId)) ? Number(raw.shippingProfileId) : null,
    readinessStateId: Number.isSafeInteger(Number(raw.readinessStateId)) ? Number(raw.readinessStateId) : null,
  };
}

function cleanAssets(raw: AssetRef[] | undefined) {
  if (!Array.isArray(raw)) return [];
  return raw.slice(0, 40).map((asset) => ({
    name: cleanString(asset?.name, 240),
    role: ["hero", "mockup", "customer_file", "master", "other"].includes(String(asset?.role))
      ? asset?.role
      : "other",
    url: cleanString(asset?.url, 1000),
  })).filter((asset) => asset.name || asset.url);
}

export async function POST(request: NextRequest) {
  if (!isWarlockOperatorRequest(request)) {
    return NextResponse.json({ error: "warlock_operator_required" }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as IntakePayload | null;
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "invalid_intake_payload" }, { status: 400 });
  }

  const product = readProduct(body.product);
  if (!product) {
    return NextResponse.json({ error: "invalid_product" }, { status: 400 });
  }

  const variants = Array.isArray(body.variants)
    ? body.variants.map(readVariant)
    : [];
  if (variants.some((variant) => !variant)) {
    return NextResponse.json({ error: "invalid_variant" }, { status: 400 });
  }

  const listing = cleanListing(body.listing);
  const assets = cleanAssets(body.assets);
  const source = cleanString(body.source, 80) || "Aurelia / ChatGPT";

  const handoff = {
    source,
    receivedAt: new Date().toISOString(),
    listing,
    assets,
  };
  const handoffJson = JSON.stringify(handoff);
  if (handoffJson.length > 3500) {
    return NextResponse.json({ error: "handoff_metadata_too_large" }, { status: 400 });
  }

  try {
    const created = await prisma.$transaction(async (tx) => {
      const savedProduct = await tx.spellmarkProduct.create({
        data: {
          ...product,
          notes: [product.notes, "WARLOCK_INTAKE:", handoffJson].filter(Boolean).join("\n"),
        },
      });

      const savedVariants = [];
      for (const variant of variants) {
        if (!variant) continue;
        savedVariants.push(await tx.spellmarkVariant.create({
          data: { ...variant, productId: savedProduct.id },
        }));
      }

      return { product: savedProduct, variants: savedVariants };
    });

    return NextResponse.json({
      ok: true,
      intake: "accepted",
      productId: created.product.id,
      title: created.product.title,
      status: created.product.status,
      variantCount: created.variants.length,
      assetCount: assets.length,
      hasListingDraft: Boolean(listing),
      nextAction: "Review in Warlock; no Etsy listing has been created.",
    }, { status: 201 });
  } catch (error) {
    console.error("Warlock intake failed", error);
    return NextResponse.json({ error: "warlock_intake_failed" }, { status: 503 });
  }
}
