import type { WarlockProductManifest } from "../warlock-mcp/manifest.ts";
import { validateWarlockManifest } from "../warlock-mcp/manifest.ts";
import { evaluateCommerceGates } from "./gates.ts";
import { selectPhysicalExecutionStrategy } from "./strategy.ts";
import { commerceWriteMode } from "./write-guard.ts";

export function buildCommerceExecutionPlan(manifest: WarlockProductManifest) {
  const packageValidation = validateWarlockManifest(manifest);
  const gates = evaluateCommerceGates(manifest);
  const physicalStrategy = selectPhysicalExecutionStrategy(manifest);
  const hasPhysical = manifest.variants.some((variant) => variant.fulfillment === "PHYSICAL");
  const hasDigital = manifest.variants.some((variant) => variant.fulfillment === "DIGITAL");

  const steps: Array<{
    order: number;
    system: "Warlock" | "Etsy" | "Printful";
    action: string;
    externalMutation: boolean;
    enabled: boolean;
  }> = [];

  const writeEnabled = commerceWriteMode() === "draft";
  const add = (
    system: "Warlock" | "Etsy" | "Printful",
    action: string,
    externalMutation = false,
  ) => {
    steps.push({
      order: steps.length + 1,
      system,
      action,
      externalMutation,
      enabled: !externalMutation || writeEnabled,
    });
  };

  add("Warlock", "Validate canonical product package.");
  add("Warlock", "Evaluate compliance and contribution-margin gates.");

  if (hasPhysical) {
    add("Printful", "Run live store, catalog-variant, and availability preflight.");
    add("Etsy", "Create or update the physical Etsy draft and its variant inventory.", true);
    add("Printful", "Wait for the Etsy draft product to appear in the connected Printful ecommerce sync feed.");
    add("Printful", "Map each imported Etsy variant to its approved Printful catalog variant and temporary signed master file.", true);
    add("Printful", "Create mockup-generation tasks for the approved physical catalog products.", true);
    add("Warlock", "Persist generated mockups into controlled storage before Printful temporary URLs expire.");
    add("Etsy", "Upload approved Spellmark hero images and physical mockups to the Etsy draft.", true);
  }

  if (hasDigital) {
    add("Etsy", "Create or update the separate digital-version Etsy draft.", true);
    add("Etsy", "Upload approved digital listing imagery and customer download files.", true);
  }

  add("Warlock", "Persist Etsy/Printful identifiers and return a final review report.");
  add("Warlock", "Stop at human review. Publishing is outside automated execution.");

  return {
    mode: "PREPARE_EXECUTION" as const,
    productId: manifest.id,
    title: manifest.title,
    writeMode: commerceWriteMode(),
    publishAutomation: false,
    packageValidation,
    gates,
    physicalStrategy,
    readyForDraftExecution: packageValidation.ready && gates.pass,
    steps,
  };
}
