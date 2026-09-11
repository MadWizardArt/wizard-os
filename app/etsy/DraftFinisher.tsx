"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";

type EtsyListing = {
  listing_id: number;
  title?: string;
  state?: string;
  creation_timestamp?: number;
};

type Readiness = {
  imageCount: number;
  fileCount: number;
  hasImage: boolean;
  hasDigitalFile: boolean;
  readyForHumanReview: boolean;
};

const optimizedTitle = "Print Shop Work Order Template | Production Job Ticket | Printable Business Form | Digital Download";
const optimizedDescription = `Keep print jobs organized from intake through production with a practical work order and production ticket system built for small print shops, copy centers, sign shops, and creative production teams.

This printable digital download is designed to help you capture job details clearly, track production steps, reduce missed specifications, and create a more consistent handoff from customer request to finished order.

WHAT'S INCLUDED
• Print Shop Work Order
• Production Ticket
• Job specifications and customer details
• Production workflow checkpoints
• Quality-control and completion fields

IDEAL FOR
• Independent print shops
• Copy and production centers
• Sign and graphics shops
• Freelance print professionals
• Small creative studios

WHY IT WORKS
This system was informed by real print-production workflow experience rather than a generic planner format. It is intentionally straightforward, practical, and easy to integrate into an existing shop process.

DIGITAL PRODUCT
This listing is for a digital download. No physical product will be shipped. Print at home, at your shop, or through a local print provider.

Please review your printer settings and scale before producing multiple copies. For personal or internal business use only; resale or redistribution of the files is not permitted.`;

const optimizedTags = [
  "print shop template",
  "work order form",
  "production ticket",
  "job ticket printable",
  "business form",
  "printable template",
  "small business form",
  "print shop form",
  "order form template",
  "production form",
  "workflow template",
  "digital download",
  "job order form",
];

function messageFrom(data: any, fallback: string) {
  return data?.details?.error || data?.error || fallback;
}

