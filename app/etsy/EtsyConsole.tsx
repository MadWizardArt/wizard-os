"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";

const initialDescription = `Professional print shop work order and production ticket system designed for small print shops, copy centers, sign shops, and creative production teams.\n\nBuilt from real print-production workflow experience, this digital system helps organize incoming jobs, specifications, production steps, quality checks, and completion.\n\nThis listing is for a digital download. No physical item will be shipped.`;

type TaxonomyNode = {
  id: number;
  name: string;
  level?: number;
  parent_id?: number | null;
  children?: TaxonomyNode[];
};

type TaxonomyOption = {
  id: number;
  label: string;
  name: string;
  depth: number;
  isLeaf: boolean;
};

type RankedTaxonomyOption = TaxonomyOption & {
  score: number;
  matchedTerms: number;
};

const semanticAliases: Record<string, string[]> = {
  digital: ["download", "printable", "template"],
  printable: ["template", "paper", "stationery", "form"],
  business: ["office", "professional", "organization", "stationery"],
  form: ["forms", "template", "templates", "stationery"],
  forms: ["form", "template", "templates", "stationery"],
  template: ["templates", "printable", "form", "forms"],
  templates: ["template", "printable", "form", "forms"],
  order: ["form", "template", "business"],
  ticket: ["form", "template", "business"],
  job: ["work", "business", "professional"],
  production: ["work", "business", "professional"],
  planner: ["planning", "organizer", "organization", "template"],
};

const misleadingPatterns = [
  "business card cases",
  "dress forms",
  "mannequins",
  "transformers",
  "platform club sneakers",
  "hat forms stands",
];

const specializedLeafIntents = [
  { terms: ["bookkeeping"], queryTerms: ["bookkeeping", "accounting", "finance", "financial"] },
  { terms: ["chore chart", "chore"], queryTerms: ["chore", "chores", "household"] },
  { terms: ["contract", "agreement"], queryTerms: ["contract", "agreement", "legal"] },
  { terms: ["invoice"], queryTerms: ["invoice", "billing"] },
  { terms: ["resume", "cv"], queryTerms: ["resume", "cv", "career"] },
  { terms: ["budget", "budgeting"], queryTerms: ["budget", "budgeting", "finance"] },
  { terms: ["calendar"], queryTerms: ["calendar", "schedule"] },
  { terms: ["wedding"], queryTerms: ["wedding", "bridal", "marriage"] },
];

