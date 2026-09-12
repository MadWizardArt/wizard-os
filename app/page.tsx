"use client";

import {CampaignDashboard} from "./components/Campaigns";
import StageEditor, {type EditableStage} from "./components/StageEditor";

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

type Project = { id: string; title: string; kind: "Artwork" | "Project" | "Commission"; status: string; statusEnum?: string; type?: string; templateId?: string | null; customerId?: string | null; progress: number; next: string; value: string; due: string; tone: string };
type WorkflowStage = EditableStage & { id: string; name: string; position: number; status: string; progress: number };
type ProjectDetail = { id: string; title: string; status: string; progress: number; valueCents: number | null; dueDate: string | null; nextAction: string | null; notes: string | null; customerId: string | null; stages: WorkflowStage[]; template: { name: string } | null };
type WorkflowTemplate = { id: string; name: string; projectType: string; stages: Array<{ id: string; name: string; position: number }> };
type Transaction = { id: string; type: "INCOME" | "EXPENSE" | "REFUND"; amountCents: number; occurredAt: string; receivedAt: string | null; source: string; incomeClass: "ACTIVE" | "RECURRING" | "PASSIVE_LIKE" | null; isNonArt: boolean; notes: string | null; projectId: string | null; customerId: string | null };
type IncomeMetrics = { totalCents: number; qualifyingCents: number; qualifyingShare: number; targets: Array<{ targetCents: number; progress: number; remainingCents: number }>; nextTarget: { targetCents: number; progress: number; remainingCents: number } };
type Venture = { id: string; name: string; description: string | null; status: string; demand: number; margin: number; recurrence: number; automation: number; defensibility: number; startupCost: number; weeklyHours: number; nextAction: string | null; score: number };
type Customer = { id: string; name: string; email: string | null; phone: string | null; type: string; status: string; notes: string | null; lastContactAt: string | null; receivedCents: number; _count: { projects: number; transactions: number } };

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

const demoProjects: Project[] = [
  { id: "gabriel", title: "Gabriel's Horn", kind: "Artwork", status: "In Progress", progress: 80, next: "Finish painting", value: "Original", due: "No deadline", tone: "burgundy" },
  { id: "autumn", title: "Autumn Print Release", kind: "Project", status: "Proofing", progress: 65, next: "Approve final proof", value: "$620", due: "Sep 11", tone: "green" },
  { id: "commission", title: "Private Collector Commission", kind: "Commission", status: "Awaiting Approval", progress: 55, next: "Collector follow-up", value: "$700", due: "Sep 14", tone: "navy" },
  { id: "wizard", title: "Wizard OS — Business Engine", kind: "Project", status: "In Development", progress: 35, next: "Test project workflows", value: "Internal", due: "Sep 18", tone: "navy" },
];

const nav = ["The Crucible", "Campaigns", "Calendar", "Queue", "Money", "Ventures", "Clients", "Inventory", "Projects", "Content", "Automations"];
const marketingStates = ["Not Planned", "Planned", "Created", "Scheduled", "Published"];

function Field({ label, children }: { label: string; children: React.ReactNode }) { return <label className="field"><span>{label}</span>{children}</label>; }
function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) { return <label className="toggleRow"><span>{label}</span><input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} /></label>; }

