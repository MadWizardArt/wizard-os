export const GROTTO_MODEL_ENVIRONMENTS = {
  "pony-v6": {
    id: "pony-v6",
    label: "Pony Diffusion V6 XL",
    air: "urn:air:sdxl:checkpoint:civitai:257749@290640",
    defaultAir: "urn:air:sdxl:checkpoint:civitai:257749@290640",
    envKey: "CIVITAI_STUDIO_PONY_V6_AIR",
    family: "pony-sdxl",
    default: true,
  },
  "pony-realism": {
    id: "pony-realism",
    label: "Pony Realism",
    air: "urn:air:sdxl:checkpoint:civitai:372465@914390",
    defaultAir: "urn:air:sdxl:checkpoint:civitai:372465@914390",
    envKey: "CIVITAI_STUDIO_PONY_REALISM_AIR",
    family: "pony-sdxl",
    default: false,
  },
} as const;

export type GrottoModelEnvironmentId = keyof typeof GROTTO_MODEL_ENVIRONMENTS;
export type GrottoLoraCompatibility = GrottoModelEnvironmentId | "both";

export const DEFAULT_GROTTO_MODEL_ENVIRONMENT: GrottoModelEnvironmentId = "pony-v6";

export function isGrottoModelEnvironmentId(value: unknown): value is GrottoModelEnvironmentId {
  return typeof value === "string" && value in GROTTO_MODEL_ENVIRONMENTS;
}

export function grottoModelEnvironment(id: GrottoModelEnvironmentId) {
  return GROTTO_MODEL_ENVIRONMENTS[id];
}

export function grottoModelEnvironmentAir(id: GrottoModelEnvironmentId) {
  const environment = grottoModelEnvironment(id);
  const configured = process.env[environment.envKey]?.trim();
  if (configured) return configured;
  if (id === "pony-v6") {
    const legacy = process.env.CIVITAI_STUDIO_PONY_DIFFUSER_AIR?.trim();
    if (legacy) return legacy;
  }
  return environment.defaultAir;
}

export function grottoModelEnvironmentList() {
  return Object.values(GROTTO_MODEL_ENVIRONMENTS).map(({ id, label, family }) => ({ id, label, family }));
}

export function loraSupportsEnvironment(compatibility: GrottoLoraCompatibility, environmentId: GrottoModelEnvironmentId) {
  return compatibility === "both" || compatibility === environmentId;
}
