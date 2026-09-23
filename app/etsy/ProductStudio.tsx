"use client";

import { useEffect, useState } from "react";

type Variant = { id: string; fulfillment: "DIGITAL" | "PHYSICAL"; label: string; printfulVariantId: number | null; printfulProductId: number | null; etsyListingId: string | null };
type Product = { id: string; title: string; collection: string; description: string; artworkReference: string; notes: string; status: string; variants: Variant[] };
type Form = Pick<Product, "title" | "collection" | "description" | "artworkReference" | "notes" | "status">;
const blank: Form = { title: "", collection: "", description: "", artworkReference: "", notes: "", status: "DESIGN" };
const statuses = ["DESIGN", "PRODUCTION", "PRICING", "LISTING", "READY"];
const surface: React.CSSProperties = { border: "1px solid #33414a", background: "#141d25", padding: 18, borderRadius: 13 };
const input: React.CSSProperties = { boxSizing: "border-box", background: "#10171e", color: "#f1ecde", border: "1px solid #53616a", borderRadius: 8, padding: "10px 12px", width: "100%" };
const btn: React.CSSProperties = { background: "#a98b58", border: 0, borderRadius: 8, padding: "10px 14px", fontWeight: 750, color: "#10151b", cursor: "pointer" };

export default function ProductStudio() {
  const [products, setProducts] = useState<Product[]>([]);
  const [form, setForm] = useState<Form>(blank);
  const [editId, setEditId] = useState("");
  const [selectedId, setSelectedId] = useState("");
  const [variantLabel, setVariantLabel] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  async function reload() {
    try {
      const response = await fetch("/api/warlock/products", { cache: "no-store" });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Products unavailable");
      setProducts(payload.products || []);
      setError("");
    } catch (e) {
      setError(e instanceof Error && e.message === "artist_session_required"
        ? "Unlock your private Artist Gate in the Museum to manage Spellmark products."
        : "Product records are unavailable. No substitute or demo data is shown.");
    } finally { setLoading(false); }
  }
  useEffect(() => {
    void reload();
    const updated = () => { void reload(); };
    window.addEventListener("warlock:products-changed", updated);
    return () => window.removeEventListener("warlock:products-changed", updated);
  }, []);

  function edit(product: Product) {
    setEditId(product.id);
    setSelectedId(product.id);
    setForm({ title: product.title, collection: product.collection, description: product.description, artworkReference: product.artworkReference, notes: product.notes, status: product.status });
    setNotice(""); setError("");
  }
  async function save(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true); setNotice(""); setError("");
    try {
      const response = await fetch(editId ? `/api/warlock/products/${editId}` : "/api/warlock/products", {
        method: editId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "save_failed");
      setSelectedId(payload.product.id); setEditId(payload.product.id);
      setNotice(editId ? "Master product updated." : "Master product created. You can now attach digital or Printful variants.");
      await reload();
      window.dispatchEvent(new Event("warlock:products-changed"));
    } catch (e) { setError(e instanceof Error ? e.message : "Could not save product."); }
    finally { setBusy(false); }
  }
  async function addDigital() {
    if (!selectedId || !variantLabel.trim()) return;
    setBusy(true); setError(""); setNotice("");
    try {
      const response = await fetch(`/api/warlock/products/${selectedId}/variants`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fulfillment: "DIGITAL", label: variantLabel }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "variant_save_failed");
      setVariantLabel(""); setNotice("Digital format added. Existing Etsy digital draft tools remain available in Listings.");
      await reload();
      window.dispatchEvent(new Event("warlock:products-changed"));
    } catch (e) { setError(e instanceof Error ? e.message : "Could not add digital format."); }
    finally { setBusy(false); }
  }
  return <section style={{ display: "grid", gap: 18 }}>
    <div style={surface}>
      <p style={{ color: "#cdb687", fontSize: 11, letterSpacing: 2, margin: 0 }}>SPELLMARK · MASTER CATALOG</p>
      <h2 style={{ fontFamily: "Georgia, serif", fontWeight: 400, fontSize: 29 }}>One artwork, many editions.</h2>
      <p style={{ color: "#adb7b5", lineHeight: 1.6 }}>The product owns the artwork and collection. Digital files, Printful variants, and future Etsy listing IDs remain separate fulfillment records. No listings or orders are created here.</p>
      {error && <p role="alert" style={{ color: "#ecaeac" }}>{error}</p>}
      {notice && <p role="status" style={{ color: "#abd8c1" }}>{notice}</p>}
      <form onSubmit={save} style={{ display: "grid", gap: 13 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
          <strong>{editId ? "Edit master product" : "Create master product"}</strong>
          <button type="button" style={{ ...btn, background: "#29343b", color: "#d3dbd6" }} onClick={() => { setEditId(""); setForm(blank); setNotice(""); }}>+ New product</button>
        </div>
        <label>Artwork / product title<input style={input} required maxLength={140} value={form.title} onChange={e => setForm(p => ({ ...p, title: e.target.value }))} placeholder="Volans Aethereus — The Owl" /></label>
        <label>Collection<input style={input} maxLength={100} value={form.collection} onChange={e => setForm(p => ({ ...p, collection: e.target.value }))} placeholder="Cabinet of Curiosities" /></label>
        <label>Description<textarea style={{ ...input, minHeight: 80 }} maxLength={6000} value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))} /></label>
        <label>Artwork reference / asset location<input style={input} maxLength={500} value={form.artworkReference} onChange={e => setForm(p => ({ ...p, artworkReference: e.target.value }))} placeholder="Reference ID, asset path, or creative file label" /></label>
        <label>Production notes<textarea style={{ ...input, minHeight: 55 }} maxLength={4000} value={form.notes} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))} /></label>
        <label>Workflow stage<select style={input} value={form.status} onChange={e => setForm(p => ({ ...p, status: e.target.value }))}>{statuses.map(s => <option key={s} value={s}>{s.toLowerCase().replace(/^./, c => c.toUpperCase())}</option>)}</select></label>
        <button type="submit" style={btn} disabled={busy || !form.title.trim()}>{busy ? "Saving…" : editId ? "Save changes" : "Create product"}</button>
      </form>
    </div>
    <div style={surface}>
      <h2 style={{ fontFamily: "Georgia, serif", marginTop: 0 }}>The collection</h2>
      {loading && <p>Loading real products…</p>}
      {!loading && !error && !products.length && <p style={{ color: "#adb7b5" }}>No Spellmark master products yet. Create the owl above to begin.</p>}
      <div style={{ display: "grid", gap: 10 }}>
        {products.map(p => <article key={p.id} style={{ padding: 14, border: p.id === selectedId ? "1px solid #b79a65" : "1px solid #34434c", borderRadius: 10, background: "#0e161d" }}>
          <button onClick={() => edit(p)} style={{ display: "block", width: "100%", textAlign: "left", border: 0, background: "transparent", color: "#ede5d5", cursor: "pointer", padding: 0 }}>
            <span style={{ fontSize: 11, letterSpacing: 1.4, color: "#cbb487" }}>{p.collection || "Unassigned"} · {p.status}</span>
            <h3 style={{ margin: "7px 0", fontFamily: "Georgia, serif", fontSize: 22 }}>{p.title}</h3>
            <small style={{ color: "#adb7b5" }}>Edit product and formats →</small>
          </button>
          {p.variants.length ? <div style={{ display: "flex", flexWrap: "wrap", gap: 7, marginTop: 10 }}>{p.variants.map(v => <span key={v.id} style={{ border: "1px solid #435450", borderRadius: 7, padding: "6px 8px", fontSize: 12 }}>{v.fulfillment === "PHYSICAL" ? "Printful" : "Digital"} · {v.label}{v.printfulVariantId ? ` · #${v.printfulVariantId}` : ""}</span>)}</div> : <p style={{ color: "#8caaa1", fontSize: 12 }}>No editions linked yet.</p>}
        </article>)}
      </div>
      {selectedId && <div style={{ borderTop: "1px solid #34434c", marginTop: 18, paddingTop: 16 }}>
        <h3 style={{ fontFamily: "Georgia, serif", marginTop: 0 }}>Add a digital edition</h3>
        <p style={{ color: "#adb7b5", fontSize: 13 }}>For physical prints, open Production and save an exact Printful catalog variant to this master product.</p>
        <label>Edition label<input style={input} maxLength={140} value={variantLabel} onChange={e => setVariantLabel(e.target.value)} placeholder="8-print digital folio / printable artwork" /></label>
        <button type="button" style={{ ...btn, marginTop: 12 }} disabled={busy || !variantLabel.trim()} onClick={() => void addDigital()}>Add digital edition</button>
      </div>}
    </div>
  </section>;
}
