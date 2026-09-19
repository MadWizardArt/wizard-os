"use client";

import { inProduction } from "../lib/artwork-lifecycle";
import { CampaignDashboard } from "./components/Campaigns";
import StageEditor, { type EditableStage } from "./components/StageEditor";
import { useEffect, useMemo, useState } from "react";

type Project = {
  artworkAvailability?: string | null;
  id: string;
  title: string;
  kind: "Artwork" | "Project" | "Commission";
  status: string;
  statusEnum?: string;
  type?: string;
  templateId?: string | null;
  customerId?: string | null;
  progress: number;
  next: string;
  value: string;
  due: string;
  tone: string;
};
type WorkflowStage = EditableStage & { id: string; name: string; position: number; status: string; progress: number };
type ProjectDetail = {
  id: string;
  title: string;
  status: string;
  progress: number;
  valueCents: number | null;
  dueDate: string | null;
  nextAction: string | null;
  notes: string | null;
  customerId: string | null;
  stages: WorkflowStage[];
  template: { name: string } | null;
};
type WorkflowTemplate = { id: string; name: string; projectType: string; stages: Array<{ id: string; name: string; position: number }> };
type Transaction = {
  id: string;
  type: "INCOME" | "EXPENSE" | "REFUND";
  amountCents: number;
  occurredAt: string;
  receivedAt: string | null;
  source: string;
  incomeClass: "ACTIVE" | "RECURRING" | "PASSIVE_LIKE" | null;
  isNonArt: boolean;
  notes: string | null;
  projectId: string | null;
  customerId: string | null;
};
type IncomeMetrics = {
  totalCents: number;
  qualifyingCents: number;
  qualifyingShare: number;
  targets: Array<{ targetCents: number; progress: number; remainingCents: number }>;
  nextTarget: { targetCents: number; progress: number; remainingCents: number };
};
type Venture = {
  id: string;
  name: string;
  description: string | null;
  status: string;
  demand: number;
  margin: number;
  recurrence: number;
  automation: number;
  defensibility: number;
  startupCost: number;
  weeklyHours: number;
  nextAction: string | null;
  score: number;
};
type Customer = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  type: string;
  status: string;
  notes: string | null;
  lastContactAt: string | null;
  receivedCents: number;
  _count: { projects: number; transactions: number };
};

type View = "dashboard" | "projects" | "project" | "money" | "ventures" | "customers";

const nav = ["The Crucible", "Campaigns", "Projects", "Inventory", "Calendar", "Money", "Ventures", "Clients"] as const;

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="field"><span>{label}</span>{children}</label>;
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (value: boolean) => void }) {
  return <label className="toggleRow"><span>{label}</span><input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} /></label>;
}

