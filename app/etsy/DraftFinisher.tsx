"use client";

import { FormEvent, useEffect, useState } from "react";

type EtsyMoney = { amount?: number; divisor?: number };
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
    const results = ((data.results ?? []) as EtsyListing[]).sort((a, b) => (b.creation_timestamp ?? 0) - (a.creation_timestamp ?? 0));
    setDrafts(results);
    const desired = preferredId ?? listingId;
    if (desired && results.some((draft) => String(draft.listing_id) === desired)) {
      setListingId(desired);
      return;
    }
    setListingId(results[0]?.listing_id ? String(results[0].listing_id) : "");
  }

  async function refreshReadiness(id = listingId) {
    if (!id) return;
    const response = await fetch(`/api/etsy/listings/${id}/status`, { cache: "no-store" });
    const data = await response.json();
    if (!response.ok) throw new Error(messageFrom(data, "Unable to check draft readiness"));
    setReadiness(data);
  }

  async function loadSelectedListing(id: string) {
    if (!id) {
      setLoadedListing(null);
      setReadiness(null);
      return;
    }
    setBusy("loading");
    setNotice("");
    setError("");
    try {
      const response = await fetch(`/api/etsy/listings/${id}`, { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(messageFrom(data, "Unable to load Etsy draft"));
      const listing = data.listing as EtsyListing;
      setLoadedListing(listing);
      setTitle(listing.title ?? "");
      setDescription(listing.description ?? "");
      setPrice(priceToString(listing.price));
      setTags((listing.tags ?? []).join(", "));
      await refreshReadiness(id);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to load Etsy draft");
    } finally {
      setBusy("");
    }
  }

  async function syncWithEtsy(preferredId?: string) {
    setBusy("sync");
    setNotice("");
    setError("");
    try {
      await loadDrafts(preferredId);
      setNotice("Synced with Etsy.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to sync Etsy drafts");
    } finally {
      setBusy("");
    }
  }

  useEffect(() => {
    loadDrafts().catch((e) => setError(e.message));
    const onDraftCreated = (event: Event) => {
      const nextId = String((event as CustomEvent<{ listingId?: number }>).detail?.listingId ?? "");
      if (nextId) syncWithEtsy(nextId);
    };
    window.addEventListener("warlock:draft-created", onDraftCreated);
    return () => window.removeEventListener("warlock:draft-created", onDraftCreated);
  }, []);

  useEffect(() => {
    loadSelectedListing(listingId);
  }, [listingId]);

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
      setNotice("Draft details saved.");
      await loadDrafts(listingId);
      await loadSelectedListing(listingId);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Metadata update failed");
    } finally {
      setBusy("");
    }
  }

  async function uploadImages(files: File[]) {
    if (!listingId || files.length === 0 || loadedListing?.state !== "draft") return;
    setBusy("image");
    setNotice("");
    setError("");
    try {
      const startRank = (readiness?.imageCount ?? 0) + 1;
      for (let index = 0; index < files.length; index += 1) {
        const body = new FormData();
        body.set("image", files[index]);
        body.set("rank", String(startRank + index));
        const response = await fetch(`/api/etsy/listings/${listingId}/images`, { method: "POST", body });
        const data = await response.json();
        if (!response.ok) throw new Error(messageFrom(data, "Image upload failed"));
      }
      await refreshReadiness();
      setNotice(`${files.length} image${files.length === 1 ? "" : "s"} uploaded to Etsy.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Image upload failed");
    } finally {
      setBusy("");
    }
  }

  async function uploadCustomerFile(file: File | undefined) {
    if (!listingId || !file || loadedListing?.state !== "draft") return;
    setBusy("file");
    setNotice("");
    setError("");
    try {
      const body = new FormData();
      body.set("file", file);
      const response = await fetch(`/api/etsy/listings/${listingId}/files`, { method: "POST", body });
      const data = await response.json();
      if (!response.ok) throw new Error(messageFrom(data, "Customer file upload failed"));
      await refreshReadiness();
      setNotice("Customer file uploaded to Etsy.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Customer file upload failed");
    } finally {
      setBusy("");
    }
  }

  const card = { padding: 18, border: "1px solid #26313d", borderRadius: 13, background: "#111923" } as const;
  const input = { width: "100%", padding: 11, borderRadius: 8, border: "1px solid #34404d", background: "#0d141c", color: "#e9edf1", boxSizing: "border-box" as const };
  const label = { display: "block", marginBottom: 6, color: "#c6ced7", fontSize: 12, fontWeight: 700 } as const;
  const button = { padding: "9px 12px", border: 0, borderRadius: 8, background: "#6f263d", color: "white", fontWeight: 800, cursor: "pointer" } as const;
  const locked = !listingId || !loadedListing || loadedListing.state !== "draft" || !!busy;

  return (
    <section style={card}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <h2 style={{ margin: 0, fontSize: 21 }}>Draft Lifecycle</h2>
        <button type="button" onClick={() => syncWithEtsy()} disabled={!!busy} style={{ ...button, background: "#1b2733", border: "1px solid #34404d", opacity: busy ? .55 : 1 }}>
          {busy === "sync" ? "Syncing…" : "Sync Etsy"}
        </button>
      </div>

      <label style={{ marginTop: 14, display: "block" }}>
        <span style={label}>Draft</span>
        <select style={input} value={listingId} onChange={(e) => setListingId(e.target.value)}>
          <option value="">Choose a draft…</option>
          {drafts.map((draft) => <option key={draft.listing_id} value={draft.listing_id}>{draft.title || "Untitled draft"}</option>)}
        </select>
      </label>

      {listingId && (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 8, marginTop: 12 }}>
            <div style={{ padding: 10, border: "1px solid #2d3946", borderRadius: 9, background: "#0d141c" }}><strong>{readiness?.imageCount ?? 0}{readiness?.requiredImageCount ? ` / ${readiness.requiredImageCount}` : ""}</strong><span style={{ display: "block", color: "#8e99a7", fontSize: 11 }}>Images</span></div>
            <div style={{ padding: 10, border: "1px solid #2d3946", borderRadius: 9, background: "#0d141c" }}><strong>{readiness?.fileCount ?? 0}{readiness?.requiredFileCount ? ` / ${readiness.requiredFileCount}` : ""}</strong><span style={{ display: "block", color: "#8e99a7", fontSize: 11 }}>Files</span></div>
            <div style={{ padding: 10, border: readiness?.readyForHumanReview ? "1px solid #3f6b50" : "1px solid #5b4a31", borderRadius: 9, background: readiness?.readyForHumanReview ? "#132019" : "#191710" }}><strong style={{ color: readiness?.readyForHumanReview ? "#9bc8aa" : "#d4b06f" }}>{readiness?.readyForHumanReview ? "Ready" : "Open"}</strong><span style={{ display: "block", color: "#8e99a7", fontSize: 11 }}>Review</span></div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 10, marginTop: 12 }}>
            <label style={{ padding: 14, borderRadius: 10, border: "1px solid #34404d", background: "#0d141c" }}>
              <strong style={{ display: "block", marginBottom: 5 }}>Add images</strong>
              <span style={{ display: "block", color: "#8e99a7", fontSize: 12, marginBottom: 10 }}>Select one or several listing images.</span>
              <input type="file" multiple accept="image/jpeg,image/png,image/gif" disabled={locked} onChange={(e) => { const files = Array.from(e.currentTarget.files ?? []); e.currentTarget.value = ""; uploadImages(files); }} />
            </label>
            <label style={{ padding: 14, borderRadius: 10, border: "1px solid #34404d", background: "#0d141c" }}>
              <strong style={{ display: "block", marginBottom: 5 }}>Customer file</strong>
              <span style={{ display: "block", color: "#8e99a7", fontSize: 12, marginBottom: 10 }}>PDF, ZIP, or customer-ready asset.</span>
              <input type="file" accept=".pdf,.zip,.png,.jpg,.jpeg" disabled={locked} onChange={(e) => { const file = e.currentTarget.files?.[0]; e.currentTarget.value = ""; uploadCustomerFile(file); }} />
            </label>
          </div>

          <details style={{ marginTop: 12, borderTop: "1px solid #26313d", paddingTop: 12 }}>
            <summary style={{ cursor: "pointer", fontWeight: 750, color: "#cbd3dc", userSelect: "none" }}>Edit listing details</summary>
            <form onSubmit={saveMetadata} style={{ display: "grid", gap: 11, marginTop: 12 }}>
              <label><span style={label}>Title</span><input style={input} value={title} disabled={!loadedListing || busy === "loading"} onChange={(e) => setTitle(e.target.value)} /></label>
              <label><span style={label}>Description</span><textarea style={{ ...input, minHeight: 150, resize: "vertical" }} value={description} disabled={!loadedListing || busy === "loading"} onChange={(e) => setDescription(e.target.value)} /></label>
              <div style={{ display: "grid", gridTemplateColumns: "minmax(100px, 150px) minmax(0, 1fr)", gap: 10 }}>
                <label><span style={label}>Price</span><input style={input} value={price} disabled={!loadedListing || busy === "loading"} onChange={(e) => setPrice(e.target.value)} /></label>
                <label><span style={label}>Tags</span><input style={input} value={tags} disabled={!loadedListing || busy === "loading"} onChange={(e) => setTags(e.target.value)} /></label>
              </div>
              <button type="submit" disabled={locked} style={{ ...button, justifySelf: "start", opacity: locked ? .55 : 1 }}>{busy === "metadata" ? "Saving…" : "Save Details"}</button>
            </form>
          </details>
        </>
      )}

      {!listingId && drafts.length === 0 && <p style={{ color: "#8e99a7", fontSize: 13, marginBottom: 0 }}>No Etsy drafts waiting.</p>}
      {notice && <p style={{ color: "#9bc8aa", fontSize: 12, marginBottom: 0 }}>{notice}</p>}
      {error && <p style={{ color: "#e08aa2", fontSize: 12, marginBottom: 0 }}>Warlock: {error}</p>}
    </section>
  );
}