function normalize(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function flattenTaxonomy(nodes: TaxonomyNode[], parents: string[] = []): TaxonomyOption[] {
  return nodes.flatMap((node) => {
    const path = [...parents, node.name];
    const children = node.children ?? [];
    const current = {
      id: node.id,
      label: path.join(" › "),
      name: node.name,
      depth: path.length,
      isLeaf: children.length === 0,
    };
    return [current, ...flattenTaxonomy(children, path)];
  });
}

function scoreTaxonomyOption(option: TaxonomyOption, query: string): RankedTaxonomyOption {
  const normalizedQuery = normalize(query);
  const queryWords = normalizedQuery.split(/\s+/).filter(Boolean);
  const normalizedLabel = normalize(option.label);
  const normalizedName = normalize(option.name);

  let score = 0;
  let matchedTerms = 0;
  let directMatches = 0;

  if (normalizedQuery && normalizedLabel.includes(normalizedQuery)) score += 120;
  if (normalizedQuery && normalizedName.includes(normalizedQuery)) score += 160;

  for (const word of queryWords) {
    let directlyMatched = false;

    if (normalizedName === word) {
      score += 46;
      directlyMatched = true;
    } else if (normalizedName.includes(word)) {
      score += 30;
      directlyMatched = true;
    } else if (normalizedLabel.includes(word)) {
      score += 18;
      directlyMatched = true;
    }

    if (directlyMatched) {
      matchedTerms += 1;
      directMatches += 1;
      continue;
    }

    const aliases = semanticAliases[word] ?? [];
    const aliasMatches = aliases.filter((alias) => normalizedLabel.includes(alias));
    if (aliasMatches.length > 0) {
      score += Math.min(aliasMatches.length * 2, 6);
      matchedTerms += 1;
    }
  }

  if (queryWords.length > 1 && directMatches === queryWords.length) score += 70;
  else if (directMatches >= Math.ceil(queryWords.length * 0.66)) score += 35;
  else if (queryWords.length >= 3 && directMatches <= 1) score -= 28;

  const querySet = new Set(queryWords);
  const formIntent = querySet.has("form") || querySet.has("forms") || querySet.has("order") || querySet.has("ticket");
  const templateIntent = querySet.has("template") || querySet.has("templates") || querySet.has("printable") || querySet.has("digital");
  const businessIntent = querySet.has("business") || querySet.has("job") || querySet.has("production") || querySet.has("order") || querySet.has("ticket");

  if (formIntent && /\bforms?\b/.test(normalizedName)) score += 55;
  if (templateIntent && /\btemplates?\b/.test(normalizedName)) score += 30;
  if (formIntent && templateIntent && normalizedName === "templates") score += 38;
  if (businessIntent && /\b(business|office|professional)\b/.test(normalizedLabel)) score += 18;

  for (const intent of specializedLeafIntents) {
    const leafHasSpecializedIntent = intent.terms.some((term) => normalizedName.includes(term));
    const queryRequestsIt = intent.queryTerms.some((term) => normalizedQuery.includes(term));
    if (leafHasSpecializedIntent && !queryRequestsIt) score -= 95;
  }

  if (option.isLeaf) score += 5;
  score += Math.min(option.depth, 6);

  if (misleadingPatterns.some((pattern) => normalizedLabel.includes(pattern))) score -= 120;

  return { ...option, score, matchedTerms };
}

function relevanceLabel(score: number) {
  if (score >= 110) return "Strong match";
  if (score >= 70) return "Good match";
  return "Possible";
}

export default function EtsyConsole() {
  const [shop, setShop] = useState<any>(null);
  const [shopError, setShopError] = useState("");
  const [creating, setCreating] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [title, setTitle] = useState("Print Shop Work Order + Production Ticket System | Printable Job Ticket");
  const [description, setDescription] = useState(initialDescription);
  const [price, setPrice] = useState("14.00");
  const [taxonomyId, setTaxonomyId] = useState("");
  const [taxonomy, setTaxonomy] = useState<TaxonomyNode[]>([]);
  const [taxonomyError, setTaxonomyError] = useState("");
  const [categorySearch, setCategorySearch] = useState("business form template");
  const [tags, setTags] = useState("print shop,work order,job ticket,production ticket,printable form,small business");

  useEffect(() => {
    fetch("/api/etsy/shop", { cache: "no-store" })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Unable to verify Etsy shop");
        return data;
      })
      .then((data) => setShop(data.shop))
      .catch((error) => setShopError(error.message));

    fetch("/api/etsy/taxonomy", { cache: "no-store" })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Unable to load Etsy categories");
        return data;
      })
      .then((data) => setTaxonomy(data.results ?? []))
      .catch((error) => setTaxonomyError(error.message));
  }, []);

  const taxonomyOptions = useMemo(() => flattenTaxonomy(taxonomy), [taxonomy]);
  const rankedCategories = useMemo(() => {
    const query = categorySearch.trim();
    if (!query) return taxonomyOptions.map((option) => ({ ...option, score: 0, matchedTerms: 0 })).slice(0, 30);

    return taxonomyOptions
      .map((option) => scoreTaxonomyOption(option, query))
      .filter((option) => option.score > 15)
      .sort((a, b) => b.score - a.score || b.depth - a.depth || a.label.localeCompare(b.label))
      .slice(0, 20);
  }, [categorySearch, taxonomyOptions]);

  const selectedCategory = useMemo(
    () => taxonomyOptions.find((option) => String(option.id) === taxonomyId),
    [taxonomyId, taxonomyOptions]
  );

  async function createDraft(event: FormEvent) {
    event.preventDefault();
    setCreating(true);
    setResult(null);

    try {
      const response = await fetch("/api/etsy/drafts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          description,
          price: Number(price),
          quantity: 999,
          taxonomyId: Number(taxonomyId),
          tags: tags.split(",").map((tag) => tag.trim()).filter(Boolean),
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.details?.error || data.error || "Draft creation failed");
      setResult(data);
    } catch (error) {
      setResult({ error: error instanceof Error ? error.message : "Draft creation failed" });
    } finally {
      setCreating(false);
    }
  }

  const inputStyle = { width: "100%", padding: 12, borderRadius: 9, border: "1px solid #34404d", background: "#0d141c", color: "#e9edf1", boxSizing: "border-box" as const };
  const labelStyle = { display: "block", marginBottom: 7, color: "#c6ced7", fontSize: 13, fontWeight: 700 };
  const chipStyle = { padding: "7px 10px", borderRadius: 999, border: "1px solid #34404d", background: "#111923", color: "#c6ced7", cursor: "pointer", fontSize: 12 } as const;

  return (
    <div style={{ display: "grid", gap: 22 }}>
      <section style={{ padding: 20, border: "1px solid #26313d", borderRadius: 14, background: "#111923" }}>
        <p style={{ margin: 0, color: "#a99164", fontSize: 12, textTransform: "uppercase", letterSpacing: ".12em" }}>Connection</p>
        {shop ? (
          <><h2 style={{ marginBottom: 4 }}>{shop.shop_name}</h2><p style={{ margin: 0, color: "#8e99a7" }}>Warlock verified the connected Etsy shop. Shop ID: {shop.shop_id}</p></>
        ) : shopError ? (
          <p style={{ color: "#e08aa2" }}>{shopError}</p>
        ) : (
          <p style={{ color: "#8e99a7" }}>Verifying Etsy shop…</p>
        )}
      </section>

      <form onSubmit={createDraft} style={{ padding: 24, border: "1px solid #26313d", borderRadius: 14, background: "#111923" }}>
        <p style={{ margin: 0, color: "#a99164", fontSize: 12, textTransform: "uppercase", letterSpacing: ".12em" }}>Draft Queue · Product 01</p>
        <h2 style={{ marginTop: 8 }}>Print Shop Production Ticket System</h2>
        <p style={{ color: "#8e99a7", lineHeight: 1.5 }}>Warlock creates an Etsy draft only. Publishing remains a separate approval step.</p>

        <div style={{ display: "grid", gap: 16 }}>
          <label><span style={labelStyle}>Title</span><input style={inputStyle} value={title} onChange={(e) => setTitle(e.target.value)} /></label>
          <label><span style={labelStyle}>Description</span><textarea style={{ ...inputStyle, minHeight: 180, resize: "vertical" }} value={description} onChange={(e) => setDescription(e.target.value)} /></label>
          <label><span style={labelStyle}>Price (USD)</span><input style={inputStyle} value={price} onChange={(e) => setPrice(e.target.value)} /></label>

          <div style={{ padding: 16, border: "1px solid #34404d", borderRadius: 11, background: "#0d141c" }}>
            <span style={labelStyle}>Smart Etsy category finder</span>
            <input style={inputStyle} value={categorySearch} onChange={(e) => setCategorySearch(e.target.value)} placeholder="Describe the product, e.g. business form template" />

            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 10 }}>
              {["business form template", "printable business form", "work order template", "job ticket form", "digital download"].map((query) => (
                <button key={query} type="button" style={chipStyle} onClick={() => setCategorySearch(query)}>{query}</button>
              ))}
            </div>

            {taxonomyError ? <p style={{ color: "#e08aa2" }}>Category lookup failed: {taxonomyError}</p> : taxonomyOptions.length === 0 ? <p style={{ color: "#8e99a7" }}>Loading Etsy seller taxonomy…</p> : (
              <div style={{ display: "grid", gap: 8, marginTop: 14 }}>
                {rankedCategories.length === 0 ? <p style={{ color: "#8e99a7" }}>No convincing category matches. Try a simpler product description.</p> : rankedCategories.map((option, index) => {
                  const selected = String(option.id) === taxonomyId;
                  return (
                    <button
                      key={option.id}
                      type="button"
                      onClick={() => setTaxonomyId(String(option.id))}
                      style={{
                        textAlign: "left",
                        padding: 12,
                        borderRadius: 9,
                        border: selected ? "1px solid #a99164" : "1px solid #2b3743",
                        background: selected ? "#1b2025" : "#111923",
                        color: "#e9edf1",
                        cursor: "pointer",
                      }}
                    >
                      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center" }}>
                        <span style={{ fontWeight: 700 }}>{index === 0 ? "★ " : ""}{option.label}</span>
                        <span style={{ color: index === 0 ? "#d4b06f" : "#8e99a7", fontSize: 11, whiteSpace: "nowrap" }}>{relevanceLabel(option.score)}</span>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}

            {selectedCategory && (
              <div style={{ marginTop: 12, padding: 12, borderRadius: 9, border: "1px solid #4b4432", background: "#171812" }}>
                <div style={{ color: "#d4b06f", fontSize: 12, fontWeight: 800, marginBottom: 4 }}>Selected category</div>
                <div>{selectedCategory.label}</div>
                <div style={{ color: "#8e99a7", fontSize: 11, marginTop: 5 }}>Taxonomy ID: {taxonomyId}</div>
              </div>
            )}
          </div>

          <label><span style={labelStyle}>Tags · comma separated</span><input style={inputStyle} value={tags} onChange={(e) => setTags(e.target.value)} /></label>
        </div>

        <button disabled={creating || !shop || !taxonomyId} type="submit" style={{ marginTop: 20, padding: "12px 18px", border: 0, borderRadius: 10, background: "#6f263d", color: "white", fontWeight: 800, cursor: "pointer", opacity: creating || !shop || !taxonomyId ? .55 : 1 }}>
          {creating ? "Creating Etsy Draft…" : "Create Etsy Draft"}
        </button>

        {result?.error && <p style={{ color: "#e08aa2", marginTop: 16 }}>Draft failed: {result.error}</p>}
        {result?.listing && <div style={{ marginTop: 16, padding: 14, border: "1px solid #29533f", borderRadius: 10, background: "#15231d" }}>Draft created successfully. Etsy listing ID: {result.listing.listing_id}</div>}
      </form>
    </div>
  );
}