export default function DraftFinisher() {
  const [drafts, setDrafts] = useState<EtsyListing[]>([]);
  const [listingId, setListingId] = useState("");
  const [title, setTitle] = useState(optimizedTitle);
  const [description, setDescription] = useState(optimizedDescription);
  const [price, setPrice] = useState("14.00");
  const [tags, setTags] = useState(optimizedTags.join(","));
  const [readiness, setReadiness] = useState<Readiness | null>(null);
  const [busy, setBusy] = useState("");
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  async function loadDrafts() {
    setError("");
    const response = await fetch("/api/etsy/listings?state=draft", { cache: "no-store" });
    const data = await response.json();
    if (!response.ok) throw new Error(messageFrom(data, "Unable to load Etsy drafts"));
    const results = (data.results ?? []) as EtsyListing[];
    results.sort((a, b) => (b.creation_timestamp ?? 0) - (a.creation_timestamp ?? 0));
    setDrafts(results);
    if (!listingId && results[0]?.listing_id) setListingId(String(results[0].listing_id));
  }

  async function refreshReadiness(id = listingId) {
    if (!id) return;
    const response = await fetch(`/api/etsy/listings/${id}/status`, { cache: "no-store" });
    const data = await response.json();
    if (!response.ok) throw new Error(messageFrom(data, "Unable to check draft readiness"));
    setReadiness(data);
  }

  useEffect(() => {
    loadDrafts().catch((e) => setError(e.message));
  }, []);

  useEffect(() => {
    setReadiness(null);
    if (listingId) refreshReadiness(listingId).catch((e) => setError(e.message));
  }, [listingId]);

  const selectedDraft = useMemo(() => drafts.find((draft) => String(draft.listing_id) === listingId), [drafts, listingId]);

  async function saveMetadata(event: FormEvent) {
    event.preventDefault();
    if (!listingId) return;
    setBusy("metadata"); setNotice(""); setError("");
    try {
      const response = await fetch(`/api/etsy/listings/${listingId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          description,
          price: Number(price),
          quantity: 999,
          tags: tags.split(",").map((tag) => tag.trim()).filter(Boolean).slice(0, 13),
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(messageFrom(data, "Metadata update failed"));
      setNotice("SEO metadata saved to the Etsy draft.");
      await loadDrafts();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Metadata update failed");
    } finally { setBusy(""); }
  }

  async function uploadAsset(kind: "image" | "file", file: File | undefined) {
    if (!listingId || !file) return;
    setBusy(kind); setNotice(""); setError("");
    try {
      const body = new FormData();
      body.set(kind, file);
      if (kind === "image") body.set("rank", String((readiness?.imageCount ?? 0) + 1));
      const response = await fetch(`/api/etsy/listings/${listingId}/${kind === "image" ? "images" : "files"}`, { method: "POST", body });
      const data = await response.json();
      if (!response.ok) throw new Error(messageFrom(data, `${kind} upload failed`));
      setNotice(kind === "image" ? "Listing image uploaded to Etsy." : "Digital customer file uploaded to Etsy.");
      await refreshReadiness();
    } catch (e) {
      setError(e instanceof Error ? e.message : `${kind} upload failed`);
    } finally { setBusy(""); }
  }

  const box = { padding: 20, border: "1px solid #26313d", borderRadius: 14, background: "#111923" } as const;
  const input = { width: "100%", padding: 12, borderRadius: 9, border: "1px solid #34404d", background: "#0d141c", color: "#e9edf1", boxSizing: "border-box" as const };
  const label = { display: "block", marginBottom: 7, color: "#c6ced7", fontSize: 13, fontWeight: 700 } as const;
  const button = { padding: "11px 16px", border: 0, borderRadius: 9, background: "#6f263d", color: "white", fontWeight: 800, cursor: "pointer" } as const;

  return (
    <section style={{ ...box, marginTop: 22 }}>
      <p style={{ margin: 0, color: "#a99164", fontSize: 12, textTransform: "uppercase", letterSpacing: ".12em" }}>Warlock · Draft Finisher</p>
      <h2 style={{ marginTop: 8, marginBottom: 8 }}>Prepare for Final Review</h2>
      <p style={{ color: "#8e99a7", lineHeight: 1.55 }}>Finish an existing Etsy draft with optimized metadata, listing images, and the customer download. This panel has no publish action.</p>

      <label><span style={label}>Etsy draft</span>
        <select style={input} value={listingId} onChange={(e) => setListingId(e.target.value)}>
          <option value="">Choose a draft…</option>
          {drafts.map((draft) => <option key={draft.listing_id} value={draft.listing_id}>{draft.title || "Untitled draft"} · {draft.listing_id}</option>)}
        </select>
      </label>
      {selectedDraft && <p style={{ color: "#8e99a7", fontSize: 12 }}>Selected listing ID: {selectedDraft.listing_id}</p>}

      <form onSubmit={saveMetadata} style={{ display: "grid", gap: 14, marginTop: 18 }}>
        <label><span style={label}>SEO title</span><input style={input} value={title} onChange={(e) => setTitle(e.target.value)} /></label>
        <label><span style={label}>Buyer-focused description</span><textarea style={{ ...input, minHeight: 310, resize: "vertical" }} value={description} onChange={(e) => setDescription(e.target.value)} /></label>
        <div style={{ display: "grid", gridTemplateColumns: "160px 1fr", gap: 12 }}>
          <label><span style={label}>Price</span><input style={input} value={price} onChange={(e) => setPrice(e.target.value)} /></label>
          <label><span style={label}>13 Etsy tags · comma separated</span><input style={input} value={tags} onChange={(e) => setTags(e.target.value)} /></label>
        </div>
        <button type="submit" disabled={!listingId || !!busy} style={{ ...button, opacity: !listingId || busy ? .55 : 1, justifySelf: "start" }}>{busy === "metadata" ? "Saving…" : "Apply SEO Pass to Draft"}</button>
      </form>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginTop: 22 }}>
        <div style={{ padding: 16, borderRadius: 11, border: "1px solid #34404d", background: "#0d141c" }}>
          <strong>Listing images</strong>
          <p style={{ color: "#8e99a7", fontSize: 13 }}>Upload polished Spellmark thumbnails/mockups one at a time. First image becomes the primary listing image.</p>
          <input type="file" accept="image/jpeg,image/png,image/gif" disabled={!listingId || !!busy} onChange={(e) => { const file = e.target.files?.[0]; uploadAsset("image", file); e.currentTarget.value = ""; }} />
        </div>
        <div style={{ padding: 16, borderRadius: 11, border: "1px solid #34404d", background: "#0d141c" }}>
          <strong>Customer download</strong>
          <p style={{ color: "#8e99a7", fontSize: 13 }}>Upload the final customer-ready PDF or ZIP directly from your browser to Etsy. It is never committed to the public Wizard OS repository.</p>
          <input type="file" accept=".pdf,.zip,.png,.jpg,.jpeg" disabled={!listingId || !!busy} onChange={(e) => { const file = e.target.files?.[0]; uploadAsset("file", file); e.currentTarget.value = ""; }} />
        </div>
      </div>

      <div style={{ marginTop: 18, padding: 16, borderRadius: 11, border: "1px solid #4b4432", background: "#171812" }}>
        <strong style={{ color: "#d4b06f" }}>Pre-publish readiness</strong>
        {!readiness ? <p style={{ color: "#8e99a7" }}>Select a draft to check Etsy assets.</p> : <>
          <p style={{ marginBottom: 6 }}>Images: {readiness.imageCount} {readiness.hasImage ? "✓" : "— needs at least one"}</p>
          <p style={{ marginTop: 0 }}>Digital files: {readiness.fileCount} {readiness.hasDigitalFile ? "✓" : "— customer file required"}</p>
          <div style={{ fontWeight: 800, color: readiness.readyForHumanReview ? "#9bc8aa" : "#d4b06f" }}>{readiness.readyForHumanReview ? "READY FOR BRANDON'S FINAL REVIEW" : "NOT READY FOR FINAL REVIEW"}</div>
        </>}
      </div>

      {notice && <p style={{ color: "#9bc8aa", marginTop: 16 }}>{notice}</p>}
      {error && <p style={{ color: "#e08aa2", marginTop: 16 }}>Warlock: {error}</p>}
      <p style={{ color: "#8e99a7", fontSize: 12, marginTop: 18 }}>Publication remains locked. Final activation must be a separate explicit approval after you inspect the Etsy draft.</p>
    </section>
  );
}
