import {
  loraSupportsEnvironment,
  type GrottoLoraCompatibility,
  type GrottoModelEnvironmentId,
} from "./grotto-model-environments.ts";

export const MAX_GROTTO_LORAS = 2;

export type GrottoLoraCategory =
  | "character"
  | "style"
  | "quality"
  | "lighting"
  | "anatomy"
  | "experimental";

export type GrottoLoraSelection = {
  id: string;
  weight: number;
};

export type GrottoLoraDefinition = {
  id: string;
  label: string;
  air: string;
  compatibility: GrottoLoraCompatibility;
  category: GrottoLoraCategory;
  defaultWeight: number;
  minWeight: number;
  maxWeight: number;
  triggerWords?: readonly string[];
  enabled: boolean;
};

export type ResolvedGrottoLora = GrottoLoraDefinition & {
  weight: number;
};

/**
 * Curated Atelier LoRAs live here.
 *
 * Keep this registry intentionally small. Add a LoRA only after its Civitai AIR,
 * base-model compatibility, trigger words, and useful weight range have been
 * verified. The Atelier caps active LoRAs at MAX_GROTTO_LORAS.
 */
export const GROTTO_LORAS: readonly GrottoLoraDefinition[] = [];

export function isCivitaiLoraAir(value: string) {
  return /^urn:air:[^:]+:lora:civitai:\d+@\d+$/.test(value);
}

export function grottoLoraList() {
  return GROTTO_LORAS.map((lora) => ({
    id: lora.id,
    label: lora.label,
    compatibility: lora.compatibility,
    category: lora.category,
    defaultWeight: lora.defaultWeight,
    minWeight: lora.minWeight,
    maxWeight: lora.maxWeight,
    triggerWords: [...(lora.triggerWords ?? [])],
    configured: lora.enabled && isCivitaiLoraAir(lora.air),
  }));
}

export function resolveGrottoLoras(
  selections: readonly GrottoLoraSelection[] | undefined,
  environmentId: GrottoModelEnvironmentId,
): ResolvedGrottoLora[] {
  if (!selections?.length) return [];
  if (selections.length > MAX_GROTTO_LORAS) {
    throw new Error(`The Atelier supports at most ${MAX_GROTTO_LORAS} active LoRAs.`);
  }

  const seen = new Set<string>();
  return selections.map((selection) => {
    if (seen.has(selection.id)) throw new Error("A LoRA can only be selected once.");
    seen.add(selection.id);

    const definition = GROTTO_LORAS.find((lora) => lora.id === selection.id);
    if (!definition || !definition.enabled || !isCivitaiLoraAir(definition.air)) {
      throw new Error("One of the selected LoRAs is not installed.");
    }
    if (!loraSupportsEnvironment(definition.compatibility, environmentId)) {
      throw new Error(`${definition.label} is not compatible with the selected generator.`);
    }
    if (!Number.isFinite(selection.weight) || selection.weight < definition.minWeight || selection.weight > definition.maxWeight) {
      throw new Error(`${definition.label} weight must be between ${definition.minWeight} and ${definition.maxWeight}.`);
    }

    return { ...definition, weight: selection.weight };
  });
}

export function grottoAdditionalNetworks(loras: readonly ResolvedGrottoLora[]) {
  return Object.fromEntries(
    loras.map((lora) => [
      lora.air,
      {
        type: "Lora",
        strength: lora.weight,
      },
    ]),
  );
}

export function grottoLoraTriggerWords(loras: readonly ResolvedGrottoLora[]) {
  return [...new Set(loras.flatMap((lora) => [...(lora.triggerWords ?? [])]).map((word) => word.trim()).filter(Boolean))];
}
