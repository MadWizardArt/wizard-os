import { NextRequest, NextResponse } from "next/server";
import {
  buildTessaWorkflow,
  estimateTessaGeneration,
  extractWorkflowImages,
  getTessaGeneration,
  grottoGenerationStatus,
  isTerminalWorkflow,
  submitTessaGeneration,
  type GrottoChoices,
} from "../../../../lib/grotto-civitai";
import { verifyArtistSession } from "../../../../lib/museum-artist-auth";
import { prisma } from "../../../../lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ALLOWED = {
  mood: new Set(["Soft", "Playful", "Mysterious", "Serene"]),
  setting: new Set(["Onsen", "Shrine", "Room", "Garden"]),
  pose: new Set(["Seated", "Standing", "Reclining", "Surprise me"]),
  frame: new Set(["Portrait", "Full", "Close", "Wide"]),
};

function sameOrigin(request: NextRequest) {
  const origin = request.headers.get("origin");
  if (!origin) return true;
  try {
    return new URL(origin).host === request.nextUrl.host;
  } catch {
    return false;
  }
}

function readChoices(input: unknown): GrottoChoices | null {
  if (!input || typeof input !== "object") return null;
  const value = input as Record<string, unknown>;
  const choices = {
    mood: String(value.mood ?? ""),
    setting: String(value.setting ?? ""),
    pose: String(value.pose ?? ""),
    frame: String(value.frame ?? ""),
  };

  if (!ALLOWED.mood.has(choices.mood)) return null;
  if (!ALLOWED.setting.has(choices.setting)) return null;
  if (!ALLOWED.pose.has(choices.pose)) return null;
  if (!ALLOWED.frame.has(choices.frame)) return null;
  return choices;
}

function choicesFromQuery(request: NextRequest) {
  return readChoices({
    mood: request.nextUrl.searchParams.get("mood"),
    setting: request.nextUrl.searchParams.get("setting"),
    pose: request.nextUrl.searchParams.get("pose"),
    frame: request.nextUrl.searchParams.get("frame"),
  });
}

function safeError(error: unknown) {
  return error instanceof Error ? error.message : "Generation provider request failed.";
}

function ensureCivitaiImageUrl(raw: string) {
  const url = new URL(raw);
  if (url.protocol !== "https:") throw new Error("Civitai returned an invalid image URL.");
  if (url.hostname !== "image.civitai.com" && !url.hostname.endsWith(".civitai.com")) {
    throw new Error("Civitai returned an unexpected image host.");
  }
  return url.toString();
}

async function persistWorkflowImages(workflowId: string, choices: GrottoChoices, snapshot: Awaited<ReturnType<typeof getTessaGeneration>>) {
  const outputs = extractWorkflowImages(snapshot);
  const { prompt, body } = buildTessaWorkflow(choices);
  const saved = [];

  for (let index = 0; index < outputs.length; index += 1) {
    const output = outputs[index];
    const providerImageId = output.id?.trim() || `${workflowId}:${index}`;
    const existing = await prisma.grottoImage.findUnique({
      where: { providerImageId },
      select: { id: true, favorite: true, canonical: true, createdAt: true },
    });

    if (existing) {
      saved.push({ ...existing, src: `/api/grotto/images/${existing.id}/file` });
      continue;
    }

    const sourceUrl = ensureCivitaiImageUrl(output.url);
    const response = await fetch(sourceUrl, { cache: "no-store", signal: AbortSignal.timeout(30_000) });
    if (!response.ok) throw new Error(`Generated image could not be retrieved (${response.status}).`);

    const contentType = response.headers.get("content-type")?.split(";")[0]?.trim() || "";
    if (!contentType.startsWith("image/")) throw new Error("Generated output was not an image.");

    const bytes = Buffer.from(await response.arrayBuffer());
    if (bytes.byteLength === 0) throw new Error("Generated image was empty.");
    if (bytes.byteLength > 16 * 1024 * 1024) throw new Error("Generated image exceeded the private gallery size limit.");

    const image = await prisma.grottoImage.create({
      data: {
        museId: "tessa",
        contentType,
        imageData: bytes,
        byteSize: bytes.byteLength,
        provider: "civitai",
        providerWorkflowId: workflowId,
        providerImageId,
        prompt,
        recipeJson: JSON.stringify({ choices, workflow: body }),
      },
      select: { id: true, favorite: true, canonical: true, createdAt: true },
    });

    saved.push({ ...image, src: `/api/grotto/images/${image.id}/file` });
  }

  return saved;
}

export async function POST(request: NextRequest) {
  if (!verifyArtistSession(request)) {
    return NextResponse.json({ error: "Artist session required." }, { status: 401 });
  }
  if (!sameOrigin(request)) {
    return NextResponse.json({ error: "Cross-origin Grotto generation is not accepted." }, { status: 403 });
  }

  const generation = grottoGenerationStatus();
  if (!generation.configured) {
    return NextResponse.json({ error: "Civitai generation is not connected yet.", generation }, { status: 503 });
  }

  const input = await request.json().catch(() => ({}));
  if (input.museId !== "tessa") {
    return NextResponse.json({ error: "That Muse is not connected to the Grotto generator yet." }, { status: 400 });
  }

  const choices = readChoices(input.choices);
  if (!choices) return NextResponse.json({ error: "Invalid Grotto generation choices." }, { status: 400 });

  try {
    if (input.estimate === true) {
      const estimate = await estimateTessaGeneration(choices);
      return NextResponse.json({ costBuzz: estimate.cost?.total ?? null });
    }

    const workflow = await submitTessaGeneration(choices);
    return NextResponse.json({ workflowId: workflow.id, status: workflow.status });
  } catch (error) {
    return NextResponse.json({ error: safeError(error) }, { status: 502 });
  }
}

export async function GET(request: NextRequest) {
  if (!verifyArtistSession(request)) {
    return NextResponse.json({ error: "Artist session required." }, { status: 401 });
  }

  const generation = grottoGenerationStatus();
  if (!generation.configured) {
    return NextResponse.json({ error: "Civitai generation is not connected yet." }, { status: 503 });
  }

  const workflowId = request.nextUrl.searchParams.get("workflowId")?.trim() || "";
  const museId = request.nextUrl.searchParams.get("museId")?.trim().toLowerCase() || "";
  const choices = choicesFromQuery(request);
  if (!workflowId || museId !== "tessa" || !choices) {
    return NextResponse.json({ error: "A valid Tessa workflow and recipe are required." }, { status: 400 });
  }

  try {
    const workflow = await getTessaGeneration(workflowId);
    if (!isTerminalWorkflow(workflow.status)) {
      return NextResponse.json({ workflowId, status: workflow.status, images: [] });
    }

    if (workflow.status.toLowerCase() !== "succeeded") {
      return NextResponse.json({ workflowId, status: workflow.status, images: [] }, { status: 502 });
    }

    const images = await persistWorkflowImages(workflowId, choices, workflow);
    if (images.length === 0) {
      return NextResponse.json({ error: "Generation completed without an image output." }, { status: 502 });
    }

    return NextResponse.json({ workflowId, status: workflow.status, images });
  } catch (error) {
    return NextResponse.json({ error: safeError(error) }, { status: 502 });
  }
}
