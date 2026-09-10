"use client";

import { useEffect, useMemo, useState } from "react";

type StageKey = "finish" | "photography" | "archive" | "pricing" | "publishing" | "marketing" | "fulfillment";
type Artwork = {
  title: string;
  completion: number;
  artworkStatus: string;
  medium: string;
  dimensions: string;
  year: string;
  signed: boolean;
  notes: string;
  finish: { varnished: boolean; varnishType: string; coats: string; cureStatus: string; framed: boolean; hardware: boolean };
  photography: { status: string; hero: boolean; details: boolean; framedShot: boolean; scaleShot: boolean; edited: boolean };
  archive: { ingested: boolean; inventoryId: string; collection: string; description: string; coa: boolean; masterLocation: string };
  pricing: { price: string; floor: string; costBasis: string; availability: string; prints: boolean; shippingProfile: string };
  publishing: { status: string; bigCartel: boolean; portfolio: boolean; etsy: boolean; seo: boolean };
  marketing: { instagram: string; tiktok: string; youtubeShort: string; youtubeLong: string; pinterest: string; newsletter: string };
  fulfillment: { sold: boolean; buyer: string; salePrice: string; paid: boolean; packed: boolean; shipped: boolean; delivered: boolean };
};

const initialArtwork: Artwork = {
  title: "Gabriel's Horn",
  completion: 80,
  artworkStatus: "In Progress",
  medium: "Acrylic on canvas",
  dimensions: "",
  year: "2026",
  signed: false,
  notes: "",
  finish: { varnished: false, varnishType: "", coats: "", cureStatus: "Not started", framed: false, hardware: false },
  photography: { status: "Not started", hero: false, details: false, framedShot: false, scaleShot: false, edited: false },
  archive: { ingested: false, inventoryId: "", collection: "", description: "", coa: false, masterLocation: "" },
  pricing: { price: "", floor: "", costBasis: "", availability: "Available", prints: false, shippingProfile: "" },
  publishing: { status: "Not published", bigCartel: false, portfolio: false, etsy: false, seo: false },
  marketing: { instagram: "Not Planned", tiktok: "Not Planned", youtubeShort: "Not Planned", youtubeLong: "Not Planned", pinterest: "Not Planned", newsletter: "Not Planned" },
  fulfillment: { sold: false, buyer: "", salePrice: "", paid: false, packed: false, shipped: false, delivered: false },
};

const nav = ["Command", "Queue", "Money", "Ventures", "Clients", "Inventory", "Projects", "Content", "Automations"];
const marketingStates = ["Not Planned", "Planned", "Created", "Scheduled", "Published"];

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="field"><span>{label}</span>{children}</label>;
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return <label className="toggleRow"><span>{label}</span><input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} /></label>;
}

