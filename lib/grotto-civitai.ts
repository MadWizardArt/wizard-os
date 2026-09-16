const ORCHESTRATION_BASE_URL = "https://orchestration.civitai.com";
const DEFAULT_FLUX1_DIFFUSER_AIR = "urn:air:flux1:diffuser:civitai:618692@691639";

export type GrottoChoices = {
  mood: string;
  setting: string;
  pose: string;
  frame: string;
};

type CivitaiImage = {
  id?: string;
  url: string;
};

type WorkflowSnapshot = {
  id: string;
  status: string;
  cost?: { total?: number };
  steps?: Array<{
    output?: {
      images?: Array<{ id?: string; url?: string; available?: boolean }>;
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
    const message = typeof payload === "object" && payload && "message" in payload
      ? String((payload as { message?: unknown }).message || "Civitai request failed.")
      : `Civitai request failed (${response.status}).`;
    throw new Error(message);
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

export function getTessaGeneration(workflowId: string, waitSeconds = 0) {
  const wait = Math.min(Math.max(Math.floor(waitSeconds), 0), 30);
  const suffix = wait ? `?wait=${wait}` : "";
  return callOrchestrator(`/v2/consumer/workflows/${encodeURIComponent(workflowId)}${suffix}`, {
    method: "GET",
  });
}

export function isTerminalWorkflow(status: string) {
  return ["succeeded", "failed", "expired", "canceled"].includes(status.toLowerCase());
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