export default function Home() {
  const [view, setView] = useState<"dashboard" | "artwork" | "project" | "money" | "ventures" | "customers">("dashboard");
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const [artwork, setArtwork] = useState<Artwork>(initialArtwork);
  const [openStage, setOpenStage] = useState<StageKey | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [projects, setProjects] = useState<Project[]>(demoProjects);
  const [projectDetail, setProjectDetail] = useState<ProjectDetail | null>(null);
  const [editingStage, setEditingStage] = useState<WorkflowStage | null>(null);
  const [legacyAvailable, setLegacyAvailable] = useState(false);
  const [templates, setTemplates] = useState<WorkflowTemplate[]>([]);
  const [showNewProject, setShowNewProject] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");
  const [newProject, setNewProject] = useState({ title: "", type: "ARTWORK", templateId: "", value: "", dueDate: "", nextAction: "", customerId: "" });
  const [newProjectStages, setNewProjectStages] = useState<string[]>([]);
  const [selectedMonth, setSelectedMonth] = useState(() => new Date().toISOString().slice(0, 7));
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [incomeMetrics, setIncomeMetrics] = useState<IncomeMetrics>({ totalCents: 0, qualifyingCents: 0, qualifyingShare: 0, targets: [100000, 250000, 500000].map((targetCents) => ({ targetCents, progress: 0, remainingCents: targetCents })), nextTarget: { targetCents: 100000, progress: 0, remainingCents: 100000 } });
  const [showTransaction, setShowTransaction] = useState(false);
  const [editingTransactionId, setEditingTransactionId] = useState<string | null>(null);
  const emptyTransaction = { type: "INCOME", amount: "", occurredAt: new Date().toISOString().slice(0, 10), receivedAt: new Date().toISOString().slice(0, 10), source: "", incomeClass: "ACTIVE", isNonArt: false, notes: "", projectId: "", customerId: "" };
  const [transactionForm, setTransactionForm] = useState(emptyTransaction);
  const [ventures, setVentures] = useState<Venture[]>([]);
  const [showVenture, setShowVenture] = useState(false);
  const [editingVentureId, setEditingVentureId] = useState<string | null>(null);
  const emptyVenture = { name: "", description: "", status: "IDEA", demand: 3, margin: 3, recurrence: 3, automation: 3, defensibility: 3, startupCost: 3, weeklyHours: 3, nextAction: "" };
  const [ventureForm, setVentureForm] = useState(emptyVenture);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [showCustomer, setShowCustomer] = useState(false);
  const [editingCustomerId, setEditingCustomerId] = useState<string | null>(null);
  const emptyCustomer = { name: "", email: "", phone: "", type: "LEAD", status: "LEAD", notes: "", lastContactAt: "" };
  const [customerForm, setCustomerForm] = useState(emptyCustomer);

  useEffect(() => {
    const saved = localStorage.getItem("wizard-os-gabriels-horn");
    if (saved) { try { setArtwork(JSON.parse(saved)); setLegacyAvailable(true); } catch {} }
    setLoaded(true);
  }, []);
  useEffect(() => {
    const query = new URLSearchParams(window.location.search);
    if (query.get("view") === "money") {setView("money"); if(query.get("month"))setSelectedMonth(query.get("month")!);}
  }, []);
  useEffect(() => {
    const id=new URLSearchParams(window.location.search).get("project");
    const found=projects.find(p=>p.id===id);
    if(found) {openProject(found);}
  }, [projects]);
  const loadProjects = () => {
    return fetch("/api/projects")
      .then((response) => {
        if (!response.ok) throw new Error("Projects are unavailable");
        return response.json();
      })
      .then((data: Project[]) => {
        setProjects(data);
      })
      .catch(() => {
        // Keep the demo queue available until the local database is migrated and seeded.
      });
  };
  useEffect(() => {
    loadProjects();
    fetch("/api/templates").then((response) => response.ok ? response.json() : []).then((data: WorkflowTemplate[]) => {
      setTemplates(data);
      const artworkTemplate = data.find((template) => template.projectType === "ARTWORK");
      if (artworkTemplate) {
        setNewProject((current) => ({ ...current, templateId: artworkTemplate.id }));
        setNewProjectStages(artworkTemplate.stages.map((stage) => stage.name));
      }
    }).catch(() => {});
  }, []);


  const loadMoney = () => Promise.all([
    fetch(`/api/transactions?month=${selectedMonth}`).then((response) => response.ok ? response.json() : []),
    fetch(`/api/metrics/income?month=${selectedMonth}`).then((response) => response.ok ? response.json() : incomeMetrics),
  ]).then(([ledger, metrics]) => { setTransactions(ledger); setIncomeMetrics(metrics); }).catch(() => {});
  useEffect(() => { loadMoney(); }, [selectedMonth]);
  const loadVentures = () => fetch("/api/ventures").then((response) => response.ok ? response.json() : []).then(setVentures).catch(() => {});
  useEffect(() => { loadVentures(); }, []);
  const loadCustomers = () => fetch("/api/customers").then((response) => response.ok ? response.json() : []).then(setCustomers).catch(() => {});
  useEffect(() => { loadCustomers(); }, []);

  const patch = <K extends keyof Artwork>(key: K, value: Artwork[K]) => setArtwork((p) => ({ ...p, [key]: value }));
  const patchStage = <K extends StageKey>(key: K, value: Partial<Artwork[K]>) => setArtwork((p) => ({ ...p, [key]: { ...(p[key] as object), ...value } }));

  const salesReadiness = useMemo(() => {
    const checks = [artwork.completion === 100, artwork.finish.varnished, artwork.photography.hero, artwork.photography.edited, artwork.archive.ingested, !!artwork.pricing.price, artwork.publishing.bigCartel];
    return Math.round((checks.filter(Boolean).length / checks.length) * 100);
  }, [artwork]);

  const marketingReadiness = useMemo(() => {
    const vals = Object.values(artwork.marketing);
    return Math.round((vals.filter((v) => v !== "Not Planned").length / vals.length) * 100);
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

  const openProject = async (p: Project) => {
    setSelectedProject(p);
    setView("project");
    setProjectDetail(null);
    {
      const response = await fetch(`/api/projects/${p.id}`);
      if (response.ok) setProjectDetail(await response.json());
      else setFormError("Could not load project. Please reopen it.");
    }
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const refreshProject = async () => {
    if (!selectedProject) return;
    const r = await fetch(`/api/projects/${selectedProject.id}`);
    if (!r.ok) throw new Error('Could not refresh project.');
    const detail = await r.json(); setProjectDetail(detail);
    setSelectedProject(current=>current ? {...current, title: detail.title, status: detail.status, progress: detail.progress} : current);
    await loadProjects();
  };
  const importLegacy = async () => {
    setSaving(true); setFormError('');
    try {
      const data = localStorage.getItem('wizard-os-gabriels-horn');
      if (!data) throw new Error('No earlier details found.');
      const r = await fetch('/api/projects/gabriel/import-legacy', {method:'POST', headers:{'Content-Type':'application/json'}, body:data});
      if (!r.ok) throw new Error((await r.json()).error || 'Import failed.');
      const result = await r.json();
      setLegacyAvailable(false); await refreshProject();
      setFormError(result.imported ? `Imported ${result.imported} untouched stages. Your browser copy is retained.` : 'No stages imported: existing database edits were preserved. Your browser copy is retained.');
    } catch(e) {setFormError(e instanceof Error ? e.message : 'Import failed.');} finally {setSaving(false);}
  };

  const chooseProjectType = (type: string) => {
    const template = templates.find((item) => item.projectType === type);
    setNewProject((current) => ({ ...current, type, templateId: template?.id ?? "" }));
    setNewProjectStages(template?.stages.map((stage) => stage.name) ?? []);
  };

  const chooseWorkflow = (templateId: string) => {
    const template = templates.find((item) => item.id === templateId);
    setNewProject((current) => ({ ...current, templateId }));
    setNewProjectStages(template?.stages.map((stage) => stage.name) ?? []);
  };

  const updateNewProjectStage = (index: number, name: string) => setNewProjectStages((current) => current.map((stage, position) => position === index ? name : stage));
  const moveNewProjectStage = (index: number, direction: -1 | 1) => setNewProjectStages((current) => {
    const target = index + direction;
    if (target < 0 || target >= current.length) return current;
    const next = [...current];
    [next[index], next[target]] = [next[target], next[index]];
    return next;
  });

  const createProject = async () => {
    setSaving(true); setFormError("");
    const response = await fetch("/api/projects", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...newProject, stages: newProjectStages }) });
    const result = await response.json();
    setSaving(false);
    if (!response.ok) return setFormError(result.error ?? "Could not create project.");
    setShowNewProject(false);
    setNewProject({ title: "", type: "ARTWORK", templateId: templates.find((item) => item.projectType === "ARTWORK")?.id ?? "", value: "", dueDate: "", nextAction: "", customerId: "" });
    setNewProjectStages(templates.find((item) => item.projectType === "ARTWORK")?.stages.map((stage) => stage.name) ?? []);
    loadProjects();
  };

  const saveProject = async () => {
    if (!projectDetail) return;
    setSaving(true); setFormError("");
    const response = await fetch(`/api/projects/${projectDetail.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...projectDetail, value: projectDetail.valueCents == null ? "" : projectDetail.valueCents / 100, dueDate: projectDetail.dueDate?.slice(0, 10) ?? "" }) });
    setSaving(false);
    if (!response.ok) return setFormError("Could not save project.");
    await loadProjects();
  };

  const archiveProject = async () => {
    if (!projectDetail || !window.confirm(`Archive ${projectDetail.title}?`)) return;
    await fetch(`/api/projects/${projectDetail.id}`, { method: "DELETE" });
    setProjectDetail(null); setSelectedProject(null); setView("dashboard"); loadProjects();
  };

  const updateWorkflowStage = async (stage: WorkflowStage, status: string) => {
    if (!projectDetail) return;
    const response = await fetch(`/api/projects/${projectDetail.id}/stages/${stage.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status, progress: status === "IN_PROGRESS" ? Math.max(stage.progress, 25) : stage.progress }) });
    if (!response.ok) return setFormError("Could not update workflow stage.");
    const refreshed = await fetch(`/api/projects/${projectDetail.id}`);
    if (refreshed.ok) setProjectDetail(await refreshed.json());
    loadProjects();
  };

  const money = (cents: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(cents / 100);

  const openTransaction = (transaction?: Transaction) => {
    setFormError("");
    setEditingTransactionId(transaction?.id ?? null);
    setTransactionForm(transaction ? {
      type: transaction.type, amount: String(transaction.amountCents / 100), occurredAt: transaction.occurredAt.slice(0, 10), receivedAt: transaction.receivedAt?.slice(0, 10) ?? transaction.occurredAt.slice(0, 10), source: transaction.source, incomeClass: transaction.incomeClass ?? "ACTIVE", isNonArt: transaction.isNonArt, notes: transaction.notes ?? "", projectId: transaction.projectId ?? "", customerId: transaction.customerId ?? "",
    } : { ...emptyTransaction, occurredAt: `${selectedMonth}-${new Date().getDate().toString().padStart(2, "0")}`, receivedAt: `${selectedMonth}-${new Date().getDate().toString().padStart(2, "0")}` });
    setShowTransaction(true);
  };

  const saveTransaction = async () => {
    setSaving(true); setFormError("");
    const response = await fetch(editingTransactionId ? `/api/transactions/${editingTransactionId}` : "/api/transactions", { method: editingTransactionId ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(transactionForm) });
    const result = response.status === 204 ? {} : await response.json();
    setSaving(false);
    if (!response.ok) return setFormError(result.error ?? "Could not save transaction.");
    setShowTransaction(false); await loadMoney();
  };

  const deleteTransaction = async () => {
    if (!editingTransactionId || !window.confirm("Delete this transaction?")) return;
    await fetch(`/api/transactions/${editingTransactionId}`, { method: "DELETE" });
    setShowTransaction(false); await loadMoney();
  };

  const openVenture = (venture?: Venture) => {
    setFormError(""); setEditingVentureId(venture?.id ?? null);
    setVentureForm(venture ? { name: venture.name, description: venture.description ?? "", status: venture.status, demand: venture.demand, margin: venture.margin, recurrence: venture.recurrence, automation: venture.automation, defensibility: venture.defensibility, startupCost: venture.startupCost, weeklyHours: venture.weeklyHours, nextAction: venture.nextAction ?? "" } : emptyVenture);
    setShowVenture(true);
  };

  const saveVenture = async () => {
    setSaving(true); setFormError("");
    const response = await fetch(editingVentureId ? `/api/ventures/${editingVentureId}` : "/api/ventures", { method: editingVentureId ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(ventureForm) });
    const result = await response.json(); setSaving(false);
    if (!response.ok) return setFormError(result.error ?? "Could not save venture.");
    setShowVenture(false); loadVentures();
  };

  const archiveVenture = async () => {
    if (!editingVentureId || !window.confirm("Archive this venture?")) return;
    await fetch(`/api/ventures/${editingVentureId}`, { method: "DELETE" }); setShowVenture(false); loadVentures();
  };

  const openCustomer = (customer?: Customer) => {
    setFormError(""); setEditingCustomerId(customer?.id ?? null);
    setCustomerForm(customer ? { name: customer.name, email: customer.email ?? "", phone: customer.phone ?? "", type: customer.type, status: customer.status, notes: customer.notes ?? "", lastContactAt: customer.lastContactAt?.slice(0, 10) ?? "" } : emptyCustomer);
    setShowCustomer(true);
  };

  const saveCustomer = async () => {
    setSaving(true); setFormError("");
    const response = await fetch(editingCustomerId ? `/api/customers/${editingCustomerId}` : "/api/customers", { method: editingCustomerId ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(customerForm) });
    const result = await response.json(); setSaving(false);
    if (!response.ok) return setFormError(result.error ?? "Could not save customer.");
    setShowCustomer(false); loadCustomers();
  };

  const archiveCustomer = async () => {
    if (!editingCustomerId || !window.confirm("Archive this customer?")) return;
    await fetch(`/api/customers/${editingCustomerId}`, { method: "DELETE" }); setShowCustomer(false); loadCustomers();
  };

  const Dashboard = () => <>
    <header className="topbar"><div><p className="eyebrow">Wednesday · September 9</p><h2>The Crucible</h2></div><div className="dashboardActions"><a className="primary warlockMobile" href="/etsy">Warlock</a><button className="primary" onClick={() => setShowNewProject(true)}>+ New Work Order</button></div></header>
    <CampaignDashboard />
    <section className="metrics">
      <article className="metric"><span>Month Revenue</span><strong>{money(incomeMetrics.totalCents)}</strong><small>Income actually received</small></article>
      <article className="metric"><span>Qualifying Income</span><strong>{money(incomeMetrics.qualifyingCents)}</strong><small>{incomeMetrics.qualifyingShare}% of received income</small></article>
      <article className="metric"><span>Open Work</span><strong>{projects.length}</strong><small>Active project records</small></article>
      <article className="metric"><span>Next Freedom Target</span><strong>{incomeMetrics.nextTarget.progress}%</strong><small>{money(incomeMetrics.qualifyingCents)} / {money(incomeMetrics.nextTarget.targetCents)}</small></article>
    </section>

    <section className="panel projectPanel">
      <div className="panelHead"><div><p className="eyebrow">Studio + business</p><h3>Works in Progress</h3></div><span className="panelHint">Select any item to enter its workspace</span></div>
      <div className="projectGrid">{projects.map((p) => <button className="projectCard" key={p.id} onClick={() => openProject(p)}>
        <div className="projectCardTop"><span className={`status ${p.tone}`}>{p.kind}</span><span className="openHint">Open ↗</span></div>
        <h3>{p.title}</h3><p>{p.status}</p><div className="progress"><i style={{ width: `${p.progress}%` }} /></div>
        <div className="projectMeta"><span>{p.progress}%</span><span>{p.due}</span></div><small>Next: {p.next}</small>
      </button>)}</div>
    </section>

    <section className="panel queuePanel"><div className="panelHead"><div><p className="eyebrow">FlightDeck-style queue</p><h3>Active Work</h3></div><div className="filters"><button>All</button><button>Due Soon</button><button>Waiting</button></div></div>
      <div className="tableWrap"><table><thead><tr><th>Type</th><th>Work</th><th>Status</th><th>Value</th><th>Due</th><th></th></tr></thead><tbody>{projects.map((p) => <tr key={p.id} className="clickRow" onClick={() => openProject(p)}><td><span className={`status ${p.tone}`}>{p.kind}</span></td><td>{p.title}</td><td>{p.status}</td><td>{p.value}</td><td>{p.due}</td><td>→</td></tr>)}</tbody></table></div>
    </section>

    <section className="lowerGrid"><article className="panel"><div className="panelHead"><div><p className="eyebrow">Priority</p><h3>Next Best Actions</h3></div></div><ol className="actions">{projects.filter(p=>!['COMPLETE','ARCHIVED'].includes(p.statusEnum ?? '')).slice(0,5).map((p,i)=><li key={p.id}><span>{String(i+1).padStart(2,'0')}</span><div><button className="backButton" onClick={()=>openProject(p)}>{p.next}</button><p>{p.title} · {p.status} · {p.due}</p></div></li>)}</ol>{!projects.some(p=>!['COMPLETE','ARCHIVED'].includes(p.statusEnum ?? '')) && <p className="note">No unfinished work.</p>}</article><article className="panel"><div className="panelHead"><div><p className="eyebrow">Income mix</p><h3>Revenue Sources</h3></div></div><div className="mix"><div><span>Services</span><strong>54%</strong></div><div><span>Art</span><strong>36%</strong></div><div><span>Recurring</span><strong>10%</strong></div></div><div className="rule">✦</div><p className="note">Goal: grow recurring income without increasing required weekly hours.</p></article></section>
  </>;

  const ArtworkWorkspace = () => <>
    <header className="topbar"><div><button className="backButton" onClick={() => setView("dashboard")}>← The Crucible</button><p className="eyebrow">Artwork workflow · Live record</p><h2>{artwork.title}</h2></div><span className="autosave">● Auto-saved locally</span></header>
    <section className="artHero panel"><div className="heroMain"><div className="artPlaceholder"><span>GH</span><small>Artwork image not added</small></div><div className="artIdentity"><p className="eyebrow">Mad Wizard Art · Original</p><input className="titleInput" value={artwork.title} onChange={(e) => patch("title", e.target.value)} /><div className="inlineFields"><input value={artwork.medium} onChange={(e) => patch("medium", e.target.value)} placeholder="Medium" /><input value={artwork.dimensions} onChange={(e) => patch("dimensions", e.target.value)} placeholder="Dimensions" /><input value={artwork.year} onChange={(e) => patch("year", e.target.value)} placeholder="Year" /></div><div className="completionRow"><span>Artwork completion</span><strong>{artwork.completion}%</strong></div><input className="range" type="range" min="0" max="100" value={artwork.completion} onChange={(e) => patch("completion", Number(e.target.value))} /></div></div><div className="readiness"><div><span>Artwork</span><strong>{artwork.completion}%</strong></div><div><span>Sales Ready</span><strong>{salesReadiness}%</strong></div><div><span>Marketing</span><strong>{marketingReadiness}%</strong></div></div></section>
    <section className="nextAction panel"><div><p className="eyebrow">Next action</p><h3>{nextAction}</h3></div><span className="actionArrow">→</span></section>
    <section className="workflowGrid">{stages.map((s) => <button className="stageCard" key={s.key} onClick={() => setOpenStage(s.key)}><div className="stageTop"><span className="stageIcon">{s.icon}</span><span className="editHint">Edit ↗</span></div><h3>{s.title}</h3><p>{s.status}</p><div className="progress"><i style={{ width: `${Math.min(s.progress, 100)}%` }} /></div></button>)}</section>
    <section className="panel quickDetails"><div className="panelHead"><div><p className="eyebrow">Artwork details</p><h3>Studio Record</h3></div></div><div className="formGrid"><Field label="Status"><select value={artwork.artworkStatus} onChange={(e) => patch("artworkStatus", e.target.value)}><option>Idea</option><option>In Progress</option><option>Complete</option><option>On Hold</option></select></Field><Toggle label="Signed" checked={artwork.signed} onChange={(v) => patch("signed", v)} /><Field label="Studio notes"><textarea value={artwork.notes} onChange={(e) => patch("notes", e.target.value)} placeholder="Process notes, symbolism, reminders…" /></Field></div></section>
  </>;

  const ProjectWorkspace = () => selectedProject && <>
    <header className="topbar"><div><button className="backButton" onClick={() => setView("dashboard")}>← The Crucible</button><p className="eyebrow">{selectedProject.kind} workspace</p><h2>{selectedProject.title}</h2></div><span className={`status ${selectedProject.tone}`}>{selectedProject.status}</span></header>
    {!projectDetail ? <section className="panel"><p className="note">Loading project record…</p></section> : <>
      <section className="panel genericHero"><div><p className="eyebrow">Current progress</p><strong className="bigProgress">{projectDetail.progress}%</strong><div className="progress"><i style={{ width: `${projectDetail.progress}%` }} /></div></div><div className="genericStats"><div><span>Workflow</span><strong>{projectDetail.template?.name ?? "Custom"}</strong></div><div><span>Due</span><strong>{projectDetail.dueDate ? new Date(projectDetail.dueDate).toLocaleDateString() : "No deadline"}</strong></div><div><span>Next action</span><strong>{projectDetail.nextAction ?? "Choose next action"}</strong></div></div></section>
      <section className="workflowGrid genericWorkflow">{projectDetail.stages.map((stage, i) => <button className="stageCard" key={stage.id} onClick={()=>setEditingStage(stage)}><div className="stageTop"><span className="stageIcon">{String(i+1).padStart(2,'0')}</span><span className="editHint">Edit ↗</span></div><h3>{stage.name}</h3><p>{stage.status.replaceAll('_',' ')} · {stage.progress}%</p><div className="progress"><i style={{width: `${stage.progress}%`}}/></div></button>)}</section>
      {projectDetail.id === 'gabriel' && legacyAvailable && <section className="panel"><p>Earlier Gabriel’s Horn edits were found in this browser. Import fills untouched stages only; your browser copy is retained.</p><button className="primary" disabled={saving} onClick={importLegacy}>Import earlier artwork details</button></section>}
      <section className="panel"><div className="panelHead"><div><p className="eyebrow">Persistent record</p><h3>Project Details</h3></div></div><div className="formGrid"><Field label="Title"><input value={projectDetail.title} onChange={(event) => setProjectDetail({ ...projectDetail, title: event.target.value })} /></Field><Field label="Status"><select value={projectDetail.status} onChange={(event) => setProjectDetail({ ...projectDetail, status: event.target.value })}><option value="PLANNED">Planned</option><option value="ACTIVE">Active</option><option value="WAITING">Waiting</option><option value="BLOCKED">Blocked</option><option value="COMPLETE">Complete</option></select></Field><Field label="Related contact"><select value={projectDetail.customerId ?? ""} onChange={(event) => setProjectDetail({ ...projectDetail, customerId: event.target.value || null })}><option value="">None</option>{customers.map((customer) => <option key={customer.id} value={customer.id}>{customer.name}</option>)}</select></Field><Field label="Value ($)"><input type="number" min="0" value={projectDetail.valueCents == null ? "" : projectDetail.valueCents / 100} onChange={(event) => setProjectDetail({ ...projectDetail, valueCents: event.target.value === "" ? null : Math.round(Number(event.target.value) * 100) })} /></Field><Field label="Due date"><input type="date" value={projectDetail.dueDate?.slice(0, 10) ?? ""} onChange={(event) => setProjectDetail({ ...projectDetail, dueDate: event.target.value || null })} /></Field><Field label="Next action"><input value={projectDetail.nextAction ?? ""} onChange={(event) => setProjectDetail({ ...projectDetail, nextAction: event.target.value })} /></Field><Field label="Notes"><textarea value={projectDetail.notes ?? ""} onChange={(event) => setProjectDetail({ ...projectDetail, notes: event.target.value })} /></Field></div>{formError && <p className="formError">{formError}</p>}<div className="modalFoot"><button className="danger" onClick={archiveProject}>Archive project</button><button className="primary" disabled={saving} onClick={saveProject}>{saving ? "Saving…" : "Save changes"}</button></div></section>
    </>}
  </>;

  const MoneyWorkspace = () => <>
    <header className="topbar"><div><p className="eyebrow">Cashflow ledger</p><h2>Money</h2></div><div className="moneyControls"><input type="month" value={selectedMonth} onChange={(event) => setSelectedMonth(event.target.value)} /><button className="primary" onClick={() => openTransaction()}>+ Transaction</button></div></header>
    <section className="metrics">
      <article className="metric"><span>Received Income</span><strong>{money(incomeMetrics.totalCents)}</strong><small>Income less refunds</small></article>
      <article className="metric"><span>Qualifying Non-Art Income</span><strong>{money(incomeMetrics.qualifyingCents)}</strong><small>Recurring + passive-like only</small></article>
      <article className="metric"><span>Qualifying Share</span><strong>{incomeMetrics.qualifyingShare}%</strong><small>Of received income</small></article>
      <article className="metric"><span>Next Milestone</span><strong>{money(incomeMetrics.nextTarget.targetCents)}</strong><small>{money(incomeMetrics.nextTarget.remainingCents)} remaining</small></article>
    </section>
    <section className="panel milestonePanel"><div className="panelHead"><div><p className="eyebrow">Freedom targets</p><h3>Monthly Qualifying Income</h3></div><span className="panelHint">Only received, recurring or passive-like non-art income counts</span></div><div className="milestoneGrid">{incomeMetrics.targets.map((target) => <div className="milestone" key={target.targetCents}><div><strong>{money(target.targetCents)}</strong><span>{target.progress}%</span></div><div className="progress"><i style={{ width: `${target.progress}%` }} /></div><small>{target.remainingCents ? `${money(target.remainingCents)} remaining` : "Milestone reached"}</small></div>)}</div></section>
    <section className="panel"><div className="panelHead"><div><p className="eyebrow">Selected month</p><h3>Income &amp; Expense Ledger</h3></div><span className="panelHint">Select a row to edit</span></div>{transactions.length === 0 ? <div className="emptyState"><strong>No transactions yet</strong><p>Add received income or an expense to begin measuring this month.</p><button className="primary" onClick={() => openTransaction()}>Add first transaction</button></div> : <div className="tableWrap"><table><thead><tr><th>Date</th><th>Type</th><th>Source</th><th>Class</th><th>Qualifies</th><th>Amount</th></tr></thead><tbody>{transactions.map((transaction) => <tr className="clickRow" key={transaction.id} onClick={() => openTransaction(transaction)}><td>{new Date(transaction.occurredAt).toLocaleDateString()}</td><td>{transaction.type.replace("_", " ")}</td><td>{transaction.source}</td><td>{transaction.incomeClass?.replace("_", " ") ?? "—"}</td><td>{transaction.isNonArt && (transaction.incomeClass === "RECURRING" || transaction.incomeClass === "PASSIVE_LIKE") ? "Yes" : "No"}</td><td className={transaction.type === "EXPENSE" || transaction.type === "REFUND" ? "negative" : "positive"}>{transaction.type === "EXPENSE" || transaction.type === "REFUND" ? "−" : "+"}{money(transaction.amountCents)}</td></tr>)}</tbody></table></div>}</section>
  </>;

  const VenturesWorkspace = () => <>
    <header className="topbar"><div><p className="eyebrow">Opportunity portfolio</p><h2>Ventures</h2></div><button className="primary" onClick={() => openVenture()}>+ New Venture</button></header>
    <section className="panel ventureIntro"><div><p className="eyebrow">Decision aid</p><h3>Prioritize freedom, not busyness</h3><p className="note">Scores reward demand, margin, recurrence, and automation. High startup costs and required weekly hours lower the result.</p></div><div className="scoreLegend"><strong>0–39</strong><span>Weak</span><strong>40–69</strong><span>Test carefully</span><strong>70–100</strong><span>High potential</span></div></section>
    {ventures.length === 0 ? <section className="panel emptyState"><strong>No ventures scored yet</strong><p>Add an income idea to compare its financial usefulness and administrative burden.</p><button className="primary" onClick={() => openVenture()}>Score first venture</button></section> : <section className="ventureGrid">{ventures.map((venture) => <button className="ventureCard" key={venture.id} onClick={() => openVenture(venture)}><div className="ventureTop"><span className={`score ${venture.score >= 70 ? "high" : venture.score >= 40 ? "mid" : "low"}`}>{venture.score}</span><span className="status navy">{venture.status.replace("_", " ")}</span></div><h3>{venture.name}</h3><p>{venture.description || "No description yet."}</p><div className="ventureFactors"><span>Demand <b>{venture.demand}</b></span><span>Margin <b>{venture.margin}</b></span><span>Recurring <b>{venture.recurrence}</b></span><span>Automation <b>{venture.automation}</b></span></div><small>Next: {venture.nextAction || "Choose a validation action"}</small></button>)}</section>}
  </>;

  const CustomersWorkspace = () => <>
    <header className="topbar"><div><p className="eyebrow">Collectors, clients &amp; leads</p><h2>Clients</h2></div><button className="primary" onClick={() => openCustomer()}>+ New Contact</button></header>
    <section className="panel customerIntro"><div><p className="eyebrow">Relationship ledger</p><h3>Keep the human context with the work</h3><p className="note">Track only what helps you follow up: contact details, the last conversation, connected projects, and received payments.</p></div><strong>{customers.length} active contacts</strong></section>
    {customers.length === 0 ? <section className="panel emptyState"><strong>No contacts yet</strong><p>Add a collector, client, or lead. Only their name is required.</p><button className="primary" onClick={() => openCustomer()}>Add first contact</button></section> : <section className="customerGrid">{customers.map((customer) => <button className="customerCard" key={customer.id} onClick={() => openCustomer(customer)}><div className="customerTop"><span className="customerInitial">{customer.name.slice(0, 1).toUpperCase()}</span><span className={`status ${customer.status === "ACTIVE" ? "green" : "navy"}`}>{customer.status}</span></div><h3>{customer.name}</h3><p>{customer.type.replace("_", " ")} · {customer.email || customer.phone || "No contact details"}</p><div className="customerStats"><span><b>{customer._count.projects}</b> projects</span><span><b>{customer._count.transactions}</b> payments</span><span><b>{money(customer.receivedCents)}</b> received</span></div><small>Last contact: {customer.lastContactAt ? new Date(customer.lastContactAt).toLocaleDateString() : "Not recorded"}</small></button>)}</section>}
  </>;

  return <main className="shell"><aside className="sidebar"><div className="brand"><span className="sigil">✦</span><div><h1>Wizard OS</h1><p>Operations Console</p></div></div><nav>{nav.map((item) => <button key={item} onClick={() => ["Campaigns", "Calendar", "Inventory"].includes(item) ? window.location.assign("/" + item.toLowerCase()) : item === "The Crucible" ? setView("dashboard") : item === "Money" ? setView("money") : item === "Ventures" ? setView("ventures") : item === "Clients" ? setView("customers") : undefined} className={item === "The Crucible" && view === "dashboard" ? "navItem active" : item === "Money" && view === "money" ? "navItem active" : item === "Ventures" && view === "ventures" ? "navItem active" : item === "Clients" && view === "customers" ? "navItem active" : item === "Projects" && (view === "project" || view === "artwork") ? "navItem active" : "navItem"}>{item}</button>)}</nav><div className="sidebarBottom"><a className="primary warlockLink" href="/etsy">Warlock</a><div className="sidebarFoot"><span>System</span><strong>All clear</strong></div></div></aside><section className="workspace">{view === "dashboard" ? <Dashboard /> : view === "money" ? <MoneyWorkspace /> : view === "ventures" ? <VenturesWorkspace /> : view === "customers" ? <CustomersWorkspace /> : view === "artwork" ? <ArtworkWorkspace /> : <ProjectWorkspace />}</section>

    {editingStage && selectedProject && <StageEditor stage={editingStage} projectId={selectedProject.id} close={()=>setEditingStage(null)} saved={refreshProject}/>}
    {showNewProject && <div className="modalBackdrop" onMouseDown={() => setShowNewProject(false)}><section className="editWindow workOrderWindow" onMouseDown={(event) => event.stopPropagation()}>
      <div className="modalHead"><div><p className="eyebrow">FlightDeck-style intake</p><h2>Create Work Order</h2></div><button className="close" onClick={() => setShowNewProject(false)}>×</button></div>
      <div className="workOrderLayout"><div className="formGrid workOrderFields">
        <Field label="Project title"><input autoFocus value={newProject.title} onChange={(event) => setNewProject({ ...newProject, title: event.target.value })} placeholder="What are you working on?" /></Field>
        <Field label="Kind of work"><select value={newProject.type} onChange={(event) => chooseProjectType(event.target.value)}><option value="ARTWORK">Original artwork</option><option value="COMMISSION">Commission</option><option value="DIGITAL_PRODUCT">Digital product</option><option value="CONTENT">Content</option></select></Field>
        <Field label="Workflow template"><select value={newProject.templateId} onChange={(event) => chooseWorkflow(event.target.value)}>{templates.filter((template) => template.projectType === newProject.type).map((template) => <option key={template.id} value={template.id}>{template.name}</option>)}</select></Field>
        <Field label="Related contact"><select value={newProject.customerId} onChange={(event) => setNewProject({ ...newProject, customerId: event.target.value })}><option value="">None</option>{customers.map((customer) => <option key={customer.id} value={customer.id}>{customer.name}</option>)}</select></Field>
        <Field label="Value ($)"><input type="number" min="0" value={newProject.value} onChange={(event) => setNewProject({ ...newProject, value: event.target.value })} /></Field>
        <Field label="Due date"><input type="date" value={newProject.dueDate} onChange={(event) => setNewProject({ ...newProject, dueDate: event.target.value })} /></Field>
        <Field label="First next action"><input value={newProject.nextAction} onChange={(event) => setNewProject({ ...newProject, nextAction: event.target.value })} placeholder={newProjectStages[0] || "Choose the first action"} /></Field>
      </div><section className="workflowBuilder"><div className="workflowBuilderHead"><div><p className="eyebrow">Production route</p><h3>Workflow Stages</h3></div><span>{newProjectStages.length} stages</span></div><p className="note">The template is copied into this work order. Rename, reorder, add, or remove stages without changing the reusable template.</p><ol>{newProjectStages.map((stage, index) => <li key={index}><span>{String(index + 1).padStart(2, "0")}</span><input value={stage} maxLength={80} onChange={(event) => updateNewProjectStage(index, event.target.value)} /><div><button disabled={index === 0} onClick={() => moveNewProjectStage(index, -1)} aria-label="Move stage up">↑</button><button disabled={index === newProjectStages.length - 1} onClick={() => moveNewProjectStage(index, 1)} aria-label="Move stage down">↓</button><button className="removeStage" disabled={newProjectStages.length === 1} onClick={() => setNewProjectStages((current) => current.filter((_, position) => position !== index))} aria-label="Remove stage">×</button></div></li>)}</ol><button className="addStage" disabled={newProjectStages.length >= 12} onClick={() => setNewProjectStages((current) => [...current, "New stage"])}>+ Add stage</button></section></div>
      {formError && <p className="formError">{formError}</p>}<div className="modalFoot"><span>This creates a live project with its own editable workflow.</span><button className="primary" disabled={saving || !newProject.title.trim() || !newProject.templateId || !newProjectStages.some((stage) => stage.trim())} onClick={createProject}>{saving ? "Creating…" : "Create work order"}</button></div>
    </section></div>}

    {showTransaction && <div className="modalBackdrop" onMouseDown={() => setShowTransaction(false)}><section className="editWindow" onMouseDown={(event) => event.stopPropagation()}><div className="modalHead"><div><p className="eyebrow">Money ledger</p><h2>{editingTransactionId ? "Edit Transaction" : "Add Transaction"}</h2></div><button className="close" onClick={() => setShowTransaction(false)}>×</button></div><div className="formGrid"><Field label="Type"><select value={transactionForm.type} onChange={(event) => setTransactionForm({ ...transactionForm, type: event.target.value })}><option value="INCOME">Income</option><option value="EXPENSE">Expense</option><option value="REFUND">Refund</option></select></Field><Field label="Amount ($)"><input type="number" min="0.01" step="0.01" value={transactionForm.amount} onChange={(event) => setTransactionForm({ ...transactionForm, amount: event.target.value })} /></Field><Field label="Transaction date"><input type="date" value={transactionForm.occurredAt} onChange={(event) => setTransactionForm({ ...transactionForm, occurredAt: event.target.value })} /></Field>{transactionForm.type !== "EXPENSE" && <Field label="Date received"><input type="date" value={transactionForm.receivedAt} onChange={(event) => setTransactionForm({ ...transactionForm, receivedAt: event.target.value })} /></Field>}<Field label="Source"><input value={transactionForm.source} onChange={(event) => setTransactionForm({ ...transactionForm, source: event.target.value })} placeholder="Etsy, commission, client…" /></Field>{transactionForm.type !== "EXPENSE" && <Field label="Income class"><select value={transactionForm.incomeClass} onChange={(event) => setTransactionForm({ ...transactionForm, incomeClass: event.target.value })}><option value="ACTIVE">Active</option><option value="RECURRING">Recurring</option><option value="PASSIVE_LIKE">Passive-like</option></select></Field>}{transactionForm.type !== "EXPENSE" && <Toggle label="Non-art income" checked={transactionForm.isNonArt} onChange={(value) => setTransactionForm({ ...transactionForm, isNonArt: value })} />}<Field label="Related project"><select value={transactionForm.projectId} onChange={(event) => setTransactionForm({ ...transactionForm, projectId: event.target.value })}><option value="">None</option>{projects.map((project) => <option key={project.id} value={project.id}>{project.title}</option>)}</select></Field><Field label="Related contact"><select value={transactionForm.customerId} onChange={(event) => setTransactionForm({ ...transactionForm, customerId: event.target.value })}><option value="">None</option>{customers.map((customer) => <option key={customer.id} value={customer.id}>{customer.name}</option>)}</select></Field><Field label="Notes"><textarea value={transactionForm.notes} onChange={(event) => setTransactionForm({ ...transactionForm, notes: event.target.value })} /></Field></div>{formError && <p className="formError">{formError}</p>}<div className="modalFoot">{editingTransactionId ? <button className="danger" onClick={deleteTransaction}>Delete</button> : <span>Qualifying income requires both non-art and recurring/passive-like.</span>}<button className="primary" disabled={saving} onClick={saveTransaction}>{saving ? "Saving…" : "Save transaction"}</button></div></section></div>}

    {showVenture && <div className="modalBackdrop" onMouseDown={() => setShowVenture(false)}><section className="editWindow" onMouseDown={(event) => event.stopPropagation()}><div className="modalHead"><div><p className="eyebrow">Opportunity scorecard</p><h2>{editingVentureId ? "Edit Venture" : "New Venture"}</h2></div><button className="close" onClick={() => setShowVenture(false)}>×</button></div><div className="formGrid"><Field label="Venture name"><input value={ventureForm.name} onChange={(event) => setVentureForm({ ...ventureForm, name: event.target.value })} placeholder="Digital templates, licensing…" /></Field><Field label="Status"><select value={ventureForm.status} onChange={(event) => setVentureForm({ ...ventureForm, status: event.target.value })}><option value="IDEA">Idea</option><option value="VALIDATING">Validating</option><option value="ACTIVE">Active</option><option value="PAUSED">Paused</option></select></Field><Field label="Description"><textarea value={ventureForm.description} onChange={(event) => setVentureForm({ ...ventureForm, description: event.target.value })} /></Field><Field label="Next action"><input value={ventureForm.nextAction} onChange={(event) => setVentureForm({ ...ventureForm, nextAction: event.target.value })} /></Field>{([['demand','Demand'],['margin','Margin'],['recurrence','Recurring potential'],['automation','Automation potential'],['defensibility','Defensibility'],['startupCost','Startup cost burden'],['weeklyHours','Weekly hours burden']] as const).map(([key,label]) => <Field key={key} label={`${label}: ${ventureForm[key]}/5`}><input type="range" min="1" max="5" value={ventureForm[key]} onChange={(event) => setVentureForm({ ...ventureForm, [key]: Number(event.target.value) })} /></Field>)}</div><p className="note">Higher is better except startup cost and weekly hours, where a higher number means a heavier burden.</p>{formError && <p className="formError">{formError}</p>}<div className="modalFoot">{editingVentureId ? <button className="danger" onClick={archiveVenture}>Archive</button> : <span>Scores are comparable across all ventures.</span>}<button className="primary" disabled={saving || !ventureForm.name.trim()} onClick={saveVenture}>{saving ? "Saving…" : "Save venture"}</button></div></section></div>}

    {showCustomer && <div className="modalBackdrop" onMouseDown={() => setShowCustomer(false)}><section className="editWindow" onMouseDown={(event) => event.stopPropagation()}><div className="modalHead"><div><p className="eyebrow">Relationship record</p><h2>{editingCustomerId ? "Edit Contact" : "New Contact"}</h2></div><button className="close" onClick={() => setShowCustomer(false)}>×</button></div><div className="formGrid"><Field label="Name"><input autoFocus value={customerForm.name} onChange={(event) => setCustomerForm({ ...customerForm, name: event.target.value })} placeholder="Collector, client, or lead" /></Field><Field label="Type"><select value={customerForm.type} onChange={(event) => setCustomerForm({ ...customerForm, type: event.target.value })}><option value="COLLECTOR">Collector</option><option value="CLIENT">Client</option><option value="LEAD">Lead</option><option value="PARTNER">Partner</option><option value="OTHER">Other</option></select></Field><Field label="Status"><select value={customerForm.status} onChange={(event) => setCustomerForm({ ...customerForm, status: event.target.value })}><option value="LEAD">Lead</option><option value="ACTIVE">Active</option><option value="INACTIVE">Inactive</option></select></Field><Field label="Last contact"><input type="date" value={customerForm.lastContactAt} onChange={(event) => setCustomerForm({ ...customerForm, lastContactAt: event.target.value })} /></Field><Field label="Email"><input type="email" value={customerForm.email} onChange={(event) => setCustomerForm({ ...customerForm, email: event.target.value })} /></Field><Field label="Phone"><input value={customerForm.phone} onChange={(event) => setCustomerForm({ ...customerForm, phone: event.target.value })} /></Field><Field label="Contact notes"><textarea value={customerForm.notes} onChange={(event) => setCustomerForm({ ...customerForm, notes: event.target.value })} placeholder="Preferences, conversation notes, follow-up context…" /></Field></div>{formError && <p className="formError">{formError}</p>}<div className="modalFoot">{editingCustomerId ? <button className="danger" onClick={archiveCustomer}>Archive</button> : <span>Only the name is required.</span>}<button className="primary" disabled={saving || !customerForm.name.trim()} onClick={saveCustomer}>{saving ? "Saving…" : "Save contact"}</button></div></section></div>}

    {openStage && <div className="modalBackdrop" onMouseDown={() => setOpenStage(null)}><section className="editWindow" onMouseDown={(e) => e.stopPropagation()}><div className="modalHead"><div><p className="eyebrow">Editable workflow window</p><h2>{stages.find(s => s.key === openStage)?.title}</h2></div><button className="close" onClick={() => setOpenStage(null)}>×</button></div>
      {openStage === "finish" && <div className="formGrid"><Toggle label="Varnished" checked={artwork.finish.varnished} onChange={(v) => patchStage("finish", { varnished: v })} /><Field label="Varnish type"><input value={artwork.finish.varnishType} onChange={(e) => patchStage("finish", { varnishType: e.target.value })} placeholder="Gloss, satin, matte…" /></Field><Field label="Coats"><input value={artwork.finish.coats} onChange={(e) => patchStage("finish", { coats: e.target.value })} /></Field><Field label="Cure status"><select value={artwork.finish.cureStatus} onChange={(e) => patchStage("finish", { cureStatus: e.target.value })}><option>Not started</option><option>Drying</option><option>Cured</option></select></Field><Toggle label="Framed" checked={artwork.finish.framed} onChange={(v) => patchStage("finish", { framed: v })} /><Toggle label="Hanging hardware installed" checked={artwork.finish.hardware} onChange={(v) => patchStage("finish", { hardware: v })} /></div>}
      {openStage === "photography" && <div className="formGrid"><Field label="Photo status"><select value={artwork.photography.status} onChange={(e) => patchStage("photography", { status: e.target.value })}><option>Not started</option><option>Shot</option><option>Editing</option><option>Complete</option></select></Field><Toggle label="Hero photo" checked={artwork.photography.hero} onChange={(v) => patchStage("photography", { hero: v })} /><Toggle label="Detail shots" checked={artwork.photography.details} onChange={(v) => patchStage("photography", { details: v })} /><Toggle label="Framed shot" checked={artwork.photography.framedShot} onChange={(v) => patchStage("photography", { framedShot: v })} /><Toggle label="Scale / interior shot" checked={artwork.photography.scaleShot} onChange={(v) => patchStage("photography", { scaleShot: v })} /><Toggle label="Images edited" checked={artwork.photography.edited} onChange={(v) => patchStage("photography", { edited: v })} /></div>}
      {openStage === "archive" && <div className="formGrid"><Toggle label="Ingested into inventory" checked={artwork.archive.ingested} onChange={(v) => patchStage("archive", { ingested: v })} /><Field label="Inventory ID"><input value={artwork.archive.inventoryId} onChange={(e) => patchStage("archive", { inventoryId: e.target.value })} placeholder="MW-2026-001" /></Field><Field label="Collection / series"><input value={artwork.archive.collection} onChange={(e) => patchStage("archive", { collection: e.target.value })} /></Field><Toggle label="Certificate of authenticity ready" checked={artwork.archive.coa} onChange={(v) => patchStage("archive", { coa: v })} /><Field label="Master file location"><input value={artwork.archive.masterLocation} onChange={(e) => patchStage("archive", { masterLocation: e.target.value })} /></Field><Field label="Catalog description"><textarea value={artwork.archive.description} onChange={(e) => patchStage("archive", { description: e.target.value })} /></Field></div>}
      {openStage === "pricing" && <div className="formGrid"><Field label="Original price ($)"><input value={artwork.pricing.price} onChange={(e) => patchStage("pricing", { price: e.target.value })} /></Field><Field label="Minimum acceptable ($)"><input value={artwork.pricing.floor} onChange={(e) => patchStage("pricing", { floor: e.target.value })} /></Field><Field label="Cost basis ($)"><input value={artwork.pricing.costBasis} onChange={(e) => patchStage("pricing", { costBasis: e.target.value })} /></Field><Field label="Availability"><select value={artwork.pricing.availability} onChange={(e) => patchStage("pricing", { availability: e.target.value })}><option>Available</option><option>Reserved</option><option>Not for sale</option><option>Sold</option></select></Field><Toggle label="Eligible for prints" checked={artwork.pricing.prints} onChange={(v) => patchStage("pricing", { prints: v })} /><Field label="Shipping profile"><input value={artwork.pricing.shippingProfile} onChange={(e) => patchStage("pricing", { shippingProfile: e.target.value })} /></Field></div>}
      {openStage === "publishing" && <div className="formGrid"><Field label="Listing status"><select value={artwork.publishing.status} onChange={(e) => patchStage("publishing", { status: e.target.value })}><option>Not published</option><option>Drafting</option><option>Ready</option><option>Published</option></select></Field><Toggle label="Big Cartel" checked={artwork.publishing.bigCartel} onChange={(v) => patchStage("publishing", { bigCartel: v })} /><Toggle label="Website portfolio" checked={artwork.publishing.portfolio} onChange={(v) => patchStage("publishing", { portfolio: v })} /><Toggle label="Etsy" checked={artwork.publishing.etsy} onChange={(v) => patchStage("publishing", { etsy: v })} /><Toggle label="SEO complete" checked={artwork.publishing.seo} onChange={(v) => patchStage("publishing", { seo: v })} /></div>}
      {openStage === "marketing" && <div className="formGrid">{(["instagram","tiktok","youtubeShort","youtubeLong","pinterest","newsletter"] as const).map((k) => <Field key={k} label={k.replace(/([A-Z])/g, " $1")}><select value={artwork.marketing[k]} onChange={(e) => patchStage("marketing", { [k]: e.target.value })}>{marketingStates.map((s) => <option key={s}>{s}</option>)}</select></Field>)}</div>}
      {openStage === "fulfillment" && <div className="formGrid"><Toggle label="Sold" checked={artwork.fulfillment.sold} onChange={(v) => patchStage("fulfillment", { sold: v })} /><Field label="Buyer"><input value={artwork.fulfillment.buyer} onChange={(e) => patchStage("fulfillment", { buyer: e.target.value })} /></Field><Field label="Sale price ($)"><input value={artwork.fulfillment.salePrice} onChange={(e) => patchStage("fulfillment", { salePrice: e.target.value })} /></Field><Toggle label="Paid" checked={artwork.fulfillment.paid} onChange={(v) => patchStage("fulfillment", { paid: v })} /><Toggle label="Packed + COA" checked={artwork.fulfillment.packed} onChange={(v) => patchStage("fulfillment", { packed: v })} /><Toggle label="Shipped" checked={artwork.fulfillment.shipped} onChange={(v) => patchStage("fulfillment", { shipped: v })} /><Toggle label="Delivered" checked={artwork.fulfillment.delivered} onChange={(v) => patchStage("fulfillment", { delivered: v })} /></div>}
    </section></div>}

    <style jsx global>{`
      .metrics{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px;margin-bottom:14px}.metric{background:linear-gradient(180deg,var(--panel-2),var(--panel));border:1px solid var(--line);border-radius:9px;padding:15px 16px}.metric span{display:block;color:var(--muted);font-size:11px;margin-bottom:6px}.metric strong{display:block;font-size:24px;font-weight:650}.metric small{display:block;margin-top:5px;color:#7f8b97;font-size:10px}.projectPanel,.queuePanel{margin-bottom:14px}.projectGrid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px}.projectCard{text-align:left;min-width:0;padding:14px;border-radius:9px;border:1px solid var(--line);background:#0f1720;color:var(--ink);transition:.15s}.projectCard:hover{transform:translateY(-2px);border-color:#465463}.projectCardTop,.projectMeta{display:flex;align-items:center;justify-content:space-between;gap:10px}.projectCard h3{margin:16px 0 5px;font-family:Georgia,serif;font-size:16px;font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.projectCard p{margin:0 0 14px;color:var(--muted);font-size:10px}.projectCard .progress{margin-bottom:8px}.projectMeta{color:#9aa6b2;font-size:9px}.projectCard small{display:block;min-height:28px;margin-top:12px;color:#7f8b97;font-size:9px;line-height:1.45}.openHint,.panelHint{color:#697684;font-size:9px}.filters{display:flex;gap:6px}.filters button{background:#0f1720;border:1px solid var(--line);color:#9ca8b4;border-radius:6px;padding:6px 9px;font-size:10px}.tableWrap{overflow-x:auto}table{width:100%;border-collapse:collapse;min-width:720px}th{text-align:left;color:#7f8a96;font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:.08em;padding:9px 10px;border-bottom:1px solid var(--line)}td{padding:12px 10px;border-bottom:1px solid #202a34;font-size:12px;color:#cbd3db}.clickRow{cursor:pointer}.clickRow:hover{background:rgba(255,255,255,.025)}.status{display:inline-flex;padding:5px 8px;border-radius:999px;font-size:10px;border:1px solid transparent}.status.green{background:rgba(41,83,63,.32);border-color:#35654d;color:#9ac0a8}.status.burgundy{background:rgba(111,38,61,.30);border-color:#77344a;color:#d39aae}.status.navy{background:rgba(30,58,95,.34);border-color:#31587f;color:#9db6cc}.lowerGrid{display:grid;grid-template-columns:1.4fr .8fr;gap:14px}.actions{list-style:none;padding:0;margin:0}.actions li{display:grid;grid-template-columns:34px 1fr;gap:10px;padding:10px 0;border-bottom:1px solid #202a34}.actions li>span{color:var(--gold);font-family:Georgia,serif;font-size:12px}.actions strong{font-size:12px}.actions p,.note{margin:4px 0 0;color:var(--muted);font-size:11px;line-height:1.5}.mix{display:grid;gap:9px}.mix div{display:flex;justify-content:space-between;font-size:12px;color:#bac4ce}.rule{text-align:center;color:var(--gold);opacity:.6;margin:16px 0 10px}.backButton{display:block;margin:0 0 11px;padding:0;border:0;background:transparent;color:var(--gold);font-size:11px}.genericHero{display:grid;grid-template-columns:.7fr 1.3fr;gap:24px;margin-bottom:12px}.bigProgress{font-size:42px}.genericStats{display:grid;grid-template-columns:repeat(3,1fr);gap:10px}.genericStats div{padding:12px;border-left:1px solid var(--line)}.genericStats span{display:block;color:var(--muted);font-size:9px;text-transform:uppercase;letter-spacing:.08em;margin-bottom:6px}.genericStats strong{font-size:12px}.stageCard.static{cursor:default}.stageCard.static:hover{transform:none}.stageSelect{max-width:105px;background:#0d141c;color:#b9c3cd;border:1px solid #293440;border-radius:6px;padding:5px;font-size:9px}.danger{background:transparent;color:#d98d99;border:1px solid #713747;padding:9px 12px;border-radius:7px;font-size:11px}.formError{color:#e49baa;font-size:11px;margin:14px 0 0}.primary:disabled{opacity:.45;cursor:not-allowed}.genericWorkflow{grid-template-columns:repeat(4,minmax(0,1fr))}@media(max-width:1050px){.projectGrid{grid-template-columns:repeat(2,minmax(0,1fr))}.metrics{grid-template-columns:repeat(2,minmax(0,1fr))}}@media(max-width:700px){.projectGrid,.metrics,.lowerGrid,.genericHero,.genericStats{grid-template-columns:1fr}.panelHint{display:none}}
      .moneyControls{display:flex;align-items:center;gap:9px}.moneyControls input{background:#0d141c;color:#d9e0e6;border:1px solid #293440;border-radius:7px;padding:9px}.milestonePanel{margin-bottom:14px}.milestoneGrid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px}.milestone{background:#0d141c;border:1px solid #293440;border-radius:8px;padding:13px}.milestone>div:first-child{display:flex;justify-content:space-between;gap:10px;margin-bottom:12px}.milestone span,.milestone small{color:var(--muted);font-size:10px}.milestone small{display:block;margin-top:9px}.emptyState{text-align:center;padding:35px 16px;color:var(--muted)}.emptyState strong{display:block;color:var(--ink);font-family:Georgia,serif;font-size:18px}.emptyState p{font-size:11px;margin:8px 0 16px}.positive{color:#8bb79e}.negative{color:#d98d99}@media(max-width:700px){.milestoneGrid{grid-template-columns:1fr}.moneyControls{align-items:stretch;flex-direction:column}}
      .ventureIntro{display:flex;justify-content:space-between;gap:24px;align-items:center;margin-bottom:14px}.scoreLegend{display:grid;grid-template-columns:auto auto;gap:5px 10px;font-size:10px}.scoreLegend span{color:var(--muted)}.ventureGrid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px}.ventureCard{text-align:left;background:linear-gradient(180deg,var(--panel-2),var(--panel));color:var(--ink);border:1px solid var(--line);border-radius:10px;padding:16px}.ventureCard:hover{border-color:#465463;transform:translateY(-2px)}.ventureCard h3{font-family:Georgia,serif}.ventureCard p{color:var(--muted);font-size:11px;min-height:34px}.ventureTop{display:flex;justify-content:space-between}.score{width:42px;height:42px;display:grid;place-items:center;border-radius:50%;font-weight:700}.score.high{background:#244c39;color:#a8d3b8}.score.mid{background:#594b2d;color:#e0ca91}.score.low{background:#5c2939;color:#e2a3b5}.ventureFactors{display:grid;grid-template-columns:1fr 1fr;gap:7px;margin:16px 0}.ventureFactors span{display:flex;justify-content:space-between;color:var(--muted);font-size:10px}.ventureFactors b{color:var(--ink)}.ventureCard small{color:#7f8b97}@media(max-width:900px){.ventureGrid{grid-template-columns:repeat(2,minmax(0,1fr))}}@media(max-width:700px){.ventureGrid{grid-template-columns:1fr}.ventureIntro{align-items:flex-start;flex-direction:column}}
      .customerIntro{display:flex;justify-content:space-between;align-items:center;gap:24px;margin-bottom:14px}.customerIntro>strong{color:var(--gold);white-space:nowrap}.customerGrid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px}.customerCard{text-align:left;background:linear-gradient(180deg,var(--panel-2),var(--panel));color:var(--ink);border:1px solid var(--line);border-radius:10px;padding:16px}.customerCard:hover{border-color:#465463;transform:translateY(-2px)}.customerTop{display:flex;justify-content:space-between;align-items:center}.customerInitial{width:38px;height:38px;display:grid;place-items:center;border-radius:50%;background:#28233a;color:#d2b978;font-family:Georgia,serif;font-size:18px}.customerCard h3{font-family:Georgia,serif;margin:14px 0 5px}.customerCard p,.customerCard small{color:var(--muted);font-size:10px}.customerStats{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin:16px 0}.customerStats span{color:var(--muted);font-size:9px}.customerStats b{display:block;color:var(--ink);font-size:12px;margin-bottom:3px}@media(max-width:900px){.customerGrid{grid-template-columns:repeat(2,minmax(0,1fr))}}@media(max-width:700px){.customerGrid{grid-template-columns:1fr}.customerIntro{align-items:flex-start;flex-direction:column}}
      .workOrderWindow{width:min(980px,calc(100vw - 32px))}.workOrderLayout{display:grid;grid-template-columns:minmax(0,.85fr) minmax(380px,1.15fr);gap:22px}.workOrderFields{grid-template-columns:1fr}.workflowBuilder{min-width:0;border:1px solid var(--line);border-radius:9px;background:#0d141c;padding:14px}.workflowBuilderHead{display:flex;align-items:flex-start;justify-content:space-between;gap:12px}.workflowBuilderHead h3{margin:2px 0 0;font-family:Georgia,serif}.workflowBuilderHead>span{color:var(--gold);font-size:10px}.workflowBuilder ol{list-style:none;padding:0;margin:14px 0 10px;display:grid;gap:6px}.workflowBuilder li{display:grid;grid-template-columns:28px minmax(0,1fr) auto;align-items:center;gap:7px}.workflowBuilder li>span{color:#768391;font-family:Georgia,serif;font-size:10px}.workflowBuilder input{width:100%;background:#121c26;color:var(--ink);border:1px solid #2b3743;border-radius:6px;padding:8px}.workflowBuilder li>div{display:flex;gap:3px}.workflowBuilder button{background:#17222d;color:#9ba8b5;border:1px solid #2d3a47;border-radius:5px;padding:6px 8px}.workflowBuilder button:disabled{opacity:.3}.workflowBuilder .removeStage{color:#d98d99}.workflowBuilder .addStage{width:100%;color:var(--gold);border-style:dashed}@media(max-width:760px){.workOrderLayout{grid-template-columns:1fr}.workOrderWindow{width:min(620px,calc(100vw - 20px))}}
    `}</style>
  </main>;
}
