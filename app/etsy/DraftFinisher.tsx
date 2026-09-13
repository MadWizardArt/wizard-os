"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";

type EtsyMoney = {
  amount?: number;
  divisor?: number;
};

type EtsyListing = {
  listing_id: number;
  title?: string;
  description?: string;
  state?: string;
  creation_timestamp?: number;
  price?: EtsyMoney | number | string;
  tags?: string[];
};

type Readiness = {
  imageCount: number;
  fileCount: number;
  hasImage: boolean;
  hasDigitalFile: boolean;
  readyForHumanReview: boolean;
};

function messageFrom(data: any, fallback: string) {
  return data?.details?.error || data?.error || fallback;
}

function priceToString(price: EtsyListing["price"]) {
  if (price == null) return "";
  if (typeof price === "number") return price.toFixed(2);
  if (typeof price === "string") return price;
  const amount = Number(price.amount ?? 0);
  const divisor = Number(price.divisor ?? 100) || 100;
  return (amount / divisor).toFixed(2);
}

export default function DraftFinisher() {
  const [drafts, setDrafts] = useState<EtsyListing[]>([]);
  const [listingId, setListingId] = useState("");
  const [loadedListing, setLoadedListing] = useState<EtsyListing | null>(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [price, setPrice] = useState("");
  const [tags, setTags] = useState("");
  const [readiness, setReadiness] = useState<Readiness | null>(null);
  const [busy, setBusy] = useState("");
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  async function loadDrafts(preferredId?: string) {
    setError("");
    const response = await fetch("/api/etsy/listings?state=draft", { cache: "no-store" });
    const data = await response.json();
    if (!response.ok) throw new Error(messageFrom(data, "Unable to load Etsy drafts"));

    const results = ((data.results ?? []) as EtsyListing[]).sort(
      (a, b) => (b.creation_timestamp ?? 0) - (a.creation_timestamp ?? 0)
    );
    setDrafts(results);

    const desired = preferredId ?? listingId;
    if (desired && results.some((draft) => String(draft.listing_id) === desired)) return;

    const nextId = results[0]?.listing_id ? String(results[0].listing_id) : "";
    setListingId(nextId);
    if (!nextId) {
      setLoadedListing(null);
      setTitle("");
      setDescription("");
      setPrice("");
      setTags("");
      setReadiness(null);
    }
  }

  async function loadSelectedListing(id: string) {
    if (!id) return;
    setBusy("loading");
    setNotice("");
    setError("");
    try {
      const response = await fetch(`/api/etsy/listings/${id}`, { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(messageFrom(data, "Unable to load selected Etsy listing"));
      const listing = data.listing as EtsyListing;
      setLoadedListing(listing);
      setTitle(listing.title ?? "");
      setDescription(listing.description ?? "");
      setPrice(priceToString(listing.price));
      setTags((listing.tags ?? []).join(", "));
      await refreshReadiness(id);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to load selected Etsy listing");
    } finally {
      setBusy("");
    }
  }

  async function refreshReadiness(id = listingId) {
    if (!id) return;
    const response = await fetch(`/api/etsy/listings/${id}/status`, { cache: "no-store" });
    const data = await response.json();
    if (!response.ok) throw new Error(messageFrom(data, "Unable to check draft readiness"));
    setReadiness(data);
  }

  async function syncWithEtsy() {
    setBusy("sync");
    setNotice("");
    setError("");
    try {
      const currentId = listingId;
      await loadDrafts(currentId);
      setNotice("Warlock synced the draft queue with Etsy.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to sync Etsy drafts");
    } finally {
      setBusy("");
    }
  }

  useEffect(() => {
    loadDrafts().catch((e) => setError(e.message));
  }, []);

  useEffect(() => {
    setReadiness(null);
    setLoadedListing(null);
    if (listingId) loadSelectedListing(listingId);
  }, [listingId]);

  const selectedDraft = useMemo(
    () => drafts.find((draft) => String(draft.listing_id) === listingId),
    [drafts, listingId]
  );

  async function saveMetadata(event: FormEvent) {
    event.preventDefault();
    if (!listingId || loadedListing?.state !== "draft") return;
    setBusy("metadata");
    setNotice("");
    setError("");
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
      setNotice("Listing metadata saved to this Etsy draft.");
      await loadDrafts(listingId);
      await loadSelectedListing(listingId);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Metadata update failed");
    } finally {
      setBusy("");
    }
  }

  async function uploadAsset(kind: "image" | "file", file: File | undefined) {
    if (!listingId || !file || loadedListing?.state !== "draft") return;
    setBusy(kind);
    setNotice("");
    setError("");
    try {
      const body = new FormData();
      body.set(kind, file);
      if (kind === "image") body.set("rank", String((readiness?.imageCount ?? 0) + 1));
      const response = await fetch(
        `/api/etsy/listings/${listingId}/${kind === "image" ? "images" : "files"}`,
        { method: "POST", body }
      );
      const data = await response.json();
      if (!response.ok) throw new Error(messageFrom(data, `${kind} upload failed`));
      setNotice(kind === "image" ? "Listing image uploaded to Etsy." : "Digital customer file uploaded to Etsy.");
      await refreshReadiness();
    } catch (e) {
      setError(e instanceof Error ? e.message : `${kind} upload failed`);
    } finally {
      setBusy("");
    }
  }

  const box = { padding: 20, border: "1px solid #26313d", borderRadius: 14, background: "#111923" } as const;
  const input = { width: "100%", padding: 12, borderRadius: 9, border: "1px solid #34404d", background: "#0d141c", color: "#e9edf1", boxSizing: "border-box" as const };
  const label = { display: "block", marginBottom: 7, color: "#c6ced7", fontSize: 13, fontWeight: 700 } as const;
  const button = { padding: "11px 16px", border: 0, borderRadius: 9, background: "#6f263d", color: "white", fontWeight: 800, cursor: "pointer" } as const;
  const secondaryButton = { ...button, background: "#26313d" } as const;
  const locked = !listingId || !loadedListing || loadedListing.state !== "draft" || !!busy;

  return (
    <section style={{ ...box, marginTop: 22 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 16, alignItems: "start" }}>
        <div>
          <p style={{ margin: 0, color: "#a99164", fontSize: 12, textTransform: "uppercase", letterSpacing: ".12em" }}>Warlock · Listing Studio</p>
          <h2 style={{ marginTop: 8, marginBottom: 8 }}>Etsy Draft Lifecycle</h2>
          <p style={{ color: "#8e99a7", lineHeight: 1.55, marginBottom: 0 }}>
            Select any Etsy product draft. Warlock loads that exact listing before allowing edits, uploads, or review.
          </p>
        </div>
        <button type="button" onClick={syncWithEtsy} disabled={!!busy} style={{ ...secondaryButton, opacity: busy ? .55 : 1 }}>
          {busy === "sync" ? "Syncing…" : "Sync with Etsy"}
        </button>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 12, marginTop: 20, alignItems: "end" }}>
        <label><span style={label}>Etsy draft</span>
          <select style={input} value={listingId} onChange={(e) => setListingId(e.target.value)}>
            <option value="">Choose a draft…</option>
            {drafts.map((draft) => (
              <option key={draft.listing_id} value={draft.listing_id}>{draft.title || "Untitled draft"} · {draft.listing_id}</option>
            ))}
          </select>
        </label>
        <div style={{ padding: "11px 12px", borderRadius: 9, background: "#0d141c", border: "1px solid #34404d", color: "#c6ced7", minWidth: 110, textAlign: "center" }}>
          {drafts.length} draft{drafts.length === 1 ? "" : "s"}
        </div>
      </div>

      {selectedDraft && (
        <div style={{ marginTop: 12, padding: 12, borderRadius: 9, background: "#0d141c", border: "1px solid #2b3743", fontSize: 12, color: "#8e99a7" }}>
          <strong style={{ color: "#c6ced7" }}>Selected:</strong> {selectedDraft.title || "Untitled draft"} · ID {selectedDraft.listing_id}
          {loadedListing?.state && <> · Etsy state: <strong style={{ color: "#d4b06f" }}>{loadedListing.state}</strong></>}
        </div>
      )}

      {!listingId && drafts.length === 0 && (
        <div style={{ marginTop: 18, padding: 16, borderRadius: 11, border: "1px solid #34404d", background: "#0d141c", color: "#8e99a7" }}>
          No Etsy drafts are currently waiting in Warlock. If a listing was published or moved out of draft state, it will no longer appear here after sync.
        </div>
      )}

      <form onSubmit={saveMetadata} style={{ display: "grid", gap: 14, marginTop: 18 }}>
        <label><span style={label}>Listing title</span><input style={input} value={title} disabled={!loadedListing || busy === "loading"} onChange={(e) => setTitle(e.target.value)} /></label>
        <label><span style={label}>Buyer-facing description</span><textarea style={{ ...input, minHeight: 310, resize: "vertical" }} value={description} disabled={!loadedListing || busy === "loading"} onChange={(e) => setDescription(e.target.value)} /></label>
        <div style={{ display: "grid", gridTemplateColumns: "160px 1fr", gap: 12 }}>
          <label><span style={label}>Price</span><input style={input} value={price} disabled={!loadedListing || busy === "loading"} onChange={(e) => setPrice(e.target.value)} /></label>
          <label><span style={label}>Up to 13 Etsy tags · comma separated</span><input style={input} value={tags} disabled={!loadedListing || busy === "loading"} onChange={(e) => setTags(e.target.value)} /></label>
        </div>
        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <button type="submit" disabled={locked} style={{ ...button, opacity: locked ? .55 : 1 }}>
            {busy === "metadata" ? "Saving…" : "Save Metadata to Selected Draft"}
          </button>
          <span style={{ color: "#8e99a7", fontSize: 12 }}>
            The old Product 01 SEO preset has been disabled so one product can never overwrite another.
          </span>
        </div>
      </form>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginTop: 22 }}>
        <div style={{ padding: 16, borderRadius: 11, border: "1px solid #34404d", background: "#0d141c" }}>
          <strong>Listing images</strong>
          <p style={{ color: "#8e99a7", fontSize: 13 }}>Uploads attach only to the currently selected Etsy draft.</p>
          <input type="file" accept="image/jpeg,image/png,image/gif" disabled={locked} onChange={(e) => { const file = e.target.files?.[0]; uploadAsset("image", file); e.currentTarget.value = ""; }} />
        </div>
        <div style={{ padding: 16, borderRadius: 11, border: "1px solid #34404d", background: "#0d141c" }}>
          <strong>Customer download</strong>
          <p style={{ color: "#8e99a7", fontSize: 13 }}>Upload the customer-ready PDF or ZIP directly to this listing. Sellable files never enter the public repository.</p>
          <input type="file" accept=".pdf,.zip,.png,.jpg,.jpeg" disabled={locked} onChange={(e) => { const file = e.target.files?.[0]; uploadAsset("file", file); e.currentTarget.value = ""; }} />
        </div>
      </div>

      <div style={{ marginTop: 18, padding: 16, borderRadius: 11, border: "1px solid #4b4432", background: "#171812" }}>
        <strong style={{ color: "#d4b06f" }}>Lifecycle checkpoint · Final review</strong>
        {!readiness ? <p style={{ color: "#8e99a7" }}>Select a draft to check Etsy assets.</p> : <>
          <p style={{ marginBottom: 6 }}>Images: {readiness.imageCount} {readiness.hasImage ? "✓" : "— needs at least one"}</p>
          <p style={{ marginTop: 0 }}>Digital files: {readiness.fileCount} {readiness.hasDigitalFile ? "✓" : "— customer file required"}</p>
          <div style={{ fontWeight: 800, color: readiness.readyForHumanReview ? "#9bc8aa" : "#d4b06f" }}>
            {readiness.readyForHumanReview ? "READY FOR FINAL HUMAN REVIEW" : "NOT READY FOR FINAL REVIEW"}
          </div>
        </>}
      </div>

      {notice && <p style={{ color: "#9bc8aa", marginTop: 16 }}>{notice}</p>}
      {error && <p style={{ color: "#e08aa2", marginTop: 16 }}>Warlock: {error}</p>}
      <p style={{ color: "#8e99a7", fontSize: 12, marginTop: 18 }}>
        Current lifecycle: Create → Etsy Draft → Asset Completion → Final Review → Publish. Publishing remains locked behind a separate explicit approval.
      </p>
    </section>
  );
}
