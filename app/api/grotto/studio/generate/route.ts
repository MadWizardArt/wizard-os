import { NextRequest, NextResponse } from "next/server";
import {
  authenticatedCivitaiOutputUrl,
  buildStudioWorkflow,
  civitaiOutputHeaders,
  estimateStudioGeneration,
  extractWorkflowImages,
  getGeneration,
  grottoStudioStatus,
  isTerminalWorkflow,
  submitStudioGeneration,
  type StudioFormat,
  type StudioGenerationInput,
} from "../../../../../lib/grotto-civitai";
import { verifyArtistSession } from "../../../../../lib/museum-artist-auth";
import { referenceUrl } from "../../../../../lib/grotto-reference";
import { prisma } from "../../../../../lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const FORMATS = new Set<StudioFormat>(["Portrait", "Square", "Landscape"]);

function sameOrigin(request: NextRequest) {
  const origin = request.headers.get("origin");
  if (!origin) return true;
  try {
    return new URL(origin).host === request.nextUrl.host;
  } catch {
    return false;
  }
}

function safeError(error: unknown) {
  return error instanceof Error ? error.message : "Atelier generation failed.";
}

function readInput(value: unknown): StudioGenerationInput | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>;
  const prompt = String(raw.prompt ?? "").trim();
  const negativePrompt = String(raw.negativePrompt ?? "").trim();
  const format = String(raw.format ?? "") as StudioFormat;
  const quantity = Number(raw.quantity);

  if (!prompt || prompt.length > 5000) return null;
  if (negativePrompt.length > 5000) return null;
  if (!FORMATS.has(format)) return null;
  if (quantity !== 1 && quantity !== 4) return null;

  const status = grottoStudioStatus();
  if (quantity > status.maxImages) return null;

  const referenceId = typeof raw.referenceId === "string" ? raw.referenceId.trim() : undefined;
  if (referenceId && !/^[a-zA-Z0-9_-]{1,100}$/.test(referenceId)) return null;
  const strength = raw.strength === undefined ? 0.35 : Number(raw.strength);
  if (!Number.isFinite(strength) || strength < 0.05 || strength > 0.9) return null;
  return { prompt, negativePrompt, format, quantity, ...(referenceId ? { referenceId, strength } : {}) };
}

async function persistWorkflowImages(
  workflowId: string,
  input: StudioGenerationInput,
  snapshot: Awaited<ReturnType<typeof getGeneration>>,
) {
  const outputs = extractWorkflowImages(snapshot);
  const { prompt, body } = buildStudioWorkflow(input);
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

    const sourceUrl = authenticatedCivitaiOutputUrl(output.url);
    const response = await fetch(sourceUrl, {
      headers: civitaiOutputHeaders(),
      cache: "no-store",
      redirect: "follow",
      signal: AbortSignal.timeout(30_000),
    });
    if (!response.ok) {
      console.error("[grotto:atelier] Civitai output retrieval failed", {
        workflowId,
        status: response.status,
        host: new URL(sourceUrl).hostname,
      });
      throw new Error(`Generated image could not be retrieved (${response.status}).`);
    }

    const contentType = response.headers.get("content-type")?.split(";")[0]?.trim() || "";
    if (!contentType.startsWith("image/")) throw new Error("Generated output was not an image.");

    const bytes = Buffer.from(await response.arrayBuffer());
    if (bytes.byteLength === 0) throw new Error("Generated image was empty.");
    if (bytes.byteLength > 16 * 1024 * 1024) throw new Error("Generated image exceeded the private gallery size limit.");

    const image = await prisma.grottoImage.create({
      data: {
        museId: "studio",
        contentType,
        imageData: bytes,
        byteSize: bytes.byteLength,
        provider: "civitai",
        providerWorkflowId: workflowId,
        providerImageId,
        prompt,
        recipeJson: JSON.stringify({ studio: input, workflow: body }),
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
    return NextResponse.json({ error: "Cross-origin Atelier generation is not accepted." }, { status: 403 });
  }

  const status = grottoStudioStatus();
  if (!status.configured) {
    return NextResponse.json({ error: "The Atelier is not connected yet.", studio: status }, { status: 503 });
  }

  const body = await request.json().catch(() => ({}));
  const input = readInput(body.input);
  if (!input) {
    return NextResponse.json({ error: "A valid Studio prompt, format, and count are required." }, { status: 400 });
  }

  try {
    let sourceImage: string | undefined;
    if (input.referenceId && !body.workflowId) {
      if (input.referenceId.startsWith("canon-")) {
        const museId = input.referenceId.slice(6);
        const allowedMuses = new Set(["novy", "aurelia", "callista", "cleo", "lyra", "melina", "seraphine", "tessa", "thalia"]);
        const host = process.env.VERCEL_PROJECT_PRODUCTION_URL || process.env.VERCEL_URL;
        if (!allowedMuses.has(museId) || !host) return NextResponse.json({ error: "That canonical reference is unavailable." }, { status: 400 });
        sourceImage = `https://${host}/museum/${museId}.webp`;
      } else {
        const reference = await prisma.grottoImage.findFirst({ where: { id: input.referenceId, deletedAt: null }, select: { id: true } });
        if (!reference) return NextResponse.json({ error: "Reference no longer exists. Choose another image." }, { status: 400 });
        sourceImage = referenceUrl(reference.id);
      }
    }
    if (body.estimate === true) {
      const estimate = await estimateStudioGeneration(input, sourceImage);
      return NextResponse.json({ costBuzz: estimate.cost?.total ?? null });
    }

    const workflowId = typeof body.workflowId === "string" ? body.workflowId.trim() : "";
    if (workflowId) {
      const workflow = await getGeneration(workflowId);
      if (!isTerminalWorkflow(workflow.status)) {
        return NextResponse.json({ workflowId, status: workflow.status, images: [] });
      }

      if (workflow.status.toLowerCase() !== "succeeded") {
        return NextResponse.json({ workflowId, status: workflow.status, images: [] }, { status: 502 });
      }

      const images = await persistWorkflowImages(workflowId, input, workflow);
      if (images.length === 0) {
        return NextResponse.json({ error: "Generation completed without an image output." }, { status: 502 });
      }

      return NextResponse.json({ workflowId, status: workflow.status, images });
    }

    const workflow = await submitStudioGeneration(input, sourceImage);
    return NextResponse.json({ workflowId: workflow.id, status: workflow.status });
  } catch (error) {
    console.error("[grotto:atelier] generation request failed", {
      message: safeError(error),
    });
    return NextResponse.json({ error: safeError(error) }, { status: 502 });
  }
}
