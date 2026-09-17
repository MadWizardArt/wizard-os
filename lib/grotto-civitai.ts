const ORCHESTRATION_BASE_URL = "https://orchestration.civitai.com";
const DEFAULT_FLUX1_DIFFUSER_AIR = "urn:air:flux1:diffuser:civitai:618692@691639";

export type GrottoChoices = {
  mood: string;
  setting: string;
  pose: string;
  frame: string;
};

export type StudioFormat = "Portrait" | "Square" | "Landscape";

export type StudioGenerationInput = {
  prompt: string;
  negativePrompt: string;
  format: StudioFormat;
  quantity: 1 | 4;
  referenceId?: string;
  strength?: number;
};

type CivitaiImage = {
  id?: string;
  url: string;
};

export type WorkflowSnapshot = {
  id: string;
  status: string;
  cost?: { total?: number };
  transactions?: Array<{ amount?: number; quantity?: number }>;
  steps?: Array<{
    output?: {
      images?: Array<{ id?: string; url: string; available?: boolean }>;
      blobs?: Array<{ url?: string; type?: string; mimeType?: string }>;
    };
  }>;
  [key: string]: unknown;
};

function token() {
  return process.env.CIVITAI_ORCHESTRATION_TOKEN?.trim() || "";
}

function diffuserAir() {
  return process.env.CIVITAI_FLUX1_DIFFUSER_AIR?.trim() || DEFAULT_FLUX1_DIFFUSER_AIR;
}

function tessaLoraAir() {
  return process.env.CIVITAI_TESSA_LORA_AIR?.trim() || "";
}

function tessaTrigger() {
  return process.env.CIVITAI_TESSA_TRIGGER?.trim() || "TESSA_MUSE";
}

function tessaLoraStrength() {
  const value = Number(process.env.CIVITAI_TESSA_LORA_STRENGTH ?? 0.9);
  if (!Number.isFinite(value)) return 0.9;
  return Math.min(Math.max(value, 0), 2);
}

function studioCheckpointAir() {
  return process.env.CIVITAI_STUDIO_PONY_DIFFUSER_AIR?.trim() || "";
}

function isCivitaiCheckpointAir(value: string) {
  return /^urn:air:[^:]+:checkpoint:civitai:\d+@\d+$/.test(value);
}

function studioDefaultNegative() {
  return process.env.CIVITAI_STUDIO_DEFAULT_NEGATIVE?.trim()
    || "low quality, bad anatomy, extra fingers, extra limbs, text, watermark";
}

function studioSteps() {
  const value = Number(process.env.CIVITAI_STUDIO_DEFAULT_STEPS ?? 28);
  if (!Number.isFinite(value)) return 28;
  return Math.min(Math.max(Math.round(value), 1), 50);
}

function studioCfg() {
  const value = Number(process.env.CIVITAI_STUDIO_DEFAULT_CFG ?? 5);
  if (!Number.isFinite(value)) return 5;
  return Math.min(Math.max(value, 1), 30);
}

function studioMaxImages() {
  const value = Number(process.env.CIVITAI_STUDIO_MAX_IMAGES ?? 4);
  if (!Number.isFinite(value)) return 4;
  return Math.min(Math.max(Math.round(value), 1), 4);
}

export function grottoGenerationStatus() {
  const enabled = process.env.GROTTO_GENERATION_ENABLED === "true";
  const providerConfigured = token().length > 0;
  const museModelConfigured = tessaLoraAir().length > 0;
  return {
    enabled,
    provider: "civitai",
    providerConfigured,
    museModelConfigured,
    configured: enabled && providerConfigured && museModelConfigured,
  };
}

export function grottoStudioStatus() {
  const enabled = process.env.GROTTO_GENERATION_ENABLED === "true";
  const providerConfigured = token().length > 0;
  const checkpointConfigured = studioCheckpointAir().length > 0;
  return {
    enabled,
    provider: "civitai",
    providerConfigured,
    checkpointConfigured,
    configured: enabled && providerConfigured && checkpointConfigured,
    defaultNegative: studioDefaultNegative(),
    maxImages: studioMaxImages(),
  };
}