export default function Home() {
  const [view, setView] = useState<View>("dashboard");
  const [todayLabel, setTodayLabel] = useState("Current operations");
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [projectsError, setProjectsError] = useState("");
  const [projectDetail, setProjectDetail] = useState<ProjectDetail | null>(null);
  const [editingStage, setEditingStage] = useState<WorkflowStage | null>(null);
  const [templates, setTemplates] = useState<WorkflowTemplate[]>([]);
  const [showNewProject, setShowNewProject] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");
  const [newProject, setNewProject] = useState({ title: "", type: "ARTWORK", templateId: "", value: "", dueDate: "", nextAction: "", customerId: "" });
  const [newProjectStages, setNewProjectStages] = useState<string[]>([]);

  const [selectedMonth, setSelectedMonth] = useState(() => new Date().toISOString().slice(0, 7));
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [incomeMetrics, setIncomeMetrics] = useState<IncomeMetrics>({
    totalCents: 0,
    qualifyingCents: 0,
    qualifyingShare: 0,
    targets: [100000, 250000, 500000].map((targetCents) => ({ targetCents, progress: 0, remainingCents: targetCents })),
    nextTarget: { targetCents: 100000, progress: 0, remainingCents: 100000 },
  });
  const [showTransaction, setShowTransaction] = useState(false);
  const [editingTransactionId, setEditingTransactionId] = useState<string | null>(null);
  const emptyTransaction = {
    type: "INCOME",
    amount: "",
    occurredAt: new Date().toISOString().slice(0, 10),
    receivedAt: new Date().toISOString().slice(0, 10),
    source: "",
    incomeClass: "ACTIVE",
    isNonArt: false,
    notes: "",
    projectId: "",
    customerId: "",
  };
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
    setTodayLabel(new Intl.DateTimeFormat("en-US", { weekday: "long", month: "long", day: "numeric" }).format(new Date()));
    const query = new URLSearchParams(window.location.search);
    if (query.get("view") === "projects") setView("projects");
    if (query.get("view") === "ventures") setView("ventures");
    if (query.get("view") === "customers") setView("customers");
    if (query.get("view") === "money") {
      setView("money");
      if (query.get("month")) setSelectedMonth(query.get("month")!);
    }
  }, []);

  const loadProjects = () => fetch("/api/projects")
    .then((response) => {
      if (!response.ok) throw new Error("Projects are unavailable");
      return response.json();
    })
    .then((data: Project[]) => {
      setProjects(data);
      setProjectsError("");
    })
    .catch(() => {
      setProjects([]);
      setProjectsError("Projects could not be loaded. Wizard OS is showing no substitute or demo records; refresh when the data service is available.");
    });

  useEffect(() => {
    loadProjects();
    fetch("/api/templates")
      .then((response) => response.ok ? response.json() : [])
      .then((data: WorkflowTemplate[]) => {
        setTemplates(data);
        const artworkTemplate = data.find((template) => template.projectType === "ARTWORK");
        if (artworkTemplate) {
          setNewProject((current) => ({ ...current, templateId: artworkTemplate.id }));
          setNewProjectStages(artworkTemplate.stages.map((stage) => stage.name));
        }
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get("project");
    const found = projects.find((project) => project.id === id);
    if (found) openProject(found);
  }, [projects]);

  const loadMoney = () => Promise.all([
    fetch(`/api/transactions?month=${selectedMonth}`).then((response) => response.ok ? response.json() : []),
    fetch(`/api/metrics/income?month=${selectedMonth}`).then((response) => response.ok ? response.json() : incomeMetrics),
  ]).then(([ledger, metrics]) => {
    setTransactions(ledger);
    setIncomeMetrics(metrics);
  }).catch(() => {});
  useEffect(() => { loadMoney(); }, [selectedMonth]);

  const loadVentures = () => fetch("/api/ventures").then((response) => response.ok ? response.json() : []).then(setVentures).catch(() => {});
  useEffect(() => { loadVentures(); }, []);

  const loadCustomers = () => fetch("/api/customers").then((response) => response.ok ? response.json() : []).then(setCustomers).catch(() => {});
  useEffect(() => { loadCustomers(); }, []);

  const openProject = async (project: Project) => {
    setSelectedProject(project);
    setView("project");
    setProjectDetail(null);
    setFormError("");
    const response = await fetch(`/api/projects/${project.id}`);
    if (response.ok) setProjectDetail(await response.json());
    else setFormError("Could not load project. Please reopen it.");
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const refreshProject = async () => {
    if (!selectedProject) return;
    const response = await fetch(`/api/projects/${selectedProject.id}`);
    if (!response.ok) throw new Error("Could not refresh project.");
    const detail = await response.json();
    setProjectDetail(detail);
    setSelectedProject((current) => current ? { ...current, title: detail.title, status: detail.status, progress: detail.progress } : current);
    await loadProjects();
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
    setSaving(true);
    setFormError("");
    const response = await fetch("/api/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...newProject, stages: newProjectStages }),
    });
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
    setSaving(true);
    setFormError("");
    const response = await fetch(`/api/projects/${projectDetail.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...projectDetail, value: projectDetail.valueCents == null ? "" : projectDetail.valueCents / 100, dueDate: projectDetail.dueDate?.slice(0, 10) ?? "" }),
    });
    setSaving(false);
    if (!response.ok) return setFormError("Could not save project.");
    await loadProjects();
  };

  const archiveProject = async () => {
    if (!projectDetail || !window.confirm(`Archive ${projectDetail.title}?`)) return;
    await fetch(`/api/projects/${projectDetail.id}`, { method: "DELETE" });
    setProjectDetail(null);
    setSelectedProject(null);
    setView("projects");
    loadProjects();
  };

  const updateWorkflowStage = async (stage: WorkflowStage, status: string) => {
    if (!projectDetail) return;
    const response = await fetch(`/api/projects/${projectDetail.id}/stages/${stage.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status, progress: status === "IN_PROGRESS" ? Math.max(stage.progress, 25) : stage.progress }),
    });
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
      type: transaction.type,
      amount: String(transaction.amountCents / 100),
      occurredAt: transaction.occurredAt.slice(0, 10),
      receivedAt: transaction.receivedAt?.slice(0, 10) ?? transaction.occurredAt.slice(0, 10),
      source: transaction.source,
      incomeClass: transaction.incomeClass ?? "ACTIVE",
      isNonArt: transaction.isNonArt,
      notes: transaction.notes ?? "",
      projectId: transaction.projectId ?? "",
      customerId: transaction.customerId ?? "",
    } : { ...emptyTransaction, occurredAt: `${selectedMonth}-${new Date().getDate().toString().padStart(2, "0")}`, receivedAt: `${selectedMonth}-${new Date().getDate().toString().padStart(2, "0")}` });
    setShowTransaction(true);
  };

  const saveTransaction = async () => {
    setSaving(true);
    setFormError("");
    const response = await fetch(editingTransactionId ? `/api/transactions/${editingTransactionId}` : "/api/transactions", {
      method: editingTransactionId ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(transactionForm),
    });
    const result = response.status === 204 ? {} : await response.json();
    setSaving(false);
    if (!response.ok) return setFormError(result.error ?? "Could not save transaction.");
    setShowTransaction(false);
    await loadMoney();
  };

  const deleteTransaction = async () => {
    if (!editingTransactionId || !window.confirm("Delete this transaction?")) return;
    await fetch(`/api/transactions/${editingTransactionId}`, { method: "DELETE" });
    setShowTransaction(false);
    await loadMoney();
  };

  const openVenture = (venture?: Venture) => {
    setFormError("");
    setEditingVentureId(venture?.id ?? null);
    setVentureForm(venture ? {
      name: venture.name,
      description: venture.description ?? "",
      status: venture.status,
      demand: venture.demand,
      margin: venture.margin,
      recurrence: venture.recurrence,
      automation: venture.automation,
      defensibility: venture.defensibility,
      startupCost: venture.startupCost,
      weeklyHours: venture.weeklyHours,
      nextAction: venture.nextAction ?? "",
    } : emptyVenture);
    setShowVenture(true);
  };

  const saveVenture = async () => {
    setSaving(true);
    setFormError("");
    const response = await fetch(editingVentureId ? `/api/ventures/${editingVentureId}` : "/api/ventures", {
      method: editingVentureId ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(ventureForm),
    });
    const result = await response.json();
    setSaving(false);
    if (!response.ok) return setFormError(result.error ?? "Could not save venture.");
    setShowVenture(false);
    loadVentures();
  };

  const archiveVenture = async () => {
    if (!editingVentureId || !window.confirm("Archive this venture?")) return;
    await fetch(`/api/ventures/${editingVentureId}`, { method: "DELETE" });
    setShowVenture(false);
    loadVentures();
  };

  const openCustomer = (customer?: Customer) => {
    setFormError("");
    setEditingCustomerId(customer?.id ?? null);
    setCustomerForm(customer ? {
      name: customer.name,
      email: customer.email ?? "",
      phone: customer.phone ?? "",
      type: customer.type,
      status: customer.status,
      notes: customer.notes ?? "",
      lastContactAt: customer.lastContactAt?.slice(0, 10) ?? "",
    } : emptyCustomer);
    setShowCustomer(true);
  };

  const saveCustomer = async () => {
    setSaving(true);
    setFormError("");
    const response = await fetch(editingCustomerId ? `/api/customers/${editingCustomerId}` : "/api/customers", {
      method: editingCustomerId ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(customerForm),
    });
    const result = await response.json();
    setSaving(false);
    if (!response.ok) return setFormError(result.error ?? "Could not save customer.");
    setShowCustomer(false);
    loadCustomers();
  };

  const archiveCustomer = async () => {
    if (!editingCustomerId || !window.confirm("Archive this customer?")) return;
    await fetch(`/api/customers/${editingCustomerId}`, { method: "DELETE" });
    setShowCustomer(false);
    loadCustomers();
  };

  const productionProjects = projects.filter(inProduction);
  const incomeBreakdown = useMemo(() => {
    const received = transactions.filter((transaction) => transaction.type === "INCOME");
    return {
      art: received.filter((transaction) => !transaction.isNonArt).reduce((sum, transaction) => sum + transaction.amountCents, 0),
      nonArt: received.filter((transaction) => transaction.isNonArt).reduce((sum, transaction) => sum + transaction.amountCents, 0),
      leveraged: received.filter((transaction) => transaction.incomeClass === "RECURRING" || transaction.incomeClass === "PASSIVE_LIKE").reduce((sum, transaction) => sum + transaction.amountCents, 0),
    };
  }, [transactions]);

  const Dashboard = () => <>
    <header className="topbar">
      <div><p className="eyebrow">{todayLabel}</p><h2>The Crucible</h2></div>
      <div className="dashboardActions"><a className="primary warlockMobile" href="/etsy">Warlock</a><button className="primary" onClick={() => setShowNewProject(true)}>+ New Work Order</button></div>
    </header>
    <CampaignDashboard />

    <section id="projects" className="panel projectPanel">
      <div className="panelHead"><div><p className="eyebrow">Studio + business</p><h3>Active Projects</h3></div><span className="panelHint">Select any item to enter its workspace</span></div>
      {projectsError ? <div className="emptyState"><strong>Project data unavailable</strong><p>{projectsError}</p><button className="primary" onClick={loadProjects}>Retry</button></div> : productionProjects.length === 0 ? <div className="emptyState"><strong>No active projects</strong><p>Create work only when there is something real to track.</p></div> : <div className="projectGrid">{productionProjects.map((project) => <button className="projectCard" key={project.id} onClick={() => openProject(project)}>
        <div className="projectCardTop"><span className={`status ${project.tone}`}>{project.kind}</span><span className="openHint">Open ↗</span></div>
        <h3>{project.title}</h3><p>{project.status}</p><div className="progress"><i style={{ width: `${project.progress}%` }} /></div>
        <div className="projectMeta"><span>{project.progress}%</span><span>{project.due}</span></div><small>Next: {project.next || "Choose next action"}</small>
      </button>)}</div>}
    </section>

    <section className="metrics">
      <article className="metric"><span>Month Revenue</span><strong>{money(incomeMetrics.totalCents)}</strong><small>Income actually received</small></article>
      <article className="metric"><span>Qualifying Income</span><strong>{money(incomeMetrics.qualifyingCents)}</strong><small>{incomeMetrics.qualifyingShare}% of received income</small></article>
      <article className="metric"><span>Open Work</span><strong>{productionProjects.length}</strong><small>Active project records</small></article>
      <article className="metric"><span>Next Freedom Target</span><strong>{incomeMetrics.nextTarget.progress}%</strong><small>{money(incomeMetrics.qualifyingCents)} / {money(incomeMetrics.nextTarget.targetCents)}</small></article>
    </section>

    <section className="lowerGrid">
      <article className="panel"><div className="panelHead"><div><p className="eyebrow">Priority</p><h3>Next Best Actions</h3></div></div><ol className="actions">{productionProjects.filter((project) => !["COMPLETE", "ARCHIVED"].includes(project.statusEnum ?? "")).slice(0, 5).map((project, index) => <li key={project.id}><span>{String(index + 1).padStart(2, "0")}</span><div><button className="backButton" onClick={() => openProject(project)}>{project.next || "Choose next action"}</button><p>{project.title} · {project.status} · {project.due}</p></div></li>)}</ol>{!productionProjects.some((project) => !["COMPLETE", "ARCHIVED"].includes(project.statusEnum ?? "")) && <p className="note">No unfinished work.</p>}</article>
      <article className="panel"><div className="panelHead"><div><p className="eyebrow">Recorded this month</p><h3>Income Classification</h3></div></div><div className="mix"><div><span>Art income</span><strong>{money(incomeBreakdown.art)}</strong></div><div><span>Non-art income</span><strong>{money(incomeBreakdown.nonArt)}</strong></div><div><span>Recurring / passive-like</span><strong>{money(incomeBreakdown.leveraged)}</strong></div></div><div className="rule">✦</div><p className="note">These figures come from the ledger; no placeholder percentages are shown.</p></article>
    </section>
  </>;

  const ProjectsWorkspace = () => <>
    <header className="topbar"><div><p className="eyebrow">Studio + business</p><h2>Projects</h2></div><button className="primary" onClick={() => setShowNewProject(true)}>+ New Project</button></header>
    <section className="panel projectListPanel">
      <div className="panelHead"><div><p className="eyebrow">Simple index</p><h3>All Project Records</h3></div><span className="panelHint">Open a project for workflow, notes, dates, value, and editing</span></div>
      {projectsError ? <div className="emptyState"><strong>Project data unavailable</strong><p>{projectsError}</p><button className="primary" onClick={loadProjects}>Retry</button></div> : projects.length === 0 ? <div className="emptyState"><strong>No projects yet</strong><p>Create a project when there is real work to track.</p><button className="primary" onClick={() => setShowNewProject(true)}>Create first project</button></div> : <div className="projectList">{projects.map((project) => <button className="projectListItem" key={project.id} onClick={() => openProject(project)}>
        <div className="projectListIdentity"><span className={`status ${project.tone}`}>{project.kind}</span><div><strong>{project.title}</strong><span>{project.status} · {project.progress}% complete</span></div></div>
        <div className="projectListMeta"><span>{project.due}</span><small>{project.next ? `Next: ${project.next}` : "No next action"}</small><b aria-hidden="true">›</b></div>
      </button>)}</div>}
    </section>
  </>;

  const ProjectWorkspace = () => selectedProject && <>
    <header className="topbar"><div><button className="backButton" onClick={() => setView("projects")}>← Projects</button><p className="eyebrow">{selectedProject.kind} workspace</p><h2>{selectedProject.title}</h2>{selectedProject.type === "ARTWORK" && <><a className="primary lifecycleLink" href={`/inventory?project=${selectedProject.id}`}>Artwork lifecycle →</a>{inProduction(selectedProject) && <button className="primary" onClick={async () => { const response = await fetch("/api/artwork", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "complete", projectId: selectedProject.id }) }); if (response.ok) window.location.assign(`/inventory?project=${selectedProject.id}`); else setFormError((await response.json()).error); }}>Complete Painting</button>}</>}</div><span className={`status ${selectedProject.tone}`}>{selectedProject.status}</span></header>
    {!projectDetail ? <section className="panel"><p className="note">Loading project record…</p>{formError && <p className="formError">{formError}</p>}</section> : <>
      <section className="panel genericHero"><div><p className="eyebrow">Current progress</p><strong className="bigProgress">{projectDetail.progress}%</strong><div className="progress"><i style={{ width: `${projectDetail.progress}%` }} /></div></div><div className="genericStats"><div><span>Workflow</span><strong>{projectDetail.template?.name ?? "Custom"}</strong></div><div><span>Due</span><strong>{projectDetail.dueDate ? new Date(projectDetail.dueDate).toLocaleDateString() : "No deadline"}</strong></div><div><span>Next action</span><strong>{projectDetail.nextAction ?? "Choose next action"}</strong></div></div></section>
      <section className="workflowGrid genericWorkflow">{projectDetail.stages.map((stage, index) => <button className="stageCard" key={stage.id} onClick={() => setEditingStage(stage)}><div className="stageTop"><span className="stageIcon">{String(index + 1).padStart(2, "0")}</span><span className="editHint">Edit ↗</span></div><h3>{stage.name}</h3><p>{stage.status.replaceAll("_", " ")} · {stage.progress}%</p><div className="progress"><i style={{ width: `${stage.progress}%` }} /></div></button>)}</section>
      <section className="panel"><div className="panelHead"><div><p className="eyebrow">Persistent record</p><h3>Project Details</h3></div></div><div className="formGrid"><Field label="Title"><input value={projectDetail.title} onChange={(event) => setProjectDetail({ ...projectDetail, title: event.target.value })} /></Field><Field label="Status"><select value={projectDetail.status} onChange={(event) => setProjectDetail({ ...projectDetail, status: event.target.value })}><option value="PLANNED">Planned</option><option value="ACTIVE">Active</option><option value="WAITING">Waiting</option><option value="BLOCKED">Blocked</option><option value="COMPLETE">Complete</option></select></Field><Field label="Related contact"><select value={projectDetail.customerId ?? ""} onChange={(event) => setProjectDetail({ ...projectDetail, customerId: event.target.value || null })}><option value="">None</option>{customers.map((customer) => <option key={customer.id} value={customer.id}>{customer.name}</option>)}</select></Field><Field label="Value ($)"><input type="number" min="0" value={projectDetail.valueCents == null ? "" : projectDetail.valueCents / 100} onChange={(event) => setProjectDetail({ ...projectDetail, valueCents: event.target.value === "" ? null : Math.round(Number(event.target.value) * 100) })} /></Field><Field label="Due date"><input type="date" value={projectDetail.dueDate?.slice(0, 10) ?? ""} onChange={(event) => setProjectDetail({ ...projectDetail, dueDate: event.target.value || null })} /></Field><Field label="Next action"><input value={projectDetail.nextAction ?? ""} onChange={(event) => setProjectDetail({ ...projectDetail, nextAction: event.target.value })} /></Field><Field label="Notes"><textarea value={projectDetail.notes ?? ""} onChange={(event) => setProjectDetail({ ...projectDetail, notes: event.target.value })} /></Field></div>{formError && <p className="formError">{formError}</p>}<div className="modalFoot"><button className="danger" onClick={archiveProject}>Archive project</button><button className="primary" disabled={saving} onClick={saveProject}>{saving ? "Saving…" : "Save changes"}</button></div></section>
    </>}
  </>;

  const MoneyWorkspace = () => <>
    <header className="topbar"><div><p className="eyebrow">Cashflow ledger</p><h2>Money</h2></div><div className="moneyControls"><input type="month" value={selectedMonth} onChange={(event) => setSelectedMonth(event.target.value)} /><button className="primary" onClick={() => openTransaction()}>+ Transaction</button></div></header>
    <section className="metrics"><article className="metric"><span>Received Income</span><strong>{money(incomeMetrics.totalCents)}</strong><small>Income less refunds</small></article><article className="metric"><span>Qualifying Non-Art Income</span><strong>{money(incomeMetrics.qualifyingCents)}</strong><small>Recurring + passive-like only</small></article><article className="metric"><span>Qualifying Share</span><strong>{incomeMetrics.qualifyingShare}%</strong><small>Of received income</small></article><article className="metric"><span>Next Milestone</span><strong>{money(incomeMetrics.nextTarget.targetCents)}</strong><small>{money(incomeMetrics.nextTarget.remainingCents)} remaining</small></article></section>
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

  const navigate = (item: typeof nav[number]) => {
    if (item === "Campaigns" || item === "Calendar" || item === "Inventory") return window.location.assign("/" + item.toLowerCase());
    if (item === "The Crucible") return setView("dashboard");
    if (item === "Projects") return setView("projects");
    if (item === "Money") return setView("money");
    if (item === "Ventures") return setView("ventures");
    if (item === "Clients") return setView("customers");
  };

  const activeNav = (item: typeof nav[number]) => item === "The Crucible" && view === "dashboard" || item === "Money" && view === "money" || item === "Ventures" && view === "ventures" || item === "Clients" && view === "customers" || item === "Projects" && (view === "projects" || view === "project");

  return <main className="shell">
    <aside className="sidebar"><div className="brand"><span className="sigil">✦</span><div><h1>Wizard OS</h1><p>Operations Console</p></div></div><nav>{nav.map((item) => <button key={item} onClick={() => navigate(item)} className={activeNav(item) ? "navItem active" : "navItem"}>{item}</button>)}</nav><div className="sidebarBottom"><a className="primary warlockLink" href="/etsy">Warlock</a></div></aside>
    <section className="workspace">{view === "dashboard" ? <Dashboard /> : view === "projects" ? <ProjectsWorkspace /> : view === "money" ? <MoneyWorkspace /> : view === "ventures" ? <VenturesWorkspace /> : view === "customers" ? <CustomersWorkspace /> : <ProjectWorkspace />}</section>

    {editingStage && selectedProject && <StageEditor stage={editingStage} projectId={selectedProject.id} close={() => setEditingStage(null)} saved={refreshProject} />}

    {showNewProject && <div className="modalBackdrop" onMouseDown={() => setShowNewProject(false)}><section className="editWindow workOrderWindow" onMouseDown={(event) => event.stopPropagation()}>
      <div className="modalHead"><div><p className="eyebrow">Work intake</p><h2>Create Work Order</h2></div><button className="close" onClick={() => setShowNewProject(false)}>×</button></div>
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

    {showVenture && <div className="modalBackdrop" onMouseDown={() => setShowVenture(false)}><section className="editWindow" onMouseDown={(event) => event.stopPropagation()}><div className="modalHead"><div><p className="eyebrow">Opportunity scorecard</p><h2>{editingVentureId ? "Edit Venture" : "New Venture"}</h2></div><button className="close" onClick={() => setShowVenture(false)}>×</button></div><div className="formGrid"><Field label="Venture name"><input value={ventureForm.name} onChange={(event) => setVentureForm({ ...ventureForm, name: event.target.value })} placeholder="Digital templates, licensing…" /></Field><Field label="Status"><select value={ventureForm.status} onChange={(event) => setVentureForm({ ...ventureForm, status: event.target.value })}><option value="IDEA">Idea</option><option value="VALIDATING">Validating</option><option value="ACTIVE">Active</option><option value="PAUSED">Paused</option></select></Field><Field label="Description"><textarea value={ventureForm.description} onChange={(event) => setVentureForm({ ...ventureForm, description: event.target.value })} /></Field><Field label="Next action"><input value={ventureForm.nextAction} onChange={(event) => setVentureForm({ ...ventureForm, nextAction: event.target.value })} /></Field>{([['demand','Demand'],['margin','Margin'],['recurrence','Recurring potential'],['automation','Automation potential'],['defensibility','Defensibility'],['startupCost','Startup cost burden'],['weeklyHours','Weekly hours burden']] as const).map(([key, label]) => <Field key={key} label={`${label}: ${ventureForm[key]}/5`}><input type="range" min="1" max="5" value={ventureForm[key]} onChange={(event) => setVentureForm({ ...ventureForm, [key]: Number(event.target.value) })} /></Field>)}</div><p className="note">Higher is better except startup cost and weekly hours, where a higher number means a heavier burden.</p>{formError && <p className="formError">{formError}</p>}<div className="modalFoot">{editingVentureId ? <button className="danger" onClick={archiveVenture}>Archive</button> : <span>Scores are comparable across all ventures.</span>}<button className="primary" disabled={saving || !ventureForm.name.trim()} onClick={saveVenture}>{saving ? "Saving…" : "Save venture"}</button></div></section></div>}

    {showCustomer && <div className="modalBackdrop" onMouseDown={() => setShowCustomer(false)}><section className="editWindow" onMouseDown={(event) => event.stopPropagation()}><div className="modalHead"><div><p className="eyebrow">Relationship record</p><h2>{editingCustomerId ? "Edit Contact" : "New Contact"}</h2></div><button className="close" onClick={() => setShowCustomer(false)}>×</button></div><div className="formGrid"><Field label="Name"><input autoFocus value={customerForm.name} onChange={(event) => setCustomerForm({ ...customerForm, name: event.target.value })} placeholder="Collector, client, or lead" /></Field><Field label="Type"><select value={customerForm.type} onChange={(event) => setCustomerForm({ ...customerForm, type: event.target.value })}><option value="COLLECTOR">Collector</option><option value="CLIENT">Client</option><option value="LEAD">Lead</option><option value="PARTNER">Partner</option><option value="OTHER">Other</option></select></Field><Field label="Status"><select value={customerForm.status} onChange={(event) => setCustomerForm({ ...customerForm, status: event.target.value })}><option value="LEAD">Lead</option><option value="ACTIVE">Active</option><option value="INACTIVE">Inactive</option></select></Field><Field label="Last contact"><input type="date" value={customerForm.lastContactAt} onChange={(event) => setCustomerForm({ ...customerForm, lastContactAt: event.target.value })} /></Field><Field label="Email"><input type="email" value={customerForm.email} onChange={(event) => setCustomerForm({ ...customerForm, email: event.target.value })} /></Field><Field label="Phone"><input value={customerForm.phone} onChange={(event) => setCustomerForm({ ...customerForm, phone: event.target.value })} /></Field><Field label="Contact notes"><textarea value={customerForm.notes} onChange={(event) => setCustomerForm({ ...customerForm, notes: event.target.value })} placeholder="Preferences, conversation notes, follow-up context…" /></Field></div>{formError && <p className="formError">{formError}</p>}<div className="modalFoot">{editingCustomerId ? <button className="danger" onClick={archiveCustomer}>Archive</button> : <span>Only the name is required.</span>}<button className="primary" disabled={saving || !customerForm.name.trim()} onClick={saveCustomer}>{saving ? "Saving…" : "Save contact"}</button></div></section></div>}

    <style jsx global>{`
      .dashboardActions{display:flex;gap:8px;align-items:center;flex-wrap:wrap}.warlockMobile{display:none;text-decoration:none}.sidebarBottom{margin-top:auto;padding-top:24px}.warlockLink{display:block;text-align:center;text-decoration:none;margin-bottom:16px}.projectPanel{margin-bottom:14px}.projectGrid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px}.projectCard{text-align:left;min-width:0;padding:14px;border-radius:9px;border:1px solid var(--line);background:#0f1720;color:var(--ink);transition:.15s}.projectCard:hover{transform:translateY(-2px);border-color:#465463}.projectCardTop,.projectMeta{display:flex;align-items:center;justify-content:space-between;gap:10px}.projectCard h3{margin:16px 0 5px;font-family:Georgia,serif;font-size:16px;font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.projectCard p{margin:0 0 14px;color:var(--muted);font-size:10px}.projectCard .progress{margin-bottom:8px}.projectMeta{color:#9aa6b2;font-size:9px}.projectCard small{display:block;min-height:28px;margin-top:12px;color:#7f8b97;font-size:9px;line-height:1.45}.openHint,.panelHint{color:#697684;font-size:9px}.projectListPanel{padding:0;overflow:hidden}.projectListPanel>.panelHead{padding:16px 16px 2px}.projectList{display:grid}.projectListItem{width:100%;display:grid;grid-template-columns:minmax(0,1fr) minmax(220px,.7fr);align-items:center;gap:20px;text-align:left;border:0;border-top:1px solid #202a34;background:transparent;color:var(--ink);padding:15px 16px}.projectListItem:hover{background:rgba(255,255,255,.025)}.projectListIdentity{display:flex;align-items:center;gap:12px;min-width:0}.projectListIdentity>div{min-width:0}.projectListIdentity strong{display:block;font-family:Georgia,serif;font-size:15px;font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.projectListIdentity div span{display:block;color:var(--muted);font-size:10px;margin-top:4px}.projectListMeta{display:grid;grid-template-columns:auto minmax(0,1fr) auto;align-items:center;gap:14px;color:#8d99a6;font-size:10px}.projectListMeta small{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.projectListMeta b{color:var(--gold);font-size:20px;font-weight:400}.metrics{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px;margin-bottom:14px}.metric{background:linear-gradient(180deg,var(--panel-2),var(--panel));border:1px solid var(--line);border-radius:9px;padding:15px 16px}.metric span{display:block;color:var(--muted);font-size:11px;margin-bottom:6px}.metric strong{display:block;font-size:24px;font-weight:650}.metric small{display:block;margin-top:5px;color:#7f8b97;font-size:10px}.lowerGrid{display:grid;grid-template-columns:1.4fr .8fr;gap:14px}.actions{list-style:none;padding:0;margin:0}.actions li{display:grid;grid-template-columns:34px 1fr;gap:10px;padding:10px 0;border-bottom:1px solid #202a34}.actions li>span{color:var(--gold);font-family:Georgia,serif;font-size:12px}.actions p,.note{margin:4px 0 0;color:var(--muted);font-size:11px;line-height:1.5}.mix{display:grid;gap:9px}.mix div{display:flex;justify-content:space-between;font-size:12px;color:#bac4ce}.rule{text-align:center;color:var(--gold);opacity:.6;margin:16px 0 10px}.backButton{display:block;margin:0 0 11px;padding:0;border:0;background:transparent;color:var(--gold);font-size:11px}.lifecycleLink{display:inline-block;margin:8px 8px 0 0;text-decoration:none}.genericHero{display:grid;grid-template-columns:.7fr 1.3fr;gap:24px;margin-bottom:12px}.bigProgress{font-size:42px}.genericStats{display:grid;grid-template-columns:repeat(3,1fr);gap:10px}.genericStats div{padding:12px;border-left:1px solid var(--line)}.genericStats span{display:block;color:var(--muted);font-size:9px;text-transform:uppercase;letter-spacing:.08em;margin-bottom:6px}.genericStats strong{font-size:12px}.genericWorkflow{grid-template-columns:repeat(4,minmax(0,1fr))}.danger{background:transparent;color:#d98d99;border:1px solid #713747;padding:9px 12px;border-radius:7px;font-size:11px}.formError{color:#e49baa;font-size:11px;margin:14px 0}.primary:disabled{opacity:.45;cursor:not-allowed}.moneyControls{display:flex;align-items:center;gap:9px}.moneyControls input{background:#0d141c;color:#d9e0e6;border:1px solid #293440;border-radius:7px;padding:9px}.milestonePanel{margin-bottom:14px}.milestoneGrid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px}.milestone{background:#0d141c;border:1px solid #293440;border-radius:8px;padding:13px}.milestone>div:first-child{display:flex;justify-content:space-between;gap:10px;margin-bottom:12px}.milestone span,.milestone small{color:var(--muted);font-size:10px}.milestone small{display:block;margin-top:9px}.emptyState{text-align:center;padding:35px 16px;color:var(--muted)}.emptyState strong{display:block;color:var(--ink);font-family:Georgia,serif;font-size:18px}.emptyState p{font-size:11px;margin:8px 0 16px}.positive{color:#8bb79e}.negative{color:#d98d99}.tableWrap{overflow-x:auto}table{width:100%;border-collapse:collapse;min-width:720px}th{text-align:left;color:#7f8a96;font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:.08em;padding:9px 10px;border-bottom:1px solid var(--line)}td{padding:12px 10px;border-bottom:1px solid #202a34;font-size:12px;color:#cbd3db}.clickRow{cursor:pointer}.clickRow:hover{background:rgba(255,255,255,.025)}.ventureIntro{display:flex;justify-content:space-between;gap:24px;align-items:center;margin-bottom:14px}.scoreLegend{display:grid;grid-template-columns:auto auto;gap:5px 10px;font-size:10px}.scoreLegend span{color:var(--muted)}.ventureGrid,.customerGrid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px}.ventureCard,.customerCard{text-align:left;background:linear-gradient(180deg,var(--panel-2),var(--panel));color:var(--ink);border:1px solid var(--line);border-radius:10px;padding:16px}.ventureCard:hover,.customerCard:hover{border-color:#465463;transform:translateY(-2px)}.ventureTop,.customerTop{display:flex;justify-content:space-between;align-items:center}.score{width:42px;height:42px;display:grid;place-items:center;border-radius:50%;font-weight:700}.score.high{background:#244c39;color:#a8d3b8}.score.mid{background:#594b2d;color:#e0ca91}.score.low{background:#5c2939;color:#e2a3b5}.ventureFactors{display:grid;grid-template-columns:1fr 1fr;gap:7px;margin:16px 0}.ventureFactors span{display:flex;justify-content:space-between;color:var(--muted);font-size:10px}.customerIntro{display:flex;justify-content:space-between;align-items:center;gap:24px;margin-bottom:14px}.customerIntro>strong{color:var(--gold);white-space:nowrap}.customerInitial{width:38px;height:38px;display:grid;place-items:center;border-radius:50%;background:#28233a;color:#d2b978;font-family:Georgia,serif;font-size:18px}.customerStats{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin:16px 0}.customerStats span{color:var(--muted);font-size:9px}.customerStats b{display:block;color:var(--ink);font-size:12px;margin-bottom:3px}.workOrderWindow{width:min(980px,calc(100vw - 32px))}.workOrderLayout{display:grid;grid-template-columns:minmax(0,.85fr) minmax(380px,1.15fr);gap:22px}.workOrderFields{grid-template-columns:1fr}.workflowBuilder{min-width:0;border:1px solid var(--line);border-radius:9px;background:#0d141c;padding:14px}.workflowBuilderHead{display:flex;align-items:flex-start;justify-content:space-between;gap:12px}.workflowBuilderHead h3{margin:2px 0 0;font-family:Georgia,serif}.workflowBuilderHead>span{color:var(--gold);font-size:10px}.workflowBuilder ol{list-style:none;padding:0;margin:14px 0 10px;display:grid;gap:6px}.workflowBuilder li{display:grid;grid-template-columns:28px minmax(0,1fr) auto;align-items:center;gap:7px}.workflowBuilder li>span{color:#768391;font-family:Georgia,serif;font-size:10px}.workflowBuilder input{width:100%;background:#121c26;color:var(--ink);border:1px solid #2b3743;border-radius:6px;padding:8px}.workflowBuilder li>div{display:flex;gap:3px}.workflowBuilder button{background:#17222d;color:#9ba8b5;border:1px solid #2d3a47;border-radius:5px;padding:6px 8px}.workflowBuilder button:disabled{opacity:.3}.workflowBuilder .removeStage{color:#d98d99}.workflowBuilder .addStage{width:100%;color:var(--gold);border-style:dashed}@media(max-width:1050px){.projectGrid{grid-template-columns:repeat(2,minmax(0,1fr))}.metrics{grid-template-columns:repeat(2,minmax(0,1fr))}}@media(max-width:900px){.ventureGrid,.customerGrid{grid-template-columns:repeat(2,minmax(0,1fr))}.warlockMobile{display:inline-block}.sidebarBottom{display:none}}@media(max-width:760px){.workOrderLayout{grid-template-columns:1fr}.workOrderWindow{width:min(620px,calc(100vw - 20px))}}@media(max-width:700px){.projectGrid,.lowerGrid,.genericHero,.genericStats,.ventureGrid,.customerGrid,.milestoneGrid{grid-template-columns:1fr}.metrics{grid-template-columns:repeat(2,minmax(0,1fr))}.metric{padding:12px}.metric strong{font-size:20px}.panelHint{display:none}.projectListItem{grid-template-columns:1fr;gap:10px}.projectListMeta{grid-template-columns:auto minmax(0,1fr) auto}.moneyControls{align-items:stretch;flex-direction:column}.ventureIntro,.customerIntro{align-items:flex-start;flex-direction:column}}
    `}</style>
  </main>;
}
