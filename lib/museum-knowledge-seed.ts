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
    title: "Spellmark product production workflow",
    content: "Product → cover mockup → three additional pictures → Etsy draft → review with Brandon → ZIP package. Brandon manually uploads Etsy images and customer files when platform security makes automated upload unreliable; Warlock skeleton drafts remain useful.",
    kind: "decision",
    source: "nine_muses_project",
    sourceRef: "Nine Muses Master Operating Reference · D004-D006",
    category: "product",
    targetMuseIds: ["aurelia", "cleo", "lyra", "callista", "novy"],
    tags: ["etsy", "spellmark", "warlock", "product workflow"],
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
