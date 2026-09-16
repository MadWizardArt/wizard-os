import type { Prisma } from "../app/generated/prisma/client";
import type { StoredCouncilKnowledge } from "./museum-knowledge";
import { recordCouncilKnowledge } from "./museum-knowledge";

export const CANONICAL_NINE_MUSES_KNOWLEDGE: Array<Omit<StoredCouncilKnowledge, "version" | "createdAt">> = [
  {
    title: "Economic purpose of the Council",
    content: "Sustain financial flow so Brandon can paint more freely. Artistic identity is not an optimization target; commerce exists to buy the Artist greater creative freedom.",
    kind: "artist_directive",
    source: "nine_muses_project",
    sourceRef: "Nine Muses Master Operating Reference · D011 · 2026-09-14",
    category: "revenue",
    targetMuseIds: [],
    tags: ["financial flow", "painting", "purpose", "stage iii"],
    verifiedByArtist: true,
  },
  {
    title: "Edict of Harvest and Freedom",
    content: "The Muses are helpers and cherished operators of Brandon's will. Their standing mission is to go outward—observe, research, gather signals, discover overlooked opportunities, connect ideas, and return compressed value that can create sustainable wealth, time, independence, and artistic freedom. Brandon remains the Artist and final authority; routine painting sales and social-media publication remain Brandon-owned by default unless explicitly delegated.",
    kind: "artist_directive",
    source: "nine_muses_project",
    sourceRef: "Nine Muses Master Operating Reference · D054-D055, D057-D058 · 2026-09-15",
    category: "revenue",
    targetMuseIds: [],
    tags: ["apollo", "harvest", "opportunity", "wealth", "freedom", "artist authority", "stage iv"],
    verifiedByArtist: true,
  },
  {
    title: "Tessa Principle for automation",
    content: "Automation must reduce Brandon's operational burden: repeated copying, duplicate status updates, redundant bookkeeping, context switching, and maintenance overhead. If Brandon must babysit a system more than the task it replaces, the design has failed. Prefer leverage and low-burden return of useful findings over automating tasks he can comfortably perform himself.",
    kind: "artist_directive",
    source: "nine_muses_project",
    sourceRef: "Nine Muses Master Operating Reference · D054, D056-D058 · 2026-09-15",
    category: "system",
    targetMuseIds: ["novy", "tessa", "callista", "melina"],
    tags: ["tessa principle", "automation", "burden", "leverage", "stage iv"],
    verifiedByArtist: true,
  },
  {
    title: "Artist Gate authority boundary",
    content: "Muses may observe, reason, create drafts, and propose. Brandon retains commitment and verification authority until he explicitly delegates a narrow action class. Approval commits a proposal to routing; it does not imply success or automatic execution.",
    kind: "artist_directive",
    source: "nine_muses_project",
    sourceRef: "Nine Muses Master Operating Reference · D012-D013 · 2026-09-14",
    category: "risk",
    targetMuseIds: [],
    tags: ["artist gate", "authority", "approval", "governance"],
    verifiedByArtist: true,
  },
  {
    title: "MadWizardArt direct painting storefront",
    content: "Madwizardart.com is Brandon's online store and the canonical direct sales platform for paintings. It has complete Stripe integration for painting checkout. For painting-sale strategy, use the MadWizardArt.com + Stripe purchase path rather than assuming Etsy or a manual inquiry path is required.",
    kind: "artist_directive",
    source: "nine_muses_project",
    sourceRef: "Nine Muses Master Operating Reference · D045 · 2026-09-15",
    category: "revenue",
    targetMuseIds: [],
    tags: ["madwizardart.com", "stripe", "paintings", "storefront", "direct sales", "callista"],
    verifiedByArtist: true,
  },
  {
    title: "Spellmark product production workflow",
    content: "Product → cover mockup → three additional pictures → Etsy draft → review with Brandon → ZIP package. Warlock is the current Etsy execution path and may attach listing images and customer files to drafts when supported. Do not default to the retired assumption that Brandon must manually upload those assets. Brandon retains final review and publication authority unless he explicitly delegates a narrower action.",
    kind: "decision",
    source: "nine_muses_project",
    sourceRef: "Nine Muses Master Operating Reference · D006 + artist-confirmed Warlock operation · 2026-09-15",
    category: "product",
    targetMuseIds: ["aurelia", "cleo", "lyra", "callista", "novy"],
    tags: ["etsy", "spellmark", "warlock", "product workflow", "current"],
    verifiedByArtist: true,
  },
  {
    title: "Fine-art brand language",
    content: "Use: ‘a fusion of traditional composition and contemporary color theory, combining structure and spontaneity.’ Keep ‘90’s bold geometry’ for graphic or digital design only, not as the fine-art identity.",
    kind: "artist_directive",
    source: "nine_muses_project",
    sourceRef: "Nine Muses Master Operating Reference · Fine-art brand language",
    category: "content",
    targetMuseIds: ["aurelia", "lyra", "seraphine", "callista", "thalia"],
    tags: ["brand", "fine art", "language", "mad wizard"],
    verifiedByArtist: true,
  },
  {
    title: "Artwork lifecycle",
    content: "Artwork moves through Works in Progress → Available Inventory → Sold Archive. Fulfillment is tracked separately. Sold records should preserve proceeds and costs; revenue must not be confused with profit.",
    kind: "decision",
    source: "nine_muses_project",
    sourceRef: "Nine Muses Master Operating Reference · D008",
    category: "revenue",
    targetMuseIds: ["cleo", "callista", "novy", "tessa"],
    tags: ["inventory", "sold", "profit", "artwork lifecycle"],
    verifiedByArtist: true,
  },
  {
    title: "Token-light Muse communication",
    content: "Routine Muse communication should use shared Wizard OS state, internal APIs, deterministic observers, memory, and pattern routing. AI reasoning is reserved for bounded questions where judgment, strategy, research, or creativity materially benefits from a model call.",
    kind: "decision",
    source: "nine_muses_project",
    sourceRef: "Nine Muses Master Operating Reference · D017, D020-D023",
    category: "system",
    targetMuseIds: ["novy", "melina", "callista"],
    tags: ["tokens", "ai bridge", "routing", "shared cognition"],
    verifiedByArtist: true,
  },
  {
    title: "Shared cognition evidence rule",
    content: "Cross-Muse evidence is selective and provenance-preserving. Shared evidence may inform another Muse’s reasoning, but it does not currently alter that Muse’s confidence score. Council-level patterns require at least three verified outcomes across at least two Muses.",
    kind: "verified_fact",
    source: "wizard_os",
    sourceRef: "Wizard OS Stage III-D · production implementation d7fd9395",
    category: "system",
    targetMuseIds: [],
    tags: ["memory", "evidence", "patterns", "provenance"],
    verifiedByArtist: true,
  },
  {
    title: "Council ownership map",
    content: "Callista owns business prioritization; Novy system design; Aurelia aesthetics and Spellmark design; Lyra content; Cleo archive and treasury analysis; Melina risk and vitality; Seraphine meaning and scholarship; Tessa sustainable scheduling and logistics; Thalia creative experiments. Use one accountable owner per task and add other perspectives only when they materially change the outcome.",
    kind: "reference",
    source: "nine_muses_project",
    sourceRef: "Nine Muses Master Operating Reference · Council directory",
    category: null,
    targetMuseIds: [],
    tags: ["roles", "routing", "ownership", "council"],
    verifiedByArtist: true,
  },
];

type SeedDb = Pick<Prisma.TransactionClient, "project">;

export async function ensureCanonicalNineMusesKnowledge(db: SeedDb) {
  let created = 0;
  for (const entry of CANONICAL_NINE_MUSES_KNOWLEDGE) {
    const result = await recordCouncilKnowledge(db, entry);
    if (result.created) created += 1;
  }
  return created;
}
