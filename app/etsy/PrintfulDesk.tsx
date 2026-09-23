"use client";

import { useEffect, useMemo, useState } from "react";

type Product = { id: number; title: string; type?: string; image?: string };
type Variant = { id: number; name: string; size?: string; price: string | null; currency: string };
type Rate = { id: string; name: string; rate: string; currency: string };

const panel: React.CSSProperties = { background: "#141d25", border: "1px solid #33414a", borderRadius: 16, padding: 20 };
const input: React.CSSProperties = { background: "#0d151b", color: "#f3eadb", border: "1px solid #596168", padding: "11px 12px", borderRadius: 9, width: "100%", boxSizing: "border-box" };
const button: React.CSSProperties = { background: "#ab8b54", color: "#0c1217", border: 0, borderRadius: 9, padding: "11px 15px", fontWeight: 750, cursor: "pointer" };
const money = (n: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n);
const parse = (v: string) => Number(v) || 0;
function errorLabel(code: string) {
  const map: Record<string, string> = {
    artist_session_required: "The private Artist Gate is locked. Open the Museum and unlock your artist session, then refresh this page.",
    printful_token_missing: "Printful is not connected yet. Add PRINTFUL_PRIVATE_TOKEN to the canonical Wizard OS Vercel environment and redeploy.",
    printful_token_invalid_or_insufficient_scope: "Printful rejected the token or it lacks required permissions. Check the private token and store selection.",
    printful_rate_limited: "Printful rate limit reached. Wait and try again.",
    printful_unavailable: "Printful is temporarily unreachable. Retry in a moment.",
    invalid_shipping_input: "Choose a variant and enter a valid shipping destination.",
  };
  return map[code] || "Printful could not complete this request. Please try again.";
}

