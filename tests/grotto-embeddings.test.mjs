import test from "node:test";
import assert from "node:assert/strict";
import {
  GROTTO_EMBEDDINGS,
  grottoEmbeddingNetworks,
  isCivitaiEmbeddingAir,
  resolveGrottoEmbeddings,
} from "../lib/grotto-embeddings.ts";
import { buildStudioWorkflow } from "../lib/grotto-civitai.ts";

test("Pure Eros Face is a validated Pony embedding, not a LoRA", () => {
  assert.deepEqual(GROTTO_EMBEDDINGS, [{
    id: "pure-eros-face-xl",
    label: "Pure Eros Face XL",
    air: "urn:air:sdxl:embedding:civitai:1013445@1136137",
    compatibility: "both",
    triggerWord: "pureerosface_xl",
    enabled: true,
  }]);
  assert.equal(isCivitaiEmbeddingAir(GROTTO_EMBEDDINGS[0].air), true);
  assert.equal(isCivitaiEmbeddingAir("urn:air:sdxl:lora:civitai:1013445@1136137"), false);
});

test("embedding is loaded as an additional network independently of LoRA capacity", () => {
  const resolved = resolveGrottoEmbeddings(["pure-eros-face-xl"], "pony-realism");
  assert.deepEqual(grottoEmbeddingNetworks(resolved), {
    "urn:air:sdxl:embedding:civitai:1013445@1136137": { strength: 1 },
  });
  assert.throws(() => resolveGrottoEmbeddings(["pure-eros-face-xl", "pure-eros-face-xl"], "pony-v6"), /only be selected once/);
});

test("workflow sends LoRA and embedding AIRs together while keeping separate recipe metadata", () => {
  const workflow = buildStudioWorkflow({
    environmentId: "pony-v6",
    prompt: "portrait",
    negativePrompt: "bad anatomy",
    format: "Portrait",
    quantity: 1,
    loras: [{ id: "pony-amateur-standard-v2", weight: 0.5 }],
    embeddings: ["pure-eros-face-xl"],
  });
  assert.equal(workflow.prompt, "portrait, pureerosface_xl");
  assert.deepEqual(workflow.body.steps[0].input.additionalNetworks, {
    "urn:air:sdxl:lora:civitai:480835@717403": { type: "Lora", strength: 0.5 },
    "urn:air:sdxl:embedding:civitai:1013445@1136137": { strength: 1 },
  });
  assert.equal(workflow.loras.length, 1);
  assert.equal(workflow.embeddings.length, 1);
});
