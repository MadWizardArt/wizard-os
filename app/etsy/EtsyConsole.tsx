"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";

type TaxonomyNode = { id: number; name: string; children?: TaxonomyNode[] };
type TaxonomyOption = { id: number; label: string; name: string; depth: number; isLeaf: boolean };
type RankedTaxonomyOption = TaxonomyOption & { score: number; matchedTerms: number };
type AureliaDraft = {
  id: string;
  title: string;
  description: string;
  price: number | null;
  tags: string[];
  categorySearch: string;
  createdAt: string;
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
    let direct = false;
    if (normalizedName === word) {
      score += 46;
      direct = true;
    } else if (normalizedName.includes(word)) {
      score += 30;
      direct = true;
    } else if (normalizedLabel.includes(word)) {
      score += 18;
      direct = true;
    }

    if (direct) {
      matchedTerms += 1;
      directMatches += 1;
      continue;
    }

    const aliases = semanticAliases[word] ?? [];
    const hits = aliases.filter((alias) => normalizedLabel.includes(alias));
    if (hits.length) {
      score += Math.min(hits.length * 2, 6);
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
    if (intent.terms.some((term) => normalizedName.includes(term)) && !intent.queryTerms.some((term) => normalizedQuery.includes(term))) {
      score -= 95;
    }
  }

  if (option.isLeaf) score += 5;
  score += Math.min(option.depth, 6);
  if (misleadingPatterns.some((pattern) => normalizedLabel.includes(pattern))) score -= 120;
  return { ...option, score, matchedTerms };
}

function relevanceLabel(score: number) {
  return score >= 110 ? "Strong match" : score >= 70 ? "Good match" : "Possible";
}

