import crypto from "node:crypto";
import Database from "better-sqlite3";

const databasePath = process.env.DATABASE_URL?.replace(/^file:/, "") || "./prisma/dev.db";
const db = new Database(databasePath);
db.pragma("foreign_keys = ON");

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

const insertTemplate = db.prepare(`
  INSERT INTO WorkflowTemplate (id, name, projectType, version, isDefault, createdAt, updatedAt)
  VALUES (?, ?, ?, 1, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
`);
const insertTemplateStage = db.prepare(`
  INSERT INTO WorkflowTemplateStage (id, templateId, name, position, defaultFieldsJson)
  VALUES (?, ?, ?, ?, ?)
`);

const seed = db.transaction(() => {
  const templateIds = new Map();
  for (const [name, projectType, stages] of templates) {
    let template = db.prepare("SELECT id FROM WorkflowTemplate WHERE name = ? AND version = 1").get(name);
    if (!template) {
      template = { id: crypto.randomUUID() };
      insertTemplate.run(template.id, name, projectType);
      stages.forEach((stage, position) => {
        insertTemplateStage.run(crypto.randomUUID(), template.id, stage, position, JSON.stringify(stageDefaults[stage] || {}));
      });
    }
    templateIds.set(name, template.id);
  }

  const projects = [
    ["gabriel", "Gabriel's Horn", "ARTWORK", "ACTIVE", 80, null, "Finish painting", "Acrylic on canvas · 2026", "Original Artwork"],
    ["autumn", "Autumn Print Release", "DIGITAL_PRODUCT", "ACTIVE", 65, 62000, "Approve final proof", null, "Digital Product"],
    ["commission", "Private Collector Commission", "COMMISSION", "WAITING", 55, 70000, "Collector follow-up", null, "Commission"],
    ["wizard", "Wizard OS — Business Engine", "INTERNAL", "ACTIVE", 35, null, "Test project workflows", null, "Digital Product"],
  ];

  const insertProject = db.prepare(`
    INSERT INTO Project (id, title, type, status, progress, valueCents, nextAction, notes, templateId, createdAt, updatedAt)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
  `);
  const insertProjectStage = db.prepare(`
    INSERT INTO ProjectStage (id, projectId, name, position, status, progress, fieldsJson, createdAt, updatedAt)
    VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
  `);

  for (const project of projects) {
    if (db.prepare("SELECT id FROM Project WHERE id = ?").get(project[0])) continue;
    const templateId = templateIds.get(project[8]);
    insertProject.run(...project.slice(0, 8), templateId);
    const stages = db.prepare("SELECT name, position, defaultFieldsJson FROM WorkflowTemplateStage WHERE templateId = ? ORDER BY position").all(templateId);
    for (const stage of stages) {
      const isFirst = stage.position === 0;
      const fields = project[0] === "gabriel" && isFirst
        ? JSON.stringify({ completion: 80, medium: "Acrylic on canvas", year: "2026" })
        : stage.defaultFieldsJson;
      insertProjectStage.run(crypto.randomUUID(), project[0], stage.name, stage.position, isFirst ? "IN_PROGRESS" : "NOT_STARTED", project[0] === "gabriel" && isFirst ? 80 : 0, fields);
    }
  }
});

seed();
db.close();
console.log("Seeded workflow templates and starter projects.");
