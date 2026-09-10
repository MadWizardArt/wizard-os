"use client";

import { useEffect, useMemo, useState } from "react";

type StageKey = "finish" | "photography" | "archive" | "pricing" | "publishing" | "marketing" | "fulfillment";
type Artwork = {
  title: string; completion: number; artworkStatus: string; medium: string; dimensions: string; year: string; signed: boolean; notes: string;
  finish: { varnished: boolean; varnishType: string; coats: string; cureStatus: string; framed: boolean; hardware: boolean };
  photography: { status: string; hero: boolean; details: boolean; framedShot: boolean; scaleShot: boolean; edited: boolean };
  archive: { ingested: boolean; inventoryId: string; collection: string; description: string; coa: boolean; masterLocation: string };
  pricing: { price: string; floor: string; costBasis: string; availability: string; prints: boolean; shippingProfile: string };
  publishing: { status: string; bigCartel: boolean; portfolio: boolean; etsy: boolean; seo: boolean };
  marketing: { instagram: string; tiktok: string; youtubeShort: string; youtubeLong: string; pinterest: string; newsletter: string };
  fulfillment: { sold: boolean; buyer: string; salePrice: string; paid: boolean; packed: boolean; shipped: boolean; delivered: boolean };
};

type Project = { id: string; title: string; kind: "Artwork" | "Project" | "Commission"; status: string; progress: number; next: string; value: string; due: string; tone: string };

const initialArtwork: Artwork = {
  title: "Gabriel's Horn", completion: 80, artworkStatus: "In Progress", medium: "Acrylic on canvas", dimensions: "", year: "2026", signed: false, notes: "",
  finish: { varnished: false, varnishType: "", coats: "", cureStatus: "Not started", framed: false, hardware: false },
  photography: { status: "Not started", hero: false, details: false, framedShot: false, scaleShot: false, edited: false },
  archive: { ingested: false, inventoryId: "", collection: "", description: "", coa: false, masterLocation: "" },
  pricing: { price: "", floor: "", costBasis: "", availability: "Available", prints: false, shippingProfile: "" },
  publishing: { status: "Not published", bigCartel: false, portfolio: false, etsy: false, seo: false },
  marketing: { instagram: "Not Planned", tiktok: "Not Planned", youtubeShort: "Not Planned", youtubeLong: "Not Planned", pinterest: "Not Planned", newsletter: "Not Planned" },
  fulfillment: { sold: false, buyer: "", salePrice: "", paid: false, packed: false, shipped: false, delivered: false },
};

const projects: Project[] = [
  { id: "gabriel", title: "Gabriel's Horn", kind: "Artwork", status: "In Progress", progress: 80, next: "Finish painting", value: "Original", due: "No deadline", tone: "burgundy" },
  { id: "autumn", title: "Autumn Print Release", kind: "Project", status: "Proofing", progress: 65, next: "Approve final proof", value: "$620", due: "Sep 11", tone: "green" },
  { id: "commission", title: "Private Collector Commission", kind: "Commission", status: "Awaiting Approval", progress: 55, next: "Collector follow-up", value: "$700", due: "Sep 14", tone: "navy" },
  { id: "wizard", title: "Wizard OS — Business Engine", kind: "Project", status: "In Development", progress: 35, next: "Test project workflows", value: "Internal", due: "Sep 18", tone: "navy" },
];

const nav = ["Command", "Queue", "Money", "Ventures", "Clients", "Inventory", "Projects", "Content", "Automations"];
const marketingStates = ["Not Planned", "Planned", "Created", "Scheduled", "Published"];

function Field({ label, children }: { label: string; children: React.ReactNode }) { return <label className="field"><span>{label}</span>{children}</label>; }
function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) { return <label className="toggleRow"><span>{label}</span><input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} /></label>; }

