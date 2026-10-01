import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../app/generated/prisma/client.ts";
import { normalizePgSslMode } from "../lib/database-url.ts";

const connectionString = process.env.DIRECT_URL || process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("Set DIRECT_URL or DATABASE_URL before running npm run db:seed.");
}

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: normalizePgSslMode(connectionString) }),
});

const templates = [
  ["Original Artwork", "ARTWORK", ["Create", "Finish / Varnish", "Photograph", "Ingest / Archive", "Price", "Publish", "Market", "Sell / Fulfill"]],
  ["Commission", "COMMISSION", ["Inquiry", "Quote", "Deposit", "Produce", "Client Approval", "Final Payment", "Deliver", "Follow-up"]],
  ["Digital Product", "DIGITAL_PRODUCT", ["Validate", "Design", "Package", "Listing", "Publish", "Promote", "Review Performance"]],
  ["Content", "CONTENT", ["Idea", "Plan", "Produce", "Edit", "Schedule", "Publish", "Review Performance"]],
];

const stageDefaults = {
  "Create": { completion: 0 },
  "Finish / Varnish": { varnished: false, framed: false, hardware: false },
  "Photograph": { hero: false, details: false, edited: false },
  "Ingest / Archive": { ingested: false, inventoryId: "", coa: false },
  "Price": { price: "", floor: "", costBasis: "" },
  "Publish": { bigCartel: false, portfolio: false, etsy: false, seo: false },
  "Market": { instagram: "Not Planned", tiktok: "Not Planned", youtubeShort: "Not Planned" },
  "Sell / Fulfill": { sold: false, paid: false, packed: false, shipped: false, delivered: false },
};

try {
  await prisma.$transaction(async (tx) => {
    for (const [name, projectType, stages] of templates) {
      let template = await tx.workflowTemplate.findFirst({
        where: { name, version: 1 },
        orderBy: { createdAt: "asc" },
      });
      if (!template) {
        template = await tx.workflowTemplate.create({
          data: { name, projectType, version: 1, isDefault: true },
        });
      }

      for (const [position, stageName] of stages.entries()) {
        const existing = await tx.workflowTemplateStage.findFirst({
          where: { templateId: template.id, name: stageName, position },
        });
        if (!existing) {
          await tx.workflowTemplateStage.create({
            data: {
              templateId: template.id,
              name: stageName,
              position,
              defaultFieldsJson: JSON.stringify(stageDefaults[stageName] || {}),
            },
          });
        }
      }
    }
  });
  console.log("Seeded canonical workflow templates. No sample projects or financial records were created.");
} finally {
  await prisma.$disconnect();
}
