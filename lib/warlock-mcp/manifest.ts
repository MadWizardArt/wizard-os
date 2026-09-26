export type WarlockManifestAsset = {
  id: string;
  role: string;
  fileName: string;
  blobUrl: string;
  pathname: string;
  contentType: string;
  byteSize: number;
};

export type WarlockManifestVariant = {
  id: string;
  fulfillment: "DIGITAL" | "PHYSICAL";
  label: string;
  printfulProductId: number | null;
  printfulVariantId: number | null;
  printfulStoreId: number | null;
  etsyListingId: string | null;
  etsySku: string | null;
  etsyProductId: string | null;
  printfulSyncVariantId: number | null;
  retailPriceCents: number | null;
  productionBaseCents: number | null;
  productionQuotedAt: string | Date | null;
  currency: string;
};

export type WarlockManifestListingAsset = {
  id: string;
  kind: string;
  position: number;
  etsyRemoteId: string | null;
  etsySyncedAt: string | Date | null;
  asset: WarlockManifestAsset;
};

export type WarlockManifestListing = {
  id: string;
  fulfillment: "DIGITAL" | "PHYSICAL";
  title: string;
  description: string;
  tagsJson: string;
  taxonomyId: number | null;
  shippingProfileId: string | null;
  readinessStateId: string | null;
  quantity: number;
  whoMade: string;
  whenMade: string;
  isSupply: boolean;
  shouldAutoRenew: boolean;
  etsyListingId: string | null;
  printfulSyncProductId: number | null;
  lastDraftSyncAt: string | Date | null;
  status: string;
  assets: WarlockManifestListingAsset[];
};

export type WarlockProductManifest = {
  id: string;
  title: string;
  collection: string;
  description: string;
  artworkReference: string;
  status: string;
  notes: string;
  assets: WarlockManifestAsset[];
  variants: WarlockManifestVariant[];
  listings: WarlockManifestListing[];
};

export type WarlockValidationIssue = {
  level: "error" | "warning";
  code: string;
  message: string;
};

export type WarlockValidation = {
  ready: boolean;
  errors: WarlockValidationIssue[];
  warnings: WarlockValidationIssue[];
  summary: {
    assetCount: number;
    mockupCount: number;
    customerFileCount: number;
    physicalVariantCount: number;
    digitalVariantCount: number;
  };
};

const issue = (
  level: WarlockValidationIssue["level"],
  code: string,
  message: string,
): WarlockValidationIssue => ({ level, code, message });

export function validateWarlockManifest(manifest: WarlockProductManifest): WarlockValidation {
  const errors: WarlockValidationIssue[] = [];
  const warnings: WarlockValidationIssue[] = [];

  const assetsByRole = (role: string) => manifest.assets.filter((asset) => asset.role === role);
  const physical = manifest.variants.filter((variant) => variant.fulfillment === "PHYSICAL");
  const digital = manifest.variants.filter((variant) => variant.fulfillment === "DIGITAL");
  const masters = assetsByRole("master");
  const heroes = assetsByRole("hero");
  const mockups = assetsByRole("mockup");
  const customerFiles = assetsByRole("customer_file");

  if (!manifest.title.trim()) errors.push(issue("error", "title_missing", "The canonical product title is missing."));
  if (masters.length === 0) errors.push(issue("error", "master_missing", "No master production asset is attached."));
  if (heroes.length === 0) errors.push(issue("error", "hero_missing", "No Etsy hero image is attached."));
  if (mockups.length === 0) warnings.push(issue("warning", "mockups_missing", "No listing mockups are attached."));

  if (physical.length > 0) {
    for (const variant of physical) {
      if (!variant.printfulProductId || !variant.printfulVariantId || !variant.printfulStoreId) {
        errors.push(issue(
          "error",
          "printful_mapping_incomplete",
          `Physical variant "${variant.label}" is missing its Printful product, variant, or store mapping.`,
        ));
      }
      if (!variant.retailPriceCents || variant.retailPriceCents <= 0) {
        errors.push(issue("error", "physical_price_missing", `Physical variant "${variant.label}" has no retail price.`));
      }
    }

    const listingIds = [...new Set(physical.map((variant) => variant.etsyListingId).filter(Boolean))];
    if (listingIds.length > 1) {
      warnings.push(issue(
        "warning",
        "physical_listing_split",
        "Physical variants currently point to more than one Etsy listing; Spellmark normally keeps one product line in one listing.",
      ));
    }
  }

  if (digital.length > 0) {
    if (customerFiles.length === 0) {
      errors.push(issue("error", "customer_files_missing", "Digital fulfillment exists but no customer download file is attached."));
    }
    for (const variant of digital) {
      if (!variant.retailPriceCents || variant.retailPriceCents <= 0) {
        errors.push(issue("error", "digital_price_missing", `Digital variant "${variant.label}" has no retail price.`));
      }
    }
  }

  if (manifest.variants.length === 0) {
    errors.push(issue("error", "variants_missing", "The product has no physical or digital fulfillment variants."));
  }

  if (manifest.status !== "READY") {
    warnings.push(issue("warning", "status_not_ready", `Canonical product status is ${manifest.status}, not READY.`));
  }

  return {
    ready: errors.length === 0,
    errors,
    warnings,
    summary: {
      assetCount: manifest.assets.length,
      mockupCount: mockups.length,
      customerFileCount: customerFiles.length,
      physicalVariantCount: physical.length,
      digitalVariantCount: digital.length,
    },
  };
}

export function buildWarlockDryRun(manifest: WarlockProductManifest) {
  const validation = validateWarlockManifest(manifest);
  const physical = manifest.variants.filter((variant) => variant.fulfillment === "PHYSICAL");
  const digital = manifest.variants.filter((variant) => variant.fulfillment === "DIGITAL");
  const blocked = !validation.ready;

  const steps: Array<{
    order: number;
    system: "Warlock" | "Printful" | "Etsy";
    action: string;
    mode: "READ" | "PLANNED_WRITE";
    blocked: boolean;
  }> = [];

  const add = (system: "Warlock" | "Printful" | "Etsy", action: string, mode: "READ" | "PLANNED_WRITE") => {
    steps.push({ order: steps.length + 1, system, action, mode, blocked: mode === "PLANNED_WRITE" && blocked });
  };

  add("Warlock", "Validate the canonical product manifest and attached assets.", "READ");

  if (physical.length > 0) {
    add("Printful", "Verify the selected Spellmark store and mapped catalog variants.", "READ");
    add("Printful", "Create or update the physical sync product from the approved master artwork.", "PLANNED_WRITE");
    add("Printful", "Generate product mockups for the mapped physical variants.", "PLANNED_WRITE");
    add("Etsy", "Create or update one physical draft listing and its edition inventory.", "PLANNED_WRITE");
    add("Etsy", "Upload approved hero and listing mockups to the physical draft.", "PLANNED_WRITE");
  }

  if (digital.length > 0) {
    add("Etsy", "Create or update the digital-version draft listing.", "PLANNED_WRITE");
    add("Etsy", "Upload approved listing imagery and customer download files.", "PLANNED_WRITE");
  }

  add("Warlock", "Persist external IDs and return final production status to WizardOS.", "PLANNED_WRITE");

  return {
    mode: "DRY_RUN" as const,
    productId: manifest.id,
    title: manifest.title,
    readyToExecute: validation.ready,
    validation,
    steps,
  };
}
