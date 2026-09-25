"use client";

import { upload } from "@vercel/blob/client";
import { useEffect, useMemo, useState } from "react";

type Product = { id: string; title: string; collection: string; status: string };
type Asset = {
  id: string;
  role: string;
  fileName: string;
  contentType: string;
  byteSize: number;
  createdAt: string;
};

const surface: React.CSSProperties = { border: "1px solid #33414a", background: "#141d25", padding: 18, borderRadius: 13 };
const input: React.CSSProperties = { boxSizing: "border-box", background: "#10171e", color: "#f1ecde", border: "1px solid #53616a", borderRadius: 8, padding: "10px 12px", width: "100%" };
const btn: React.CSSProperties = { background: "#a98b58", border: 0, borderRadius: 8, padding: "10px 14px", fontWeight: 750, color: "#10151b", cursor: "pointer" };

function formatBytes(bytes: number) {
  if (!bytes) return "size pending";
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function PackageUpload() {
  const [products, setProducts] = useState<Product[]>([]);
  const [productId, setProductId] = useState("");
  const [assets, setAssets] = useState<Asset[]>([]);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState("");
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  async function loadProducts() {
    const response = await fetch("/api/warlock/products", { cache: "no-store" });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Products unavailable");
    const rows = (data.products || []) as Product[];
    setProducts(rows);
    setProductId((current) => current && rows.some(p => p.id === current) ? current : rows[0]?.id || "");
  }

  async function loadAssets(id = productId) {
    if (!id) { setAssets([]); return; }
    const response = await fetch(`/api/warlock/products/${id}/assets`, { cache: "no-store" });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Assets unavailable");
    setAssets(data.assets || []);
  }

  useEffect(() => {
    loadProducts().catch(() => setError("Unlock your Artist Gate to use package upload."));
    const changed = () => { loadProducts().catch(() => undefined); };
    window.addEventListener("warlock:products-changed", changed);
    return () => window.removeEventListener("warlock:products-changed", changed);
  }, []);

  useEffect(() => {
    loadAssets(productId).catch((e) => setError(e instanceof Error ? e.message : "Assets unavailable"));
  }, [productId]);

  async function uploadFiles(files: File[], role: string) {
    if (!productId || !files.length) return;
    setBusy(true); setError(""); setNotice("");
    try {
      for (let i = 0; i < files.length; i += 1) {
        const file = files[i];
        setProgress(`Uploading ${i + 1} of ${files.length}: ${file.name}`);
        const safe = file.name.replace(/[^a-zA-Z0-9._-]+/g, "-");
        await upload(`warlock/${productId}/${safe}`, file, {
          access: "private",
          handleUploadUrl: "/api/warlock/assets/upload",
          contentType: file.type || "application/octet-stream",
          multipart: file.size > 8 * 1024 * 1024,
          clientPayload: JSON.stringify({ productId, role, fileName: file.name }),
          onUploadProgress: ({ percentage }) => {
            setProgress(`Uploading ${i + 1} of ${files.length}: ${file.name} · ${Math.round(percentage)}%`);
          },
        });
      }
      setNotice(`${files.length} file${files.length === 1 ? "" : "s"} stored in Warlock.`);
      setProgress("");
      await loadAssets(productId);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Package upload failed");
    } finally {
      setBusy(false);
    }
  }

  async function remove(asset: Asset) {
    if (!confirm(`Remove ${asset.fileName} from this Warlock package?`)) return;
    setBusy(true); setError(""); setNotice("");
    try {
      const response = await fetch(`/api/warlock/assets/${asset.id}`, { method: "DELETE" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Delete failed");
      await loadAssets(productId);
      setNotice("Asset removed.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Delete failed");
    } finally { setBusy(false); }
  }

  const counts = useMemo(() => ({
    mockups: assets.filter(a => a.role === "mockup" || a.role === "hero").length,
    customer: assets.filter(a => a.role === "customer_file").length,
    masters: assets.filter(a => a.role === "master").length,
  }), [assets]);

  function picker(role: string, title: string, hint: string, accept: string, multiple = true) {
    return <label style={{ padding: 14, border: "1px solid #34434c", background: "#0e161d", borderRadius: 10 }}>
      <strong style={{ display: "block", marginBottom: 5 }}>{title}</strong>
      <span style={{ display: "block", color: "#9da9aa", fontSize: 12, lineHeight: 1.45, marginBottom: 10 }}>{hint}</span>
      <input
        type="file"
        multiple={multiple}
        accept={accept}
        disabled={busy || !productId}
        onChange={(e) => {
          const files = Array.from(e.currentTarget.files ?? []);
          e.currentTarget.value = "";
          void uploadFiles(files, role);
        }}
      />
    </label>;
  }

  return <section style={surface}>
    <p style={{ color: "#cdb687", fontSize: 11, letterSpacing: 2, margin: 0 }}>PLUS-SAFE HANDOFF</p>
    <h2 style={{ fontFamily: "Georgia, serif", fontWeight: 400, fontSize: 27, marginBottom: 8 }}>Package Upload</h2>
    <p style={{ color: "#adb7b5", lineHeight: 1.55, marginTop: 0 }}>
      Store the finished production package directly in Warlock. Files remain private here until you deliberately use the Etsy listing tools.
    </p>

    <label style={{ display: "block", marginBottom: 14 }}>
      <span style={{ display: "block", marginBottom: 6, fontWeight: 700 }}>Spellmark product</span>
      <select style={input} value={productId} disabled={busy} onChange={(e) => setProductId(e.target.value)}>
        <option value="">Choose a product…</option>
        {products.map(p => <option key={p.id} value={p.id}>{p.title}{p.collection ? ` — ${p.collection}` : ""}</option>)}
      </select>
    </label>

    {productId && <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 8, marginBottom: 14 }}>
      <div style={{ background: "#0e161d", border: "1px solid #34434c", borderRadius: 9, padding: 10 }}><strong>{counts.mockups}</strong><small style={{ display: "block", color: "#9da9aa" }}>Listing images</small></div>
      <div style={{ background: "#0e161d", border: "1px solid #34434c", borderRadius: 9, padding: 10 }}><strong>{counts.customer}</strong><small style={{ display: "block", color: "#9da9aa" }}>Customer files</small></div>
      <div style={{ background: "#0e161d", border: "1px solid #34434c", borderRadius: 9, padding: 10 }}><strong>{counts.masters}</strong><small style={{ display: "block", color: "#9da9aa" }}>Masters</small></div>
    </div>}

    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 10 }}>
      {picker("mockup", "Listing images", "Upload the hero and individual Etsy mockups. Multiple files are supported.", "image/jpeg,image/png,image/webp,image/gif")}
      {picker("customer_file", "Customer files", "Upload PDFs, ZIPs, or customer-ready downloadable assets.", ".pdf,.zip,image/png,image/jpeg,application/octet-stream")}
      {picker("master", "Production master", "Store the approved source/master separately from customer-facing assets.", "image/jpeg,image/png,image/webp,.pdf,.zip,application/octet-stream")}
    </div>

    {progress && <p role="status" style={{ color: "#d5bd8d", fontSize: 12 }}>{progress}</p>}
    {notice && <p role="status" style={{ color: "#abd8c1", fontSize: 12 }}>{notice}</p>}
    {error && <p role="alert" style={{ color: "#ecaeac", fontSize: 12 }}>{error}</p>}

    {assets.length > 0 && <div style={{ marginTop: 16, borderTop: "1px solid #34434c", paddingTop: 14 }}>
      <strong>Stored package</strong>
      <div style={{ display: "grid", gap: 7, marginTop: 9 }}>
        {assets.map(asset => <div key={asset.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, background: "#0e161d", border: "1px solid #2e3b43", borderRadius: 8, padding: "9px 10px" }}>
          <div style={{ minWidth: 0 }}>
            <a href={`/api/warlock/assets/${asset.id}`} style={{ color: "#e8dfce", textDecoration: "none", wordBreak: "break-word" }}>{asset.fileName}</a>
            <small style={{ display: "block", color: "#879598", marginTop: 2 }}>{asset.role.replace("_", " ")} · {formatBytes(asset.byteSize)}</small>
          </div>
          <button type="button" disabled={busy} onClick={() => void remove(asset)} style={{ ...btn, padding: "7px 9px", background: "#29343b", color: "#d3dbd6", flex: "0 0 auto" }}>Remove</button>
        </div>)}
      </div>
    </div>}
  </section>;
}