const MOODS: Record<string, string> = {
  Soft: "soft relaxed expression, tender quiet atmosphere",
  Playful: "warm playful expression, light affectionate energy",
  Mysterious: "quiet mysterious expression, intimate low light, restrained cinematic atmosphere",
  Serene: "serene self-possessed expression, calm graceful presence",
};

const SETTINGS: Record<string, string> = {
  Onsen: "a secluded Japanese mountain onsen, stone pool, rising steam, soft lantern light",
  Shrine: "a secluded Japanese mountain shrine, old timber, stone path, soft lantern light",
  Room: "a refined quiet Japanese room, natural wood, linen, low warm lamplight",
  Garden: "a private Japanese garden, stone path, moss, water and soft evening light",
};

const POSES: Record<string, string> = {
  Seated: "seated in a natural elegant pose",
  Standing: "standing in a relaxed elegant pose",
  Reclining: "reclining comfortably in a graceful natural pose",
  "Surprise me": "a natural graceful candid pose",
};

function dimensions(frame: string) {
  if (frame === "Wide") return { width: 1216, height: 832 };
  if (frame === "Close") return { width: 1024, height: 1024 };
  return { width: 896, height: 1152 };
}

function studioDimensions(format: StudioFormat) {
  if (format === "Landscape") return { width: 1216, height: 832 };
  if (format === "Square") return { width: 1024, height: 1024 };
  return { width: 832, height: 1216 };
}

function framePhrase(frame: string) {
  if (frame === "Wide") return "wide environmental composition";
  if (frame === "Close") return "close portrait composition";
  if (frame === "Full") return "full-body composition";
  return "portrait composition";
}

export function buildTessaPrompt(choices: GrottoChoices) {
  return [
    tessaTrigger(),
    "adult Japanese woman",
    "long dark hair fading naturally to luminous platinum white at the ends",
    "refined calm facial features",
    "elegant natural proportions",
    MOODS[choices.mood] ?? MOODS.Serene,
    SETTINGS[choices.setting] ?? SETTINGS.Onsen,
    POSES[choices.pose] ?? POSES.Seated,
    framePhrase(choices.frame),
    "photorealistic painterly cinematic image",
    "natural skin texture",
    "tasteful refined styling",
  ].join(", ");
}

export function buildTessaWorkflow(choices: GrottoChoices) {
  const { width, height } = dimensions(choices.frame);
  const prompt = buildTessaPrompt(choices);
  const lora = tessaLoraAir();

  return {
    prompt,
    body: {
      tags: ["wizard-os", "grotto", "tessa"],
      steps: [
        {
          $type: "imageGen",
          name: "tessa",
          timeout: "00:10:00",
          input: {
            engine: "sdcpp",
            ecosystem: "flux1",
            operation: "createImage",
            diffuserModel: diffuserAir(),
            prompt,
            negativePrompt: "identity drift, malformed anatomy, extra fingers, duplicate body, text, watermark",
            width,
            height,
            steps: 28,
            cfgScale: 3.5,
            quantity: 1,
            loras: lora ? { [lora]: tessaLoraStrength() } : {},
          },
        },
      ],
    },
  };
}

export function buildStudioWorkflow(input: StudioGenerationInput, sourceImage?: string) {
  const { width, height } = studioDimensions(input.format);
  const model = studioCheckpointAir();
  if (!isCivitaiCheckpointAir(model)) {
    throw new Error(
      "CIVITAI_STUDIO_PONY_DIFFUSER_AIR must be a Civitai checkpoint AIR, for example urn:air:sdxl:checkpoint:civitai:101055@128078.",
    );
  }

  return {
    prompt: input.prompt.trim(),
    body: {
      tags: ["wizard-os", "grotto", "studio", "pony"],
      steps: [
        {
          $type: "textToImage",
          name: "studio",
          timeout: "00:20:00",
          input: {
            model,
            ...(sourceImage ? { sourceImage, sourceImageDenoiseStrenght: input.strength ?? 0.35 } : {}),
            prompt: input.prompt.trim(),
            negativePrompt: input.negativePrompt.trim(),
            quantity: input.quantity,
            width,
            height,
            steps: studioSteps(),
            cfgScale: studioCfg(),
            scheduler: "EulerA",
            clipSkip: 2,
          },
        },
      ],
    },
  };
}