export default function PrintfulDesk({ embedded = false }: { embedded?: boolean }) {
  const [status, setStatus] = useState("Checking secure connection…");
  const [connected, setConnected] = useState(false);
  const [stores, setStores] = useState<{ id: number; name: string }[]>([]);
  const [masterProducts, setMasterProducts] = useState<{ id: string; title: string; collection: string }[]>([]);
  const [masterProductId, setMasterProductId] = useState("");
  const [mapping, setMapping] = useState(false);
  const [mapNotice, setMapNotice] = useState("");
  const [query, setQuery] = useState("poster");
  const [products, setProducts] = useState<Product[]>([]);
  const [productId, setProductId] = useState("");
  const [variants, setVariants] = useState<Variant[]>([]);
  const [variantId, setVariantId] = useState("");
  const [loading, setLoading] = useState(false);
  const [quoting, setQuoting] = useState(false);
  const [message, setMessage] = useState("");
  const [rates, setRates] = useState<Rate[]>([]);
  const [chosenRate, setChosenRate] = useState("");
  const [quotedAt, setQuotedAt] = useState("");
  const [country, setCountry] = useState("US");
  const [state, setState] = useState("NJ");
  const [zip, setZip] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [retail, setRetail] = useState("35");
  const [buyerShipping, setBuyerShipping] = useState("0");
  const [feePercent, setFeePercent] = useState("9.5");
  const [feeFlat, setFeeFlat] = useState("0.45");
  const [extra, setExtra] = useState("0");

  async function read(url: string, options?: RequestInit) {
    const response = await fetch(url, { cache: "no-store", ...options });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "printful_request_failed");
    return data;
  }
  useEffect(() => {
    read("/api/printful?action=status")
      .then((data) => { setConnected(true); setStores(data.stores || []); setStatus("Printful connected · read-only"); })
      .catch((error) => setStatus(errorLabel(error.message)));
  }, []);

  async function loadMasterProducts() {
    try {
      const data = await read("/api/warlock/products");
      setMasterProducts(data.products || []);
    } catch { setMasterProducts([]); }
  }
  useEffect(() => {
    void loadMasterProducts();
    const refresh = () => { void loadMasterProducts(); };
    window.addEventListener("warlock:products-changed", refresh);
    return () => window.removeEventListener("warlock:products-changed", refresh);
  }, []);
  async function attachVariant() {
    if (!variant || !productId || !masterProductId) return;
    setMapping(true); setMapNotice("");
    try {
      const response = await fetch(`/api/warlock/products/${masterProductId}/variants`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fulfillment: "PHYSICAL", label: variant.name, printfulProductId: Number(productId), printfulVariantId: variant.id }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "variant_save_failed");
      setMapNotice("Printful variant linked to the Spellmark master product. Pricing remains an estimate until approved.");
      window.dispatchEvent(new Event("warlock:products-changed"));
    } catch (e) { setMapNotice(e instanceof Error ? e.message : "Could not link variant."); }
    finally { setMapping(false); }
  }
  async function findProducts() {
    setLoading(true); setMessage(""); setProductId(""); setVariantId(""); setVariants([]); setRates([]);
    try {
      const data = await read(`/api/printful?action=catalog&q=${encodeURIComponent(query)}`);
      setProducts(data.products || []);
    } catch (error) { setMessage(errorLabel(error instanceof Error ? error.message : "")); }
    finally { setLoading(false); }
  }
  useEffect(() => { if (connected) void findProducts(); }, [connected]); // initial "poster" search only

  async function chooseProduct(id: string) {
    setProductId(id); setVariantId(""); setVariants([]); setRates([]); setMessage(""); setQuotedAt("");
    if (!id) return;
    setLoading(true);
    try {
      const data = await read(`/api/printful?action=product&id=${encodeURIComponent(id)}`);
      setVariants(data.variants || []);
    } catch (error) { setMessage(errorLabel(error instanceof Error ? error.message : "")); }
    finally { setLoading(false); }
  }
  async function quote() {
    setQuoting(true); setMessage(""); setRates([]); setQuotedAt(""); setChosenRate("");
    try {
      const data = await read("/api/printful", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ variantId: Number(variantId), quantity: Number(quantity), countryCode: country, stateCode: state, zip }),
      });
      setRates(data.rates || []);
      setChosenRate(data.rates?.[0]?.id || "");
      setQuotedAt(data.quotedAt || "");
      if (!data.rates?.length) setMessage("No shipping rate returned for this destination and variant.");
    } catch (error) { setMessage(errorLabel(error instanceof Error ? error.message : "")); }
    finally { setQuoting(false); }
  }

  const variant = variants.find((item) => String(item.id) === variantId);
  const rate = rates.find((item) => item.id === chosenRate);
  const totalSales = parse(retail) * Number(quantity) + parse(buyerShipping);
  const printCost = variant?.price == null ? null : Number(variant.price) * Number(quantity);
  const shippingCost = rate?.rate == null ? null : Number(rate.rate);
  const fees = totalSales * parse(feePercent) / 100 + parse(feeFlat);
  const profit = printCost !== null && shippingCost !== null ? totalSales - printCost - shippingCost - fees - parse(extra) : null;
  const margin = profit !== null && totalSales > 0 ? profit / totalSales * 100 : null;
  const validQty = /^\d+$/.test(quantity) && Number(quantity) >= 1 && Number(quantity) <= 20;

  return <section style={{ minHeight: embedded ? undefined : "100vh", background: "#0b1118", color: "#ece7db", padding: embedded ? "12px 0 36px" : "30px 20px 70px", fontFamily: "system-ui, sans-serif" }}>
    <div style={{ maxWidth: 980, margin: "auto", display: "grid", gap: 20 }}>
      {!embedded && <a href="/etsy?tab=production" style={{ color: "#c9ac75", textDecoration: "none", fontSize: 13 }}>← Warlock</a>}
      <header style={{ borderBottom: "1px solid #394347", paddingBottom: 22 }}>
        <p style={{ color: "#c9ac75", letterSpacing: 3, fontSize: 11, fontWeight: 750 }}>SPELLMARK · PRODUCTION DESK</p>
        <h1 style={{ fontFamily: "Georgia, serif", fontWeight: 400, fontSize: "clamp(32px, 6vw, 54px)", margin: "5px 0" }}>Printful Cost Desk</h1>
        <p style={{ color: "#bbc0bd", lineHeight: 1.6, maxWidth: 700 }}>Compare real catalog variants, estimate destination-specific shipping, and check retail margin before Aurelia hands a physical listing to Warlock.</p>
        <div role="status" style={{ color: connected ? "#a7d2ba" : "#e6ba82", fontSize: 13, marginTop: 12 }}>{status}</div>
        {connected && stores.length > 0 && <p style={{ color: "#9ea9a8", fontSize: 12 }}>Accessible store: {stores.map((s) => `${s.name} (${s.id})`).join(", ")}</p>}
      </header>

      <section style={panel}>
        <h2 style={{ fontFamily: "Georgia, serif", marginTop: 0 }}>01 · Choose the paper and size</h2>
        <p style={{ color: "#aebbb6", fontSize: 13 }}>Search Printful's catalog. Choose a product before choosing its exact size/frame variant.</p>
        <form onSubmit={(e) => { e.preventDefault(); void findProducts(); }} style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <input aria-label="Search catalog" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="poster, framed poster…" style={{ ...input, flex: "1 1 220px" }} disabled={!connected} />
          <button style={button} disabled={!connected || loading}>{loading ? "Searching…" : "Search"}</button>
        </form>
        <label style={{ display: "block", marginTop: 16 }}>Catalog product
          <select style={{ ...input, marginTop: 6 }} disabled={!connected || loading} value={productId} onChange={(e) => void chooseProduct(e.target.value)}>
            <option value="">Select a Printful product</option>
            {products.map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}
          </select>
        </label>
        <label style={{ display: "block", marginTop: 14 }}>Exact variant
          <select style={{ ...input, marginTop: 6 }} disabled={!variants.length || loading} value={variantId} onChange={(e) => { setVariantId(e.target.value); setRates([]); setQuotedAt(""); }}>
            <option value="">Select size / color / frame</option>
            {variants.map((v) => <option key={v.id} value={v.id}>{v.name} · {v.price !== null ? `${v.currency} ${v.price}` : "price unavailable"}</option>)}
          </select>
        </label>
        {variant && <p style={{ color: "#d6c099", fontSize: 14 }}>Printful catalog base: <strong>{variant.price !== null ? `${variant.currency} ${variant.price}` : "Unavailable"}</strong> / unit. Variant ID: {variant.id}.</p>}
      </section>

      <section style={panel}>
        <h2 style={{ fontFamily: "Georgia, serif", marginTop: 0 }}>02 · Request a shipping estimate</h2>
        <p style={{ color: "#aebbb6", fontSize: 13 }}>Use a destination to estimate fulfillment shipping. Rates are time-sensitive, not guaranteed or cached.</p>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(135px, 1fr))", gap: 12 }}>
          <label>Country code<input style={{ ...input, marginTop: 6 }} maxLength={2} value={country} onChange={(e) => setCountry(e.target.value.toUpperCase())} /></label>
          <label>State/province<input style={{ ...input, marginTop: 6 }} maxLength={5} value={state} onChange={(e) => setState(e.target.value.toUpperCase())} /></label>
          <label>ZIP / postal code<input style={{ ...input, marginTop: 6 }} maxLength={16} value={zip} onChange={(e) => setZip(e.target.value)} placeholder="Optional" /></label>
          <label>Quantity<input type="number" min={1} max={20} step={1} style={{ ...input, marginTop: 6 }} value={quantity} onChange={(e) => { setQuantity(e.target.value); setRates([]); }} /></label>
        </div>
        <button style={{ ...button, marginTop: 16 }} type="button" disabled={!variant || variant.price === null || !validQty || quoting} onClick={() => void quote()}>{quoting ? "Requesting…" : "Get live shipping estimate"}</button>
        {rates.length > 0 && <label style={{ display: "block", marginTop: 16 }}>Shipping service
          <select style={{ ...input, marginTop: 6 }} value={chosenRate} onChange={(e) => setChosenRate(e.target.value)}>
            {rates.map((r) => <option key={r.id} value={r.id}>{r.name} · {r.currency} {r.rate}</option>)}
          </select>
        </label>}
        {quotedAt && <p style={{ color: "#9fa9a3", fontSize: 12 }}>Estimate retrieved {new Date(quotedAt).toLocaleString()} · Recheck immediately before sale/fulfillment.</p>}
        {message && <p role="alert" style={{ color: "#ecaeac" }}>{message}</p>}
      </section>

      <section style={panel}>
        <h2 style={{ fontFamily: "Georgia, serif", marginTop: 0 }}>03 · Link this edition to Spellmark</h2>
        <p style={{ color: "#aebbb6", fontSize: 13 }}>Choose the canonical artwork. This saves only the blank Printful catalog mapping, not an order, a listing, or an assumed production quote.</p>
        {masterProducts.length === 0 && <p style={{ color: "#d6c099", fontSize: 13 }}>Create a master artwork in Warlock → Products first.</p>}
        <label>Master product
          <select style={{ ...input, marginTop: 6 }} value={masterProductId} onChange={(e) => setMasterProductId(e.target.value)}>
            <option value="">Choose an artwork</option>
            {masterProducts.map((p) => <option key={p.id} value={p.id}>{p.collection ? `${p.collection} · ` : ""}{p.title}</option>)}
          </select>
        </label>
        <button type="button" style={{ ...button, marginTop: 14 }} disabled={!connected || !variant || !masterProductId || mapping} onClick={() => void attachVariant()}>{mapping ? "Linking…" : "Attach physical edition"}</button>
        {mapNotice && <p role="status" style={{ color: "#d6c099" }}>{mapNotice}</p>}
      </section>

      <section style={panel}>
        <h2 style={{ fontFamily: "Georgia, serif", marginTop: 0 }}>04 · Retail and margin</h2>
        <p style={{ color: "#aebbb6", fontSize: 13 }}>Editable fee assumptions; use your actual Etsy fees and any taxes/Printful extras. No charges or listings are created here.</p>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 12 }}>
          {([
            ["Retail price per unit ($)", retail, setRetail],
            ["Shipping paid by buyer ($)", buyerShipping, setBuyerShipping],
            ["Estimated fees (%)", feePercent, setFeePercent],
            ["Flat fees per order ($)", feeFlat, setFeeFlat],
            ["Other costs / tax ($)", extra, setExtra],
          ] as const).map(([label, value, change]) => <label key={label} style={{ fontSize: 13 }}>{label}<input type="number" min={0} step="0.01" style={{ ...input, marginTop: 6 }} value={value} onChange={(e) => change(e.target.value)} /></label>)}
        </div>
        <div style={{ marginTop: 18, display: "grid", gap: 8, borderTop: "1px solid #394347", paddingTop: 16 }}>
          <div>Customer payment (before tax): <strong>{money(totalSales)}</strong></div>
          <div>Printful base: <strong>{printCost === null ? "Select priced variant" : money(printCost)}</strong></div>
          <div>Printful shipping: <strong>{shippingCost === null ? "Request shipping estimate" : money(shippingCost)}</strong></div>
          <div>Estimated fees: <strong>{money(fees)}</strong></div>
          <div style={{ fontSize: 21, color: profit !== null && profit >= 0 ? "#b8d7b6" : "#e7a3a3" }}>Estimated profit: <strong>{profit === null ? "—" : money(profit)}</strong> {margin === null ? "" : `(${margin.toFixed(1)}% margin)`}</div>
        </div>
        <p style={{ fontSize: 12, color: "#aebbb6", lineHeight: 1.6 }}>Not an order-cost guarantee. Base variant price may not include all print options; shipping can change; tax is not fetched. Etsy fees are editable estimates, not a verified fee statement.</p>
      </section>
    </div>
  </section>;
}
