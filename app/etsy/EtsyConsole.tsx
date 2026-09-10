"use client";

import { FormEvent, useEffect, useState } from "react";

const initialDescription = `Professional print shop work order and production ticket system designed for small print shops, copy centers, sign shops, and creative production teams.\n\nBuilt from real print-production workflow experience, this digital system helps organize incoming jobs, specifications, production steps, quality checks, and completion.\n\nThis listing is for a digital download. No physical item will be shipped.`;

export default function EtsyConsole() {
  const [shop, setShop] = useState<any>(null);
  const [shopError, setShopError] = useState("");
  const [creating, setCreating] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [title, setTitle] = useState("Print Shop Work Order + Production Ticket System | Printable Job Ticket");
  const [description, setDescription] = useState(initialDescription);
  const [price, setPrice] = useState("14.00");
  const [taxonomyId, setTaxonomyId] = useState("");
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
  }, []);

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
        <p style={{ color: "#8e99a7", lineHeight: 1.5 }}>This button creates an Etsy draft only. It does not publish the listing.</p>

        <div style={{ display: "grid", gap: 16 }}>
          <label><span style={labelStyle}>Title</span><input style={inputStyle} value={title} onChange={(e) => setTitle(e.target.value)} /></label>
          <label><span style={labelStyle}>Description</span><textarea style={{ ...inputStyle, minHeight: 180, resize: "vertical" }} value={description} onChange={(e) => setDescription(e.target.value)} /></label>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
            <label><span style={labelStyle}>Price (USD)</span><input style={inputStyle} value={price} onChange={(e) => setPrice(e.target.value)} /></label>
            <label><span style={labelStyle}>Etsy taxonomy ID</span><input required inputMode="numeric" style={inputStyle} value={taxonomyId} onChange={(e) => setTaxonomyId(e.target.value)} placeholder="Required before draft creation" /></label>
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
