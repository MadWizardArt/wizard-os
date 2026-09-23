"use client";

import { useEffect, useState } from "react";
import DraftFinisher from "./DraftFinisher";
import EtsyConsole from "./EtsyConsole";
import PrintfulDesk from "./PrintfulDesk";
import ProductStudio from "./ProductStudio";

type Tab = "products" | "production" | "listings";
const tabs: { id: Tab; label: string; sub: string }[] = [
  { id: "products", label: "Products", sub: "Artwork & editions" },
  { id: "production", label: "Production", sub: "Printful & pricing" },
  { id: "listings", label: "Listings", sub: "Etsy drafts" },
];
function validTab(value: string | null): Tab {
  return value === "production" || value === "listings" ? value : "products";
}
export default function WarlockWorkspace() {
  const [tab, setTab] = useState<Tab>("products");
  useEffect(() => {
    const update = () => setTab(validTab(new URLSearchParams(window.location.search).get("tab")));
    update();
    window.addEventListener("popstate", update);
    return () => window.removeEventListener("popstate", update);
  }, []);
  function choose(id: Tab) {
    window.history.pushState(null, "", `/etsy?tab=${id}`);
    setTab(id);
  }
  return <main style={{ minHeight: "100vh", padding: "32px 20px 64px", background: "#0b1118", color: "#e9edf1" }}>
    <section style={{ maxWidth: 980, margin: "0 auto" }}>
      <a href="/" style={{ display: "inline-block", marginBottom: 16, fontSize: 13, color: "#cbb68f", textDecoration: "none" }}>← The Crucible</a>
      <header style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, marginBottom: 18, flexWrap: "wrap" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span aria-hidden="true" style={{ display: "grid", placeItems: "center", width: 38, height: 38, borderRadius: 9, background: "#6f263d", border: "1px solid #a85b74", color: "#f6e8ed", fontFamily: "Georgia, serif", fontSize: 23 }}>𝖂</span>
          <div><p style={{ margin: 0, fontSize: 10, letterSpacing: 2, color: "#ba9f70" }}>SPELLMARK · COMMERCE ENGINE</p><h1 style={{ margin: 0, fontSize: 29, fontWeight: 650 }}>Warlock</h1></div>
        </div>
        <a href="/api/etsy/connect" style={{ padding: "9px 12px", borderRadius: 9, border: "1px solid #34404d", background: "#17212c", color: "#d9e0e7", textDecoration: "none", fontSize: 13, fontWeight: 700 }}>Reconnect Etsy</a>
      </header>
      <nav aria-label="Warlock workspace" style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 8, marginBottom: 20 }}>
        {tabs.map(item => <button key={item.id} type="button" aria-current={tab === item.id ? "page" : undefined} onClick={() => choose(item.id)} style={{
          background: tab === item.id ? "#2c2823" : "#111b24",
          border: tab === item.id ? "1px solid #b99c68" : "1px solid #31404b",
          borderRadius: 11, color: tab === item.id ? "#f4e1bc" : "#ccd5d8", padding: "13px 9px",
          textAlign: "left", cursor: "pointer",
        }}><strong style={{ display: "block", fontSize: 14 }}>{item.label}</strong><small style={{ display: "block", marginTop: 3, opacity: .7 }}>{item.sub}</small></button>)}
      </nav>
      {tab === "products" && <ProductStudio />}
      {tab === "production" && <PrintfulDesk embedded />}
      {tab === "listings" && <section style={{ display: "grid", gap: 14 }}>
        <p style={{ color: "#aebac0", lineHeight: 1.5, margin: "0 0 4px" }}>Your existing Etsy draft tools remain intact. This stage does not auto-publish, submit Printful orders, or treat a digital listing as a physical one.</p>
        <DraftFinisher />
        <EtsyConsole />
      </section>}
    </section>
  </main>;
}
