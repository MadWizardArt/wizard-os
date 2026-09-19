"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";

type TaxonomyNode = { id: number; name: string; children?: TaxonomyNode[] };
type TaxonomyOption = { id: number; label: string; name: string; isLeaf: boolean };
function normalize(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function flattenTaxonomy(nodes: TaxonomyNode[], parents: string[] = []): TaxonomyOption[] {
  return nodes.flatMap((node) => {
    const path = [...parents, node.name];
    const children = node.children ?? [];
    return [
      { id: node.id, label: path.join(" › "), name: node.name, isLeaf: children.length === 0 },
      ...flattenTaxonomy(children, path),
    ];
  });
}

function scoreCategory(option: TaxonomyOption, query: string) {
  const q = normalize(query);
  const words = q.split(/\s+/).filter(Boolean);
  const label = normalize(option.label);
  const name = normalize(option.name);
  let score = option.isLeaf ? 10 : 0;
  if (q && name.includes(q)) score += 150;
  if (q && label.includes(q)) score += 100;
  for (const word of words) {
    if (name.includes(word)) score += 35;
    else if (label.includes(word)) score += 18;
  }
  return score;
}

export default function EtsyConsole() {
  const [creating, setCreating] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [price, setPrice] = useState("");
  const [tags, setTags] = useState("");
  const [taxonomyId, setTaxonomyId] = useState("");
  const [categorySearch, setCategorySearch] = useState("");
  const [taxonomy, setTaxonomy] = useState<TaxonomyNode[]>([]);
  const [taxonomyError, setTaxonomyError] = useState("");
  useEffect(() => {
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
    if (!categorySearch.trim()) return [];
    return taxonomyOptions
      .map((option) => ({ ...option, score: scoreCategory(option, categorySearch) }))
      .filter((option) => option.score > 20)
      .sort((a, b) => b.score - a.score || a.label.localeCompare(b.label))
      .slice(0, 5);
  }, [categorySearch, taxonomyOptions]);

  const selectedCategory = taxonomyOptions.find((option) => String(option.id) === taxonomyId);

  function reset() {
    setTitle("");
    setDescription("");
    setPrice("");
    setTags("");
    setTaxonomyId("");
    setCategorySearch("");
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
          tags: tags.split(",").map((tag) => tag.trim()).filter(Boolean).slice(0, 13),
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.details?.error || data.error || "Draft creation failed");
      setResult(data);
      const listingId = Number(data?.listing?.listing_id);
      reset();
      if (listingId) window.dispatchEvent(new CustomEvent("warlock:draft-created", { detail: { listingId } }));
    } catch (error) {
      setResult({ error: error instanceof Error ? error.message : "Draft creation failed" });
    } finally {
      setCreating(false);
    }
  }

  const input = {
    width: "100%",
    padding: 11,
    borderRadius: 8,
    border: "1px solid #34404d",
    background: "#0d141c",
    color: "#e9edf1",
    boxSizing: "border-box" as const,
  };
  const label = { display: "block", marginBottom: 6, color: "#c6ced7", fontSize: 12, fontWeight: 700 } as const;
  const canCreate = !creating && !!taxonomyId && !!title.trim() && !!description.trim() && !!price;

  return (
    <details style={{ marginTop: 14, border: "1px solid #26313d", borderRadius: 13, background: "#101821", overflow: "hidden" }}>
      <summary style={{ cursor: "pointer", padding: "16px 18px", fontWeight: 800, color: "#e9edf1", userSelect: "none" }}>
        + New Etsy Draft
      </summary>
      <form onSubmit={createDraft} style={{ padding: "0 18px 18px", display: "grid", gap: 13 }}>
        <label><span style={label}>Title</span><input style={input} value={title} onChange={(event) => setTitle(event.target.value)} /></label>
        <label><span style={label}>Description</span><textarea style={{ ...input, minHeight: 130, resize: "vertical" }} value={description} onChange={(event) => setDescription(event.target.value)} /></label>

        <div style={{ display: "grid", gridTemplateColumns: "minmax(100px, 150px) minmax(0, 1fr)", gap: 10 }}>
          <label><span style={label}>Price</span><input style={input} value={price} onChange={(event) => setPrice(event.target.value)} placeholder="0.00" /></label>
          <label><span style={label}>Tags</span><input style={input} value={tags} onChange={(event) => setTags(event.target.value)} placeholder="tag one, tag two…" /></label>
        </div>

        <div>
          <label><span style={label}>Category</span><input style={input} value={categorySearch} onChange={(event) => setCategorySearch(event.target.value)} placeholder="Search Etsy categories…" /></label>
          {taxonomyError && <p style={{ color: "#e08aa2", fontSize: 12, marginBottom: 0 }}>{taxonomyError}</p>}
          {categorySearch && rankedCategories.length > 0 && (
            <div style={{ display: "grid", gap: 6, marginTop: 8 }}>
              {rankedCategories.map((option) => (
                <button
                  key={option.id}
                  type="button"
                  onClick={() => setTaxonomyId(String(option.id))}
                  style={{ textAlign: "left", padding: "9px 10px", borderRadius: 8, border: String(option.id) === taxonomyId ? "1px solid #a99164" : "1px solid #2b3743", background: String(option.id) === taxonomyId ? "#1b2025" : "#0d141c", color: "#e9edf1", cursor: "pointer" }}
                >
                  {option.label}
                </button>
              ))}
            </div>
          )}
          {selectedCategory && <div style={{ marginTop: 8, color: "#d4b06f", fontSize: 12 }}>Selected: {selectedCategory.label}</div>}
        </div>

        <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <button type="button" onClick={() => { reset(); setResult(null); }} style={{ border: 0, background: "transparent", color: "#8e99a7", cursor: "pointer", padding: 0 }}>Clear</button>
          <button disabled={!canCreate} type="submit" style={{ padding: "10px 14px", border: 0, borderRadius: 9, background: "#6f263d", color: "white", fontWeight: 800, cursor: canCreate ? "pointer" : "default", opacity: canCreate ? 1 : .5 }}>
            {creating ? "Creating…" : "Create Etsy Draft"}
          </button>
        </div>

        {result?.error && <p style={{ color: "#e08aa2", fontSize: 12, margin: 0 }}>{result.error}</p>}
        {result?.listing && <p style={{ color: "#9bc8aa", fontSize: 12, margin: 0 }}>Draft {result.listing.listing_id} created and loaded into the lifecycle.</p>}
      </form>
    </details>
  );
}
