import test from "node:test";
import assert from "node:assert/strict";
import {
  MAX_GROTTO_LORAS,
  grottoAdditionalNetworks,
  isCivitaiLoraAir,
  resolveGrottoLoras,
} from "../lib/grotto-loras.ts";

test("Civitai LoRA AIR validation accepts only LoRA resources", () => {
  assert.equal(isCivitaiLoraAir("urn:air:sdxl:lora:civitai:123@456"), true);
  assert.equal(isCivitaiLoraAir("urn:air:pony:lora:civitai:123@456"), true);
  assert.equal(isCivitaiLoraAir("urn:air:sdxl:checkpoint:civitai:123@456"), false);
  assert.equal(isCivitaiLoraAir("https://civitai.com/models/123"), false);
});

test("Atelier LoRA stack fails closed for unknown resources and over-stacking", () => {
  assert.throws(
    () => resolveGrottoLoras([{ id: "not-installed", weight: 0.5 }], "pony-v6"),
    /not installed/,
  );
  assert.throws(
    () => resolveGrottoLoras(
      Array.from({ length: MAX_GROTTO_LORAS + 1 }, (_, index) => ({ id: `lora-${index}`, weight: 0.5 })),
      "pony-v6",
    ),
    /at most/,
  );
});

test("Civitai textToImage LoRAs use additionalNetworks wire format", () => {
  const air = "urn:air:sdxl:lora:civitai:123@456";
  const networks = grottoAdditionalNetworks([
    {
      id: "detail-test",
      label: "Detail Test",
      air,
      compatibility: "both",
      category: "quality",
      defaultWeight: 0.55,
      minWeight: 0.1,
      maxWeight: 1.2,
      enabled: true,
      triggerWords: ["detail_test"],
      weight: 0.65,
    },
  ]);
  assert.deepEqual(networks, {
    [air]: {
      type: "Lora",
      strength: 0.65,
    },
  });
});