export default function Home() {
  const [artwork, setArtwork] = useState<Artwork>(initialArtwork);
  const [openStage, setOpenStage] = useState<StageKey | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem("wizard-os-gabriels-horn");
    if (saved) {
      try { setArtwork(JSON.parse(saved)); } catch { /* use defaults */ }
    }
    setLoaded(true);
  }, []);

  useEffect(() => {
    if (loaded) localStorage.setItem("wizard-os-gabriels-horn", JSON.stringify(artwork));
  }, [artwork, loaded]);

  const patch = <K extends keyof Artwork>(key: K, value: Artwork[K]) => setArtwork((prev) => ({ ...prev, [key]: value }));
  const patchStage = <K extends StageKey>(key: K, value: Partial<Artwork[K]>) => setArtwork((prev) => ({ ...prev, [key]: { ...(prev[key] as object), ...value } }));

  const salesReadiness = useMemo(() => {
    const checks = [artwork.completion === 100, artwork.finish.varnished, artwork.photography.hero, artwork.photography.edited, artwork.archive.ingested, !!artwork.pricing.price, artwork.publishing.bigCartel];
    return Math.round((checks.filter(Boolean).length / checks.length) * 100);
  }, [artwork]);

  const marketingReadiness = useMemo(() => {
    const values = Object.values(artwork.marketing);
    const ready = values.filter((v) => v !== "Not Planned").length;
    return Math.round((ready / values.length) * 100);
  }, [artwork.marketing]);

  const nextAction = useMemo(() => {
    if (artwork.completion < 100) return `Finish ${artwork.title} — ${100 - artwork.completion}% remaining`;
    if (!artwork.finish.varnished) return `Varnish ${artwork.title}`;
    if (!artwork.photography.hero) return `Photograph ${artwork.title}`;
    if (!artwork.archive.ingested) return `Ingest ${artwork.title} into Inventory`;
    if (!artwork.pricing.price) return `Set a sale price for ${artwork.title}`;
    if (!artwork.publishing.bigCartel) return `Publish ${artwork.title} to Big Cartel`;
    if (!Object.values(artwork.marketing).some((v) => v === "Published")) return `Publish launch content for ${artwork.title}`;
    if (!artwork.fulfillment.sold) return `${artwork.title} is sale-ready`;
    return `Fulfill sale for ${artwork.title}`;
  }, [artwork]);

  const stages = [
    { key: "finish" as StageKey, icon: "✦", title: "Finish", status: artwork.finish.varnished ? "Varnished" : "Not varnished", progress: artwork.finish.varnished ? 100 : 0 },
    { key: "photography" as StageKey, icon: "◉", title: "Photography", status: artwork.photography.status, progress: [artwork.photography.hero, artwork.photography.details, artwork.photography.edited].filter(Boolean).length * 33 },
    { key: "archive" as StageKey, icon: "▣", title: "Ingest / Archive", status: artwork.archive.ingested ? "Ingested" : "Not ingested", progress: artwork.archive.ingested ? 100 : 0 },
    { key: "pricing" as StageKey, icon: "$", title: "Pricing & Sale", status: artwork.pricing.price ? `$${artwork.pricing.price}` : "Price not set", progress: artwork.pricing.price ? 70 : 15 },
    { key: "publishing" as StageKey, icon: "↗", title: "Publishing", status: artwork.publishing.status, progress: [artwork.publishing.bigCartel, artwork.publishing.portfolio, artwork.publishing.seo].filter(Boolean).length * 33 },
    { key: "marketing" as StageKey, icon: "◎", title: "Marketing", status: `${Object.values(artwork.marketing).filter(v => v === "Published").length}/6 published`, progress: marketingReadiness },
    { key: "fulfillment" as StageKey, icon: "◇", title: "Sale & Fulfillment", status: artwork.fulfillment.sold ? "Sold" : "Unsold", progress: artwork.fulfillment.sold ? 35 + [artwork.fulfillment.paid, artwork.fulfillment.packed, artwork.fulfillment.shipped, artwork.fulfillment.delivered].filter(Boolean).length * 16 : 0 },
  ];

  return (
    <main className="shell">
      <aside className="sidebar">
        <div className="brand"><span className="sigil">✦</span><div><h1>Wizard OS</h1><p>Operations Console</p></div></div>
        <nav>{nav.map((item, i) => <button key={item} className={i === 6 ? "navItem active" : "navItem"}>{item}</button>)}</nav>
        <div className="sidebarFoot"><span>System</span><strong>All clear</strong></div>
      </aside>

      <section className="workspace">
        <header className="topbar">
          <div><p className="eyebrow">Artwork workflow · Live record</p><h2>{artwork.title}</h2></div>
          <span className="autosave">● Auto-saved locally</span>
        </header>

        <section className="artHero panel">
          <div className="heroMain">
            <div className="artPlaceholder"><span>GH</span><small>Artwork image not added</small></div>
            <div className="artIdentity">
              <p className="eyebrow">Mad Wizard Art · Original</p>
              <input className="titleInput" value={artwork.title} onChange={(e) => patch("title", e.target.value)} />
              <div className="inlineFields">
                <input value={artwork.medium} onChange={(e) => patch("medium", e.target.value)} placeholder="Medium" />
                <input value={artwork.dimensions} onChange={(e) => patch("dimensions", e.target.value)} placeholder="Dimensions" />
                <input value={artwork.year} onChange={(e) => patch("year", e.target.value)} placeholder="Year" />
              </div>
              <div className="completionRow"><span>Artwork completion</span><strong>{artwork.completion}%</strong></div>
              <input className="range" type="range" min="0" max="100" value={artwork.completion} onChange={(e) => patch("completion", Number(e.target.value))} />
            </div>
          </div>
          <div className="readiness">
            <div><span>Artwork</span><strong>{artwork.completion}%</strong></div>
            <div><span>Sales Ready</span><strong>{salesReadiness}%</strong></div>
            <div><span>Marketing</span><strong>{marketingReadiness}%</strong></div>
          </div>
        </section>

        <section className="nextAction panel"><div><p className="eyebrow">Next action</p><h3>{nextAction}</h3></div><span className="actionArrow">→</span></section>

        <section className="workflowGrid">
          {stages.map((stage) => (
            <button className="stageCard" key={stage.key} onClick={() => setOpenStage(stage.key)}>
              <div className="stageTop"><span className="stageIcon">{stage.icon}</span><span className="editHint">Edit ↗</span></div>
              <h3>{stage.title}</h3><p>{stage.status}</p>
              <div className="progress"><i style={{ width: `${Math.min(stage.progress, 100)}%` }} /></div>
            </button>
          ))}
        </section>

        <section className="panel quickDetails">
          <div className="panelHead"><div><p className="eyebrow">Artwork details</p><h3>Studio Record</h3></div></div>
          <div className="formGrid">
            <Field label="Status"><select value={artwork.artworkStatus} onChange={(e) => patch("artworkStatus", e.target.value)}><option>Idea</option><option>In Progress</option><option>Complete</option><option>On Hold</option></select></Field>
            <Toggle label="Signed" checked={artwork.signed} onChange={(v) => patch("signed", v)} />
            <Field label="Studio notes"><textarea value={artwork.notes} onChange={(e) => patch("notes", e.target.value)} placeholder="Process notes, symbolism, reminders…" /></Field>
          </div>
        </section>
      </section>

      {openStage && <div className="modalBackdrop" onMouseDown={() => setOpenStage(null)}>
        <section className="editWindow" onMouseDown={(e) => e.stopPropagation()}>
          <div className="modalHead"><div><p className="eyebrow">Editable workflow window</p><h2>{stages.find(s => s.key === openStage)?.title}</h2></div><button className="close" onClick={() => setOpenStage(null)}>×</button></div>

          {openStage === "finish" && <div className="formGrid"><Toggle label="Varnished" checked={artwork.finish.varnished} onChange={(v) => patchStage("finish", { varnished: v })} /><Field label="Varnish type"><input value={artwork.finish.varnishType} onChange={(e) => patchStage("finish", { varnishType: e.target.value })} placeholder="Gloss, satin, matte…" /></Field><Field label="Coats"><input value={artwork.finish.coats} onChange={(e) => patchStage("finish", { coats: e.target.value })} /></Field><Field label="Cure status"><select value={artwork.finish.cureStatus} onChange={(e) => patchStage("finish", { cureStatus: e.target.value })}><option>Not started</option><option>Drying</option><option>Cured</option></select></Field><Toggle label="Framed" checked={artwork.finish.framed} onChange={(v) => patchStage("finish", { framed: v })} /><Toggle label="Hanging hardware installed" checked={artwork.finish.hardware} onChange={(v) => patchStage("finish", { hardware: v })} /></div>}

          {openStage === "photography" && <div className="formGrid"><Field label="Photo status"><select value={artwork.photography.status} onChange={(e) => patchStage("photography", { status: e.target.value })}><option>Not started</option><option>Shot</option><option>Editing</option><option>Complete</option></select></Field><Toggle label="Hero photo" checked={artwork.photography.hero} onChange={(v) => patchStage("photography", { hero: v })} /><Toggle label="Detail shots" checked={artwork.photography.details} onChange={(v) => patchStage("photography", { details: v })} /><Toggle label="Framed shot" checked={artwork.photography.framedShot} onChange={(v) => patchStage("photography", { framedShot: v })} /><Toggle label="Scale / interior shot" checked={artwork.photography.scaleShot} onChange={(v) => patchStage("photography", { scaleShot: v })} /><Toggle label="Images edited" checked={artwork.photography.edited} onChange={(v) => patchStage("photography", { edited: v })} /></div>}

          {openStage === "archive" && <div className="formGrid"><Toggle label="Ingested into inventory" checked={artwork.archive.ingested} onChange={(v) => patchStage("archive", { ingested: v })} /><Field label="Inventory ID"><input value={artwork.archive.inventoryId} onChange={(e) => patchStage("archive", { inventoryId: e.target.value })} placeholder="MW-2026-001" /></Field><Field label="Collection / series"><input value={artwork.archive.collection} onChange={(e) => patchStage("archive", { collection: e.target.value })} /></Field><Toggle label="Certificate of authenticity ready" checked={artwork.archive.coa} onChange={(v) => patchStage("archive", { coa: v })} /><Field label="Master file location"><input value={artwork.archive.masterLocation} onChange={(e) => patchStage("archive", { masterLocation: e.target.value })} /></Field><Field label="Catalog description"><textarea value={artwork.archive.description} onChange={(e) => patchStage("archive", { description: e.target.value })} /></Field></div>}

          {openStage === "pricing" && <div className="formGrid"><Field label="Original price ($)"><input inputMode="decimal" value={artwork.pricing.price} onChange={(e) => patchStage("pricing", { price: e.target.value })} /></Field><Field label="Minimum acceptable ($)"><input inputMode="decimal" value={artwork.pricing.floor} onChange={(e) => patchStage("pricing", { floor: e.target.value })} /></Field><Field label="Cost basis ($)"><input inputMode="decimal" value={artwork.pricing.costBasis} onChange={(e) => patchStage("pricing", { costBasis: e.target.value })} /></Field><Field label="Availability"><select value={artwork.pricing.availability} onChange={(e) => patchStage("pricing", { availability: e.target.value })}><option>Available</option><option>Reserved</option><option>Not For Sale</option><option>Sold</option></select></Field><Toggle label="Eligible for prints" checked={artwork.pricing.prints} onChange={(v) => patchStage("pricing", { prints: v })} /><Field label="Shipping profile"><input value={artwork.pricing.shippingProfile} onChange={(e) => patchStage("pricing", { shippingProfile: e.target.value })} /></Field></div>}

          {openStage === "publishing" && <div className="formGrid"><Field label="Listing status"><select value={artwork.publishing.status} onChange={(e) => patchStage("publishing", { status: e.target.value })}><option>Not published</option><option>Drafting</option><option>Ready</option><option>Published</option></select></Field><Toggle label="Big Cartel listing" checked={artwork.publishing.bigCartel} onChange={(v) => patchStage("publishing", { bigCartel: v })} /><Toggle label="Portfolio page" checked={artwork.publishing.portfolio} onChange={(v) => patchStage("publishing", { portfolio: v })} /><Toggle label="Etsy listing" checked={artwork.publishing.etsy} onChange={(v) => patchStage("publishing", { etsy: v })} /><Toggle label="SEO title + description complete" checked={artwork.publishing.seo} onChange={(v) => patchStage("publishing", { seo: v })} /></div>}

          {openStage === "marketing" && <div className="formGrid">{(["instagram", "tiktok", "youtubeShort", "youtubeLong", "pinterest", "newsletter"] as const).map((channel) => <Field key={channel} label={{instagram:"Instagram",tiktok:"TikTok",youtubeShort:"YouTube Short",youtubeLong:"YouTube Long-form",pinterest:"Pinterest",newsletter:"Newsletter"}[channel]}><select value={artwork.marketing[channel]} onChange={(e) => patchStage("marketing", { [channel]: e.target.value })}>{marketingStates.map(s => <option key={s}>{s}</option>)}</select></Field>)}</div>}

          {openStage === "fulfillment" && <div className="formGrid"><Toggle label="Sold" checked={artwork.fulfillment.sold} onChange={(v) => patchStage("fulfillment", { sold: v })} /><Field label="Buyer"><input value={artwork.fulfillment.buyer} onChange={(e) => patchStage("fulfillment", { buyer: e.target.value })} /></Field><Field label="Sale price ($)"><input inputMode="decimal" value={artwork.fulfillment.salePrice} onChange={(e) => patchStage("fulfillment", { salePrice: e.target.value })} /></Field><Toggle label="Payment received" checked={artwork.fulfillment.paid} onChange={(v) => patchStage("fulfillment", { paid: v })} /><Toggle label="Packed + COA included" checked={artwork.fulfillment.packed} onChange={(v) => patchStage("fulfillment", { packed: v })} /><Toggle label="Shipped" checked={artwork.fulfillment.shipped} onChange={(v) => patchStage("fulfillment", { shipped: v })} /><Toggle label="Delivered" checked={artwork.fulfillment.delivered} onChange={(v) => patchStage("fulfillment", { delivered: v })} /></div>}

          <div className="modalFoot"><span>Changes save automatically.</span><button className="primary" onClick={() => setOpenStage(null)}>Done</button></div>
        </section>
      </div>}
    </main>
  );
}