export default function Home() {
  const [view, setView] = useState<"dashboard" | "artwork" | "project">("dashboard");
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const [artwork, setArtwork] = useState<Artwork>(initialArtwork);
  const [openStage, setOpenStage] = useState<StageKey | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem("wizard-os-gabriels-horn");
    if (saved) { try { setArtwork(JSON.parse(saved)); } catch {} }
    setLoaded(true);
  }, []);
  useEffect(() => { if (loaded) localStorage.setItem("wizard-os-gabriels-horn", JSON.stringify(artwork)); }, [artwork, loaded]);

  const patch = <K extends keyof Artwork>(key: K, value: Artwork[K]) => setArtwork((p) => ({ ...p, [key]: value }));
  const patchStage = <K extends StageKey>(key: K, value: Partial<Artwork[K]>) => setArtwork((p) => ({ ...p, [key]: { ...(p[key] as object), ...value } }));

  const salesReadiness = useMemo(() => {
    const checks = [artwork.completion === 100, artwork.finish.varnished, artwork.photography.hero, artwork.photography.edited, artwork.archive.ingested, !!artwork.pricing.price, artwork.publishing.bigCartel];
    return Math.round((checks.filter(Boolean).length / checks.length) * 100);
  }, [artwork]);
  const marketingReadiness = useMemo(() => {
    const vals = Object.values(artwork.marketing); return Math.round((vals.filter((v) => v !== "Not Planned").length / vals.length) * 100);
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

  const openProject = (project: Project) => {
    setSelectedProject(project);
    setView(project.id === "gabriel" ? "artwork" : "project");
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const Dashboard = () => <>
    <header className="topbar"><div><p className="eyebrow">Wednesday · September 9</p><h2>Command Center</h2></div><button className="primary">+ New Work Order</button></header>
    <section className="metrics">
      <article className="metric"><span>Month Revenue</span><strong>$4,270</strong><small>+12% vs. prior month</small></article>
      <article className="metric"><span>Recurring Income</span><strong>$420</strong><small>9.8% of revenue</small></article>
      <article className="metric"><span>Open Work</span><strong>7</strong><small>$3,170 pipeline</small></article>
      <article className="metric"><span>Freedom Target</span><strong>42%</strong><small>$420 / $1,000</small></article>
    </section>

    <section className="panel projectPanel">
      <div className="panelHead"><div><p className="eyebrow">Studio + business</p><h3>Works in Progress</h3></div><span className="panelHint">Select any item to open its workspace</span></div>
      <div className="projectGrid">
        {projects.map((p) => <button className="projectCard" key={p.id} onClick={() => openProject(p)}>
          <div className="projectCardTop"><span className={`status ${p.tone}`}>{p.kind}</span><span className="openHint">Open ↗</span></div>
          <h3>{p.title}</h3><p>{p.status}</p>
          <div className="progress"><i style={{ width: `${p.id === "gabriel" ? artwork.completion : p.progress}%` }} /></div>
          <div className="projectMeta"><span>{p.id === "gabriel" ? artwork.completion : p.progress}%</span><span>{p.due}</span></div>
          <small>Next: {p.id === "gabriel" ? nextAction : p.next}</small>
        </button>)}
      </div>
    </section>

    <section className="panel queuePanel">
      <div className="panelHead"><div><p className="eyebrow">FlightDeck-style queue</p><h3>Active Work</h3></div><div className="filters"><button>All</button><button>Due Soon</button><button>Waiting</button></div></div>
      <div className="tableWrap"><table><thead><tr><th>Type</th><th>Work</th><th>Status</th><th>Value</th><th>Due</th><th></th></tr></thead><tbody>
        {projects.map((p) => <tr key={p.id} className="clickRow" onClick={() => openProject(p)}><td><span className={`status ${p.tone}`}>{p.kind}</span></td><td>{p.title}</td><td>{p.status}</td><td>{p.value}</td><td>{p.due}</td><td>→</td></tr>)}
      </tbody></table></div>
    </section>

    <section className="lowerGrid"><article className="panel"><div className="panelHead"><div><p className="eyebrow">Priority</p><h3>Next Best Actions</h3></div></div><ol className="actions">
      <li><span>01</span><div><strong>{nextAction}</strong><p>Move Gabriel&apos;s Horn toward sale readiness.</p></div></li>
      <li><span>02</span><div><strong>Close pending commission approval</strong><p>Follow up with collector today.</p></div></li>
      <li><span>03</span><div><strong>Finish print release proof</strong><p>Unlock listing and launch content.</p></div></li>
    </ol></article><article className="panel"><div className="panelHead"><div><p className="eyebrow">Income mix</p><h3>Revenue Sources</h3></div></div><div className="mix"><div><span>Services</span><strong>54%</strong></div><div><span>Art</span><strong>36%</strong></div><div><span>Recurring</span><strong>10%</strong></div></div><div className="rule">✦</div><p className="note">Goal: grow recurring income without increasing required weekly hours.</p></article></section>
  </>;

  const ArtworkWorkspace = () => <>
    <header className="topbar"><div><button className="backButton" onClick={() => setView("dashboard")}>← Command Center</button><p className="eyebrow">Artwork workflow · Live record</p><h2>{artwork.title}</h2></div><span className="autosave">● Auto-saved locally</span></header>
    <section className="artHero panel"><div className="heroMain"><div className="artPlaceholder"><span>GH</span><small>Artwork image not added</small></div><div className="artIdentity"><p className="eyebrow">Mad Wizard Art · Original</p><input className="titleInput" value={artwork.title} onChange={(e) => patch("title", e.target.value)} /><div className="inlineFields"><input value={artwork.medium} onChange={(e) => patch("medium", e.target.value)} placeholder="Medium" /><input value={artwork.dimensions} onChange={(e) => patch("dimensions", e.target.value)} placeholder="Dimensions" /><input value={artwork.year} onChange={(e) => patch("year", e.target.value)} placeholder="Year" /></div><div className="completionRow"><span>Artwork completion</span><strong>{artwork.completion}%</strong></div><input className="range" type="range" min="0" max="100" value={artwork.completion} onChange={(e) => patch("completion", Number(e.target.value))} /></div></div><div className="readiness"><div><span>Artwork</span><strong>{artwork.completion}%</strong></div><div><span>Sales Ready</span><strong>{salesReadiness}%</strong></div><div><span>Marketing</span><strong>{marketingReadiness}%</strong></div></div></section>
    <section className="nextAction panel"><div><p className="eyebrow">Next action</p><h3>{nextAction}</h3></div><span className="actionArrow">→</span></section>
    <section className="workflowGrid">{stages.map((s) => <button className="stageCard" key={s.key} onClick={() => setOpenStage(s.key)}><div className="stageTop"><span className="stageIcon">{s.icon}</span><span className="editHint">Edit ↗</span></div><h3>{s.title}</h3><p>{s.status}</p><div className="progress"><i style={{ width: `${Math.min(s.progress, 100)}%` }} /></div></button>)}</section>
    <section className="panel quickDetails"><div className="panelHead"><div><p className="eyebrow">Artwork details</p><h3>Studio Record</h3></div></div><div className="formGrid"><Field label="Status"><select value={artwork.artworkStatus} onChange={(e) => patch("artworkStatus", e.target.value)}><option>Idea</option><option>In Progress</option><option>Complete</option><option>On Hold</option></select></Field><Toggle label="Signed" checked={artwork.signed} onChange={(v) => patch("signed", v)} /><Field label="Studio notes"><textarea value={artwork.notes} onChange={(e) => patch("notes", e.target.value)} placeholder="Process notes, symbolism, reminders…" /></Field></div></section>
  </>;

  const ProjectWorkspace = () => selectedProject && <>
    <header className="topbar"><div><button className="backButton" onClick={() => setView("dashboard")}>← Command Center</button><p className="eyebrow">{selectedProject.kind} workspace</p><h2>{selectedProject.title}</h2></div><span className={`status ${selectedProject.tone}`}>{selectedProject.status}</span></header>
    <section className="panel genericHero"><div><p className="eyebrow">Current progress</p><strong className="bigProgress">{selectedProject.progress}%</strong><div className="progress"><i style={{ width: `${selectedProject.progress}%` }} /></div></div><div className="genericStats"><div><span>Value</span><strong>{selectedProject.value}</strong></div><div><span>Due</span><strong>{selectedProject.due}</strong></div><div><span>Next action</span><strong>{selectedProject.next}</strong></div></div></section>
    <section className="workflowGrid genericWorkflow"><article className="stageCard static"><div className="stageTop"><span className="stageIcon">01</span></div><h3>Plan</h3><p>Scope, requirements, assets</p></article><article className="stageCard static"><div className="stageTop"><span className="stageIcon">02</span></div><h3>Produce</h3><p>Core work and revisions</p></article><article className="stageCard static"><div className="stageTop"><span className="stageIcon">03</span></div><h3>Approve</h3><p>Proofs and stakeholder review</p></article><article className="stageCard static"><div className="stageTop"><span className="stageIcon">04</span></div><h3>Deliver</h3><p>Publish, handoff or fulfillment</p></article></section>
    <section className="panel"><div className="panelHead"><div><p className="eyebrow">Project notes</p><h3>Workspace</h3></div></div><p className="note">This project now has its own drill-down workspace. The next iteration can give each project type a specialized editable workflow just like Gabriel&apos;s Horn.</p></section>
  </>;

  return <main className="shell"><aside className="sidebar"><div className="brand"><span className="sigil">✦</span><div><h1>Wizard OS</h1><p>Operations Console</p></div></div><nav>{nav.map((item, i) => <button key={item} onClick={() => item === "Command" && setView("dashboard")} className={item === "Command" && view === "dashboard" ? "navItem active" : item === "Projects" && view !== "dashboard" ? "navItem active" : "navItem"}>{item}</button>)}</nav><div className="sidebarFoot"><span>System</span><strong>All clear</strong></div></aside><section className="workspace">{view === "dashboard" ? <Dashboard /> : view === "artwork" ? <ArtworkWorkspace /> : <ProjectWorkspace />}</section>

    {openStage && <div className="modalBackdrop" onMouseDown={() => setOpenStage(null)}><section className="editWindow" onMouseDown={(e) => e.stopPropagation()}><div className="modalHead"><div><p className="eyebrow">Editable workflow window</p><h2>{stages.find(s => s.key === openStage)?.title}</h2></div><button className="close" onClick={() => setOpenStage(null)}>×</button></div>
      {openStage === "finish" && <div className="formGrid"><Toggle label="Varnished" checked={artwork.finish.varnished} onChange={(v) => patchStage("finish", { varnished: v })} /><Field label="Varnish type"><input value={artwork.finish.varnishType} onChange={(e) => patchStage("finish", { varnishType: e.target.value })} placeholder="Gloss, satin, matte…" /></Field><Field label="Coats"><input value={artwork.finish.coats} onChange={(e) => patchStage("finish", { coats: e.target.value })} /></Field><Field label="Cure status"><select value={artwork.finish.cureStatus} onChange={(e) => patchStage("finish", { cureStatus: e.target.value })}><option>Not started</option><option>Drying</option><option>Cured</option></select></Field><Toggle label="Framed" checked={artwork.finish.framed} onChange={(v) => patchStage("finish", { framed: v })} /><Toggle label="Hanging hardware installed" checked={artwork.finish.hardware} onChange={(v) => patchStage("finish", { hardware: v })} /></div>}
      {openStage === "photography" && <div className="formGrid"><Field label="Photo status"><select value={artwork.photography.status} onChange={(e) => patchStage("photography", { status: e.target.value })}><option>Not started</option><option>Shot</option><option>Editing</option><option>Complete</option></select></Field><Toggle label="Hero photo" checked={artwork.photography.hero} onChange={(v) => patchStage("photography", { hero: v })} /><Toggle label="Detail shots" checked={artwork.photography.details} onChange={(v) => patchStage("photography", { details: v })} /><Toggle label="Framed shot" checked={artwork.photography.framedShot} onChange={(v) => patchStage("photography", { framedShot: v })} /><Toggle label="Scale / interior shot" checked={artwork.photography.scaleShot} onChange={(v) => patchStage("photography", { scaleShot: v })} /><Toggle label="Images edited" checked={artwork.photography.edited} onChange={(v) => patchStage("photography", { edited: v })} /></div>}
      {openStage === "archive" && <div className="formGrid"><Toggle label="Ingested into inventory" checked={artwork.archive.ingested} onChange={(v) => patchStage("archive", { ingested: v })} /><Field label="Inventory ID"><input value={artwork.archive.inventoryId} onChange={(e) => patchStage("archive", { inventoryId: e.target.value })} placeholder="MW-2026-001" /></Field><Field label="Collection / series"><input value={artwork.archive.collection} onChange={(e) => patchStage("archive", { collection: e.target.value })} /></Field><Toggle label="Certificate of authenticity ready" checked={artwork.archive.coa} onChange={(v) => patchStage("archive", { coa: v })} /><Field label="Master file location"><input value={artwork.archive.masterLocation} onChange={(e) => patchStage("archive", { masterLocation: e.target.value })} /></Field><Field label="Catalog description"><textarea value={artwork.archive.description} onChange={(e) => patchStage("archive", { description: e.target.value })} /></Field></div>}
      {openStage === "pricing" && <div className="formGrid"><Field label="Original price ($)"><input value={artwork.pricing.price} onChange={(e) => patchStage("pricing", { price: e.target.value })} /></Field><Field label="Minimum acceptable ($)"><input value={artwork.pricing.floor} onChange={(e) => patchStage("pricing", { floor: e.target.value })} /></Field><Field label="Cost basis ($)"><input value={artwork.pricing.costBasis} onChange={(e) => patchStage("pricing", { costBasis: e.target.value })} /></Field><Field label="Availability"><select value={artwork.pricing.availability} onChange={(e) => patchStage("pricing", { availability: e.target.value })}><option>Available</option><option>Reserved</option><option>Not for sale</option><option>Sold</option></select></Field><Toggle label="Eligible for prints" checked={artwork.pricing.prints} onChange={(v) => patchStage("pricing", { prints: v })} /><Field label="Shipping profile"><input value={artwork.pricing.shippingProfile} onChange={(e) => patchStage("pricing", { shippingProfile: e.target.value })} /></Field></div>}
      {openStage === "publishing" && <div className="formGrid"><Field label="Listing status"><select value={artwork.publishing.status} onChange={(e) => patchStage("publishing", { status: e.target.value })}><option>Not published</option><option>Drafting</option><option>Ready</option><option>Published</option></select></Field><Toggle label="Big Cartel" checked={artwork.publishing.bigCartel} onChange={(v) => patchStage("publishing", { bigCartel: v })} /><Toggle label="Website portfolio" checked={artwork.publishing.portfolio} onChange={(v) => patchStage("publishing", { portfolio: v })} /><Toggle label="Etsy" checked={artwork.publishing.etsy} onChange={(v) => patchStage("publishing", { etsy: v })} /><Toggle label="SEO complete" checked={artwork.publishing.seo} onChange={(v) => patchStage("publishing", { seo: v })} /></div>}
      {openStage === "marketing" && <div className="formGrid">{(["instagram","tiktok","youtubeShort","youtubeLong","pinterest","newsletter"] as const).map((k) => <Field key={k} label={k.replace(/([A-Z])/g, " $1")}><select value={artwork.marketing[k]} onChange={(e) => patchStage("marketing", { [k]: e.target.value })}>{marketingStates.map((s) => <option key={s}>{s}</option>)}</select></Field>)}</div>}
      {openStage === "fulfillment" && <div className="formGrid"><Toggle label="Sold" checked={artwork.fulfillment.sold} onChange={(v) => patchStage("fulfillment", { sold: v })} /><Field label="Buyer"><input value={artwork.fulfillment.buyer} onChange={(e) => patchStage("fulfillment", { buyer: e.target.value })} /></Field><Field label="Sale price ($)"><input value={artwork.fulfillment.salePrice} onChange={(e) => patchStage("fulfillment", { salePrice: e.target.value })} /></Field><Toggle label="Paid" checked={artwork.fulfillment.paid} onChange={(v) => patchStage("fulfillment", { paid: v })} /><Toggle label="Packed + COA" checked={artwork.fulfillment.packed} onChange={(v) => patchStage("fulfillment", { packed: v })} /><Toggle label="Shipped" checked={artwork.fulfillment.shipped} onChange={(v) => patchStage("fulfillment", { shipped: v })} /><Toggle label="Delivered" checked={artwork.fulfillment.delivered} onChange={(v) => patchStage("fulfillment", { delivered: v })} /></div>}
    </section></div>}
  </main>;
}