export default function EtsyConsole() {
  const [shop, setShop] = useState<any>(null);
  const [shopError, setShopError] = useState("");
  const [creating, setCreating] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [price, setPrice] = useState("");
  const [taxonomyId, setTaxonomyId] = useState("");
  const [taxonomy, setTaxonomy] = useState<TaxonomyNode[]>([]);
  const [taxonomyError, setTaxonomyError] = useState("");
  const [categorySearch, setCategorySearch] = useState("");
  const [tags, setTags] = useState("");
  const [aureliaDrafts, setAureliaDrafts] = useState<AureliaDraft[]>([]);
  const [selectedAureliaDraftId, setSelectedAureliaDraftId] = useState("");
  const [aureliaError, setAureliaError] = useState("");

  async function loadAureliaDrafts() {
    try {
      const response = await fetch("/api/etsy/aurelia-drafts", { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Unable to load Aurelia drafts");
      setAureliaDrafts((data.drafts ?? []).slice(0, 5));
      setAureliaError("");
    } catch (error) {
      setAureliaError(error instanceof Error ? error.message : "Unable to load Aurelia drafts");
    }
  }

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

    loadAureliaDrafts();
    const timer = window.setInterval(loadAureliaDrafts, 30000);
    return () => window.clearInterval(timer);
  }, []);

  const taxonomyOptions = useMemo(() => flattenTaxonomy(taxonomy), [taxonomy]);
  const rankedCategories = useMemo(() => {
    const query = categorySearch.trim();
    if (!query) return [];
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

  function clearComposer() {
    setSelectedAureliaDraftId("");
    setTitle("");
    setDescription("");
    setPrice("");
    setTaxonomyId("");
    setCategorySearch("");
    setTags("");
    setResult(null);
  }

  function loadAureliaDraft(id: string) {
    setSelectedAureliaDraftId(id);
    const draft = aureliaDrafts.find((item) => item.id === id);
    if (!draft) return;
    setTitle(draft.title ?? "");
    setDescription(draft.description ?? "");
    setPrice(draft.price == null ? "" : draft.price.toFixed(2));
    setTags((draft.tags ?? []).join(", "));
    setCategorySearch(draft.categorySearch ?? "");
    setTaxonomyId("");
    setResult(null);
  }

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
      clearComposer();
      setResult(data);
      await loadAureliaDrafts();
    } catch (error) {
      setResult({ error: error instanceof Error ? error.message : "Draft creation failed" });
    } finally {
      setCreating(false);
    }
  }

  const inputStyle = {
    width: "100%",
    padding: 12,
    borderRadius: 9,
    border: "1px solid #34404d",
    background: "#0d141c",
    color: "#e9edf1",
    boxSizing: "border-box" as const,
  };
  const labelStyle = { display: "block", marginBottom: 7, color: "#c6ced7", fontSize: 13, fontWeight: 700 };

  const createDisabled = creating || !shop || !taxonomyId || !title.trim() || !description.trim() || !price;

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
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "start" }}>
          <div>
            <p style={{ margin: 0, color: "#a99164", fontSize: 12, textTransform: "uppercase", letterSpacing: ".12em" }}>New Product → Etsy Draft</p>
            <h2 style={{ marginTop: 8 }}>Create a new listing draft</h2>
            <p style={{ color: "#8e99a7", lineHeight: 1.5 }}>Load a recent Aurelia handoff or start from a blank product. Completed drafts are managed below in Etsy Draft Lifecycle.</p>
          </div>
          <button type="button" onClick={clearComposer} style={{ padding: "9px 12px", borderRadius: 9, border: "1px solid #34404d", background: "#26313d", color: "#e9edf1", fontWeight: 700 }}>Clear / New Product</button>
        </div>

        <div style={{ marginBottom: 18, padding: 16, border: "1px solid #4b4432", borderRadius: 11, background: "#171812" }}>
          <label>
            <span style={{ ...labelStyle, color: "#d4b06f" }}>Aurelia · 5 most recent product drafts</span>
            <select style={inputStyle} value={selectedAureliaDraftId} onChange={(event) => loadAureliaDraft(event.target.value)}>
              <option value="">Start blank / choose an Aurelia draft…</option>
              {aureliaDrafts.map((draft) => (
                <option key={draft.id} value={draft.id}>{draft.title}</option>
              ))}
            </select>
          </label>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 12, marginTop: 8, color: "#8e99a7", fontSize: 12 }}>
            <span>Newest five only. A sixth handoff automatically pushes the oldest one out of this menu.</span>
            <button type="button" onClick={loadAureliaDrafts} style={{ border: 0, background: "transparent", color: "#d4b06f", cursor: "pointer", padding: 0 }}>Refresh</button>
          </div>
          {aureliaError && <p style={{ color: "#e08aa2", marginBottom: 0 }}>Aurelia feed: {aureliaError}</p>}
        </div>

        <div style={{ display: "grid", gap: 16 }}>
          <label><span style={labelStyle}>Title</span><input style={inputStyle} value={title} onChange={(event) => setTitle(event.target.value)} placeholder="New product title" /></label>
          <label><span style={labelStyle}>Description</span><textarea style={{ ...inputStyle, minHeight: 180, resize: "vertical" }} value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Buyer-facing product description" /></label>
          <label><span style={labelStyle}>Price (USD)</span><input style={inputStyle} value={price} onChange={(event) => setPrice(event.target.value)} placeholder="0.00" /></label>

          <div style={{ padding: 16, border: "1px solid #34404d", borderRadius: 11, background: "#0d141c" }}>
            <span style={labelStyle}>Smart Etsy category finder</span>
            <input style={inputStyle} value={categorySearch} onChange={(event) => setCategorySearch(event.target.value)} placeholder="Describe this product, e.g. stationery template" />
            {taxonomyError ? (
              <p style={{ color: "#e08aa2" }}>Category lookup failed: {taxonomyError}</p>
            ) : categorySearch && taxonomyOptions.length === 0 ? (
              <p style={{ color: "#8e99a7" }}>Loading Etsy seller taxonomy…</p>
            ) : (
              <div style={{ display: "grid", gap: 8, marginTop: 14 }}>
                {rankedCategories.map((option, index) => (
                  <button
                    key={option.id}
                    type="button"
                    onClick={() => setTaxonomyId(String(option.id))}
                    style={{
                      textAlign: "left",
                      padding: 12,
                      borderRadius: 9,
                      border: String(option.id) === taxonomyId ? "1px solid #a99164" : "1px solid #2b3743",
                      background: String(option.id) === taxonomyId ? "#1b2025" : "#111923",
                      color: "#e9edf1",
                      cursor: "pointer",
                    }}
                  >
                    <span style={{ fontWeight: 700 }}>{index === 0 ? "★ " : ""}{option.label}</span>
                    <span style={{ float: "right", color: index === 0 ? "#d4b06f" : "#8e99a7", fontSize: 11 }}>{relevanceLabel(option.score)}</span>
                  </button>
                ))}
              </div>
            )}
            {selectedCategory && <div style={{ marginTop: 12, color: "#d4b06f" }}>Selected: {selectedCategory.label}</div>}
          </div>

          <label><span style={labelStyle}>Tags · comma separated</span><input style={inputStyle} value={tags} onChange={(event) => setTags(event.target.value)} placeholder="tag one, tag two, tag three" /></label>
        </div>

        <button disabled={createDisabled} type="submit" style={{ marginTop: 20, padding: "12px 18px", border: 0, borderRadius: 10, background: "#6f263d", color: "white", fontWeight: 800, cursor: "pointer", opacity: createDisabled ? .55 : 1 }}>
          {creating ? "Creating Etsy Draft…" : "Send New Product to Etsy Drafts"}
        </button>

        {result?.error && <p style={{ color: "#e08aa2", marginTop: 16 }}>Draft failed: {result.error}</p>}
        {result?.listing && <div style={{ marginTop: 16, padding: 14, border: "1px solid #29533f", borderRadius: 10, background: "#15231d" }}>Sent to Etsy drafts successfully. Listing ID: {result.listing.listing_id}. Composer cleared for the next product.</div>}
      </form>
    </div>
  );
}