function describeCivitaiError(payload: unknown, status: number) {
  if (!payload || typeof payload !== "object") return `Civitai request failed (${status}).`;
  const record = payload as Record<string, unknown>;

  if (typeof record.message === "string" && record.message.trim()) {
    return `Civitai: ${record.message.trim()}`;
  }
  if (typeof record.detail === "string" && record.detail.trim()) {
    return `Civitai: ${record.detail.trim()}`;
  }

  const errors = record.errors;
  if (errors && typeof errors === "object") {
    const details = Object.entries(errors as Record<string, unknown>)
      .flatMap(([field, value]) => {
        const messages = Array.isArray(value) ? value : [value];
        return messages
          .filter((item): item is string => typeof item === "string" && item.trim().length > 0)
          .map((item) => `${field}: ${item.trim()}`);
      });
    if (details.length > 0) return `Civitai ${status}: ${details.slice(0, 3).join("; ")}`;
  }

  if (typeof record.title === "string" && record.title.trim()) {
    return `Civitai ${status}: ${record.title.trim()}`;
  }
  return `Civitai request failed (${status}).`;
}

async function callOrchestrator(path: string, init: RequestInit = {}) {
  const accessToken = token();
  if (!accessToken) throw new Error("Civitai is not configured.");

  const response = await fetch(`${ORCHESTRATION_BASE_URL}${path}`, {
    ...init,
    headers: {
      "content-type": "application/json",
      Authorization: `Bearer ${accessToken}`,
      ...(init.headers ?? {}),
    },
    cache: "no-store",
  });

  const text = await response.text();
  let payload: unknown = null;
  try {
    payload = text ? JSON.parse(text) : null;
  } catch {
    payload = text;
  }

  if (!response.ok) {
    throw new Error(describeCivitaiError(payload, response.status));
  }

  return payload as WorkflowSnapshot;
}

export function estimateTessaGeneration(choices: GrottoChoices) {
  const { body } = buildTessaWorkflow(choices);
  return callOrchestrator("/v2/consumer/workflows?whatif=true", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function submitTessaGeneration(choices: GrottoChoices) {
  const { body } = buildTessaWorkflow(choices);
  return callOrchestrator("/v2/consumer/workflows", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function estimateStudioGeneration(input: StudioGenerationInput, sourceImage?: string) {
  const { body } = buildStudioWorkflow(input, sourceImage);
  return callOrchestrator("/v2/consumer/workflows?whatif=true", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function submitStudioGeneration(input: StudioGenerationInput, sourceImage?: string) {
  const { body } = buildStudioWorkflow(input, sourceImage);
  return callOrchestrator("/v2/consumer/workflows", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function getGeneration(workflowId: string, waitSeconds = 0) {
  const wait = Math.min(Math.max(Math.floor(waitSeconds), 0), 30);
  const suffix = wait ? `?wait=${wait}` : "";
  return callOrchestrator(`/v2/consumer/workflows/${encodeURIComponent(workflowId)}${suffix}`, {
    method: "GET",
  });
}

export function getTessaGeneration(workflowId: string, waitSeconds = 0) {
  return getGeneration(workflowId, waitSeconds);
}

export function isTerminalWorkflow(status: string) {
  return ["succeeded", "failed", "expired", "canceled", "cancelled"].includes(status.toLowerCase());
}

export function extractWorkflowImages(snapshot: WorkflowSnapshot): CivitaiImage[] {
  const images: CivitaiImage[] = [];

  snapshot.steps?.forEach((step) => {
    step.output?.images?.forEach((image) => {
      if (image.url && image.available !== false) images.push({ id: image.id, url: image.url });
    });
    step.output?.blobs?.forEach((blob) => {
      if (blob.url && (!blob.mimeType || blob.mimeType.startsWith("image/"))) images.push({ url: blob.url });
    });
  });

  return images;
}
