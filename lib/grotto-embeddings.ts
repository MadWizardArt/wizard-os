import {
  loraSupportsEnvironment,
  type GrottoLoraCompatibility,
  type GrottoModelEnvironmentId,
} from "./grotto-model-environments.ts";

export type GrottoEmbeddingDefinition = {
  id: string;
  label: string;
  air: string;
  compatibility: GrottoLoraCompatibility;
  triggerWord: string;
  enabled: boolean;
};

export const GROTTO_EMBEDDINGS: readonly GrottoEmbeddingDefinition[] = [
  {
    id: "pure-eros-face-xl",
    label: "Pure Eros Face XL",
    air: "urn:air:sdxl:embedding:civitai:1013445@1136137",
    compatibility: "both",
    triggerWord: "pureerosface_xl",
    enabled: true,
  },
];

export function isCivitaiEmbeddingAir(value: string) {
  return /^urn:air:[^:]+:embedding:civitai:\d+@\d+$/.test(value);
}

export function grottoEmbeddingList() {
  return GROTTO_EMBEDDINGS.map((embedding) => ({
    id: embedding.id,
    label: embedding.label,
    compatibility: embedding.compatibility,
    triggerWord: embedding.triggerWord,
    configured: embedding.enabled && isCivitaiEmbeddingAir(embedding.air),
  }));
}

export function resolveGrottoEmbeddings(ids: readonly string[] | undefined, environmentId: GrottoModelEnvironmentId) {
  if (!ids?.length) return [];
  const seen = new Set<string>();
  return ids.map((id) => {
    if (seen.has(id)) throw new Error("An embedding can only be selected once.");
    seen.add(id);
    const definition = GROTTO_EMBEDDINGS.find((embedding) => embedding.id === id);
    if (!definition?.enabled || !isCivitaiEmbeddingAir(definition.air)) throw new Error("One of the selected embeddings is not installed.");
    if (!loraSupportsEnvironment(definition.compatibility, environmentId)) throw new Error(`${definition.label} is not compatible with the selected generator.`);
    return definition;
  });
}

export function grottoEmbeddingNetworks(embeddings: readonly GrottoEmbeddingDefinition[]) {
  return Object.fromEntries(embeddings.map((embedding) => [embedding.air, { strength: 1 }]));
}
