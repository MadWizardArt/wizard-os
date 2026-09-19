import test from "node:test";
import assert from "node:assert/strict";
import {
  GROTTO_LORAS,
  MAX_GROTTO_LORAS,
  grottoAdditionalNetworks,
  grottoLoraList,
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
  assert.equal(MAX_GROTTO_LORAS, 8);
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

test("curated Grotto LoRAs keep exact AIRs and compatibility", () => {
  assert.deepEqual(
    GROTTO_LORAS.map(({ id, air, compatibility, defaultWeight, triggerWords }) => ({ id, air, compatibility, defaultWeight, triggerWords })),
    [
      {
        id: "pony-amateur-standard-v2",
        air: "urn:air:sdxl:lora:civitai:480835@717403",
        compatibility: "both",
        defaultWeight: 0.5,
        triggerWords: [],
      },
      {
        id: "pony-realism-slider",
        air: "urn:air:sdxl:lora:civitai:1115064@1253021",
        compatibility: "pony-realism",
        defaultWeight: 1.4,
        triggerWords: [],
      },
      {
        id: "pony-realism-enhancer",
        air: "urn:air:sdxl:lora:civitai:927305@1439429",
        compatibility: "pony-realism",
        defaultWeight: 0.7,
        triggerWords: [],
      },
      {
        id: "epic-fantasy-style",
        air: "urn:air:sdxl:lora:civitai:470073@522995",
        compatibility: "both",
        defaultWeight: 0.8,
        triggerWords: [],
      },
      {
        id: "real-skin-slider",
        air: "urn:air:sdxl:lora:civitai:1486921@1681921",
        compatibility: "both",
        defaultWeight: 2.5,
        triggerWords: [],
      },
    ],
  );
  assert.equal(grottoLoraList().every((lora) => lora.configured), true);

  assert.throws(
    () => resolveGrottoLoras([{ id: "pony-realism-enhancer", weight: 0.7 }], "pony-v6"),
    /not compatible/,
  );
  assert.equal(resolveGrottoLoras([{ id: "pony-amateur-standard-v2", weight: 0.2 }], "pony-v6")[0].weight, 0.2);
  assert.equal(resolveGrottoLoras([{ id: "pony-amateur-standard-v2", weight: 0.9 }], "pony-realism")[0].weight, 0.9);
  assert.throws(() => resolveGrottoLoras([{ id: "pony-amateur-standard-v2", weight: 0.95 }], "pony-realism"), /between 0.2 and 0.9/);
  assert.equal(resolveGrottoLoras([{ id: "epic-fantasy-style", weight: 0.8 }], "pony-v6")[0].weight, 0.8);
  assert.equal(resolveGrottoLoras([{ id: "epic-fantasy-style", weight: 0.8 }], "pony-realism")[0].weight, 0.8);
  assert.equal(resolveGrottoLoras([{ id: "real-skin-slider", weight: 2.5 }], "pony-v6")[0].weight, 2.5);
  assert.equal(resolveGrottoLoras([{ id: "real-skin-slider", weight: 2.5 }], "pony-realism")[0].weight, 2.5);
});
