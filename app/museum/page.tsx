"use client";

import { useEffect, useMemo, useState } from "react";
import { MUSE_BY_ID, MUSE_DIRECTORY, type MuseDirectoryEntry } from "../../lib/museum-directory";
import type { MuseId } from "../../lib/museum";
import type { BriefStatus } from "../../lib/museum-brief-storage";
import styles from "./museum.module.css";

type SharedProject = {
  id: string;
  title: string;
  kind?: string;
  type?: string;
  status?: string;
  statusEnum?: string;
  progress?: number;
  next?: string;
  nextAction?: string | null;
};

type BriefHistoryEntry = {
  id: string;
  kind: string;
  text: string;
  createdAt: string;
};

type MuseumBrief = {
  id: string;
  version: 1;
  title: string;
  objective: string;
  status: BriefStatus;
  leadMuseId: MuseId;
  supportMuseIds: MuseId[];
  linkedProjectId: string | null;
  evidence: string;
  artifact: string;
  blocker: string;
  decision: string;
  nextAction: string;
  dueDate: string;
  history: BriefHistoryEntry[];
  project: SharedProject | null;
  createdAt: string;
  updatedAt: string;
};

type MuseumMode = "hall" | "chamber" | "council" | "archive";

type BriefDraft = {
  title: string;
  objective: string;
  status: BriefStatus;
  leadMuseId: MuseId;
  supportMuseIds: MuseId[];
  linkedProjectId: string;
  evidence: string;
  artifact: string;
  blocker: string;
  decision: string;
  nextAction: string;
  dueDate: string;
};

const CLOSED_STATUSES = new Set<BriefStatus>(["COMPLETE", "DEFERRED"]);
const STATUS_OPTIONS: Array<{ value: BriefStatus; label: string }> = [
  { value: "QUEUED", label: "Queued" },
  { value: "IN_PROGRESS", label: "In Progress" },
  { value: "READY_FOR_REVIEW", label: "Ready for Review" },
  { value: "BLOCKED", label: "Blocked" },
  { value: "COMPLETE", label: "Complete" },
  { value: "DEFERRED", label: "Deferred" },
];

function emptyDraft(leadMuseId: MuseId = "novy"): BriefDraft {
  return {
    title: "",
    objective: "",
    status: "QUEUED",
    leadMuseId,
    supportMuseIds: [],
    linkedProjectId: "",
    evidence: "",
    artifact: "",
    blocker: "",
    decision: "",
    nextAction: "",
    dueDate: "",
  };
}

function draftFromBrief(brief: MuseumBrief): BriefDraft {
  return {
    title: brief.title,
    objective: brief.objective,
    status: brief.status,
    leadMuseId: brief.leadMuseId,
    supportMuseIds: brief.supportMuseIds,
    linkedProjectId: brief.linkedProjectId ?? "",
    evidence: brief.evidence,
    artifact: brief.artifact,
    blocker: brief.blocker,
    decision: brief.decision,
    nextAction: brief.nextAction,
    dueDate: brief.dueDate,
  };
}

function prettyStatus(status: BriefStatus) {
  return STATUS_OPTIONS.find((item) => item.value === status)?.label ?? status;
}

function formatDate(value: string) {
  if (!value) return "No date";
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value : parsed.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function museName(id: MuseId) {
  return MUSE_BY_ID[id]?.name ?? id;
}

function briefParticipants(brief: MuseumBrief) {
  return [brief.leadMuseId, ...brief.supportMuseIds];
}

export default function MuseumPage() {
  const [mode, setMode] = useState<MuseumMode>("hall");
  const [selectedId, setSelectedId] = useState<MuseId>("novy");
  const [briefs, setBriefs] = useState<MuseumBrief[]>([]);
  const [projects, setProjects] = useState<SharedProject[]>([]);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState("");
  const [consultQuestion, setConsultQuestion] = useState("");
  const [receiptText, setReceiptText] = useState("");
  const [newBrief, setNewBrief] = useState<BriefDraft>(() => emptyDraft());
  const [selectedBriefId, setSelectedBriefId] = useState<string | null>(null);
  const [editBrief, setEditBrief] = useState<BriefDraft | null>(null);
  const [saving, setSaving] = useState(false);

  const selected = MUSE_BY_ID[selectedId];

  const loadMuseum = async () => {
    setLoading(true);
    try {
      const [briefResponse, projectResponse] = await Promise.all([
        fetch("/api/museum/briefs", { cache: "no-store" }),
        fetch("/api/projects", { cache: "no-store" }),
      ]);
      if (!briefResponse.ok || !projectResponse.ok) throw new Error("Museum state could not be read.");
      const [briefData, projectData] = await Promise.all([briefResponse.json(), projectResponse.json()]);
      setBriefs(Array.isArray(briefData) ? briefData : []);
      setProjects(Array.isArray(projectData) ? projectData : []);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Museum state could not be read.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const savedMuse = localStorage.getItem("wizard-os-museum-selected-muse") as MuseId | null;
    if (savedMuse && MUSE_BY_ID[savedMuse]) setSelectedId(savedMuse);
    void loadMuseum();
  }, []);

  useEffect(() => {
    if (!selectedBriefId) {
      setEditBrief(null);
      return;
    }
    const brief = briefs.find((item) => item.id === selectedBriefId);
    setEditBrief(brief ? draftFromBrief(brief) : null);
  }, [selectedBriefId, briefs]);

  const activeBriefs = useMemo(() => briefs.filter((brief) => !CLOSED_STATUSES.has(brief.status)), [briefs]);
  const archivedBriefs = useMemo(() => briefs.filter((brief) => CLOSED_STATUSES.has(brief.status)), [briefs]);
  const selectedMuseBriefs = useMemo(
    () => activeBriefs.filter((brief) => briefParticipants(brief).includes(selectedId)),
    [activeBriefs, selectedId],
  );
  const selectedBrief = selectedBriefId ? briefs.find((brief) => brief.id === selectedBriefId) ?? null : null;
  const materialHistory = useMemo(
    () => briefs
      .flatMap((brief) => brief.history.map((entry) => ({ ...entry, briefId: brief.id, briefTitle: brief.title })))
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, 60),
    [briefs],
  );

  const chooseMuse = (id: MuseId) => {
    setSelectedId(id);
    localStorage.setItem("wizard-os-museum-selected-muse", id);
  };

  const enterChamber = (id: MuseId) => {
    chooseMuse(id);
    setMode("chamber");
    setConsultQuestion("");
  };

  const copyText = async (text: string, success: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setNotice(success);
    } catch {
      setNotice("Clipboard access was unavailable. Select and copy the packet manually.");
    }
  };

  const copyConsultPacket = async () => {
    const current = selectedMuseBriefs.slice(0, 5).map((brief) => `- ${brief.title} [${prettyStatus(brief.status)}] · next: ${brief.nextAction || "not recorded"}`).join("\n") || "- No active Museum Briefs assigned.";
    const packet = [
      `${selected.name.toUpperCase()} CONSULT`,
      `Role: ${selected.role}`,
      `Operating question: ${selected.coreQuestion}`,
      `Current Briefs:\n${current}`,
      `Question: ${consultQuestion.trim() || "[add question]"}`,
      "",
      "Use the Nine Muses Master 2.0 canon. This packet is context only; do not claim Museum state changed unless a receipt is returned and imported.",
    ].join("\n");
    await copyText(packet, `Consult packet copied for ${selected.name}. Paste it into her Nine Muses project thread.`);
  };

  const copyHandoffPacket = async (brief: MuseumBrief) => {
    const lead = MUSE_BY_ID[brief.leadMuseId];
    const supporters = brief.supportMuseIds.map(museName).join(", ") || "None";
    const packet = [
      `MUSE HANDOFF`,
      `Brief: ${brief.title}`,
      `Owner: ${lead.name}`,
      `Support: ${supporters}`,
      `Status: ${prettyStatus(brief.status)}`,
      `Objective: ${brief.objective || "Not recorded"}`,
      `Decision: ${brief.decision || "None recorded"}`,
      `Evidence: ${brief.evidence || "None recorded"}`,
      `Artifact: ${brief.artifact || "None recorded"}`,
      `Blocker: ${brief.blocker || "None"}`,
      `Next Action: ${brief.nextAction || "Not recorded"}`,
      `Due: ${brief.dueDate || "Not set"}`,
      "",
      `Respond from ${lead.name}'s adopted Character & Operator 2.0 doctrine. Return a MUSEUM RECEIPT when material state changes.` ,
    ].join("\n");
    await copyText(packet, `Handoff copied for ${lead.name}.`);
  };

  const createBrief = async () => {
    if (!newBrief.title.trim()) {
      setNotice("Give the Brief a title first.");
      return;
    }
    setSaving(true);
    try {
      const response = await fetch("/api/museum/briefs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newBrief),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Brief could not be created.");
      setBriefs((current) => [payload, ...current]);
      setSelectedBriefId(payload.id);
      setNewBrief(emptyDraft(payload.leadMuseId));
      setNotice("Brief opened. No AI call was made.");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Brief could not be created.");
    } finally {
      setSaving(false);
    }
  };

  const saveSelectedBrief = async () => {
    if (!selectedBriefId || !editBrief) return;
    setSaving(true);
    try {
      const response = await fetch("/api/museum/briefs", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: selectedBriefId, ...editBrief }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Brief could not be saved.");
      setBriefs((current) => current.map((brief) => brief.id === payload.id ? payload : brief));
      setNotice("Brief updated. Material changes were added to the Archive without AI inference.");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Brief could not be saved.");
    } finally {
      setSaving(false);
    }
  };

  const importReceipt = async () => {
    if (!receiptText.trim()) {
      setNotice("Paste a Museum Receipt first.");
      return;
    }
    setSaving(true);
    try {
      const response = await fetch("/api/museum/briefs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ receiptText }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Receipt could not be imported.");
      setBriefs((current) => {
        const exists = current.some((brief) => brief.id === payload.id);
        return exists ? current.map((brief) => brief.id === payload.id ? payload : brief) : [payload, ...current];
      });
      setSelectedBriefId(payload.id);
      setReceiptText("");
      setNotice("Museum Receipt imported deterministically. No AI call was made.");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Receipt could not be imported.");
    } finally {
      setSaving(false);
    }
  };

  const toggleNewSupport = (id: MuseId) => {
    if (id === newBrief.leadMuseId) return;
    setNewBrief((current) => ({
      ...current,
      supportMuseIds: current.supportMuseIds.includes(id)
        ? current.supportMuseIds.filter((item) => item !== id)
        : current.supportMuseIds.length >= 4 ? current.supportMuseIds : [...current.supportMuseIds, id],
    }));
  };

  const toggleEditSupport = (id: MuseId) => {
    if (!editBrief || id === editBrief.leadMuseId) return;
    setEditBrief({
      ...editBrief,
      supportMuseIds: editBrief.supportMuseIds.includes(id)
        ? editBrief.supportMuseIds.filter((item) => item !== id)
        : editBrief.supportMuseIds.length >= 4 ? editBrief.supportMuseIds : [...editBrief.supportMuseIds, id],
    });
  };

  const giveMuseWork = () => {
    setNewBrief(emptyDraft(selectedId));
    setMode("council");
  };

  return (
    <main className={styles.page} data-palette={selected.palette}>
      <div className={styles.atmosphere} />
      <section className={styles.shell}>
        <header className={styles.topbar}>
          <a className={styles.backLink} href="/">← Wizard OS</a>
          <div className={styles.titleBlock}>
            <p className={styles.kicker}>NINE MINDS · ONE WORLD · ZERO INFERENCE BY DEFAULT</p>
            <h1>The Museum</h1>
            <p>The Muses live here as persistent operators. Conversation happens in the Nine Muses project; this space holds identity, work, decisions and evidence.</p>
          </div>
          <div className={styles.gatewayStatus}><span />AI Gateway · Off</div>
        </header>

        <nav className={styles.museumNav} aria-label="Museum rooms">
          <button className={mode === "hall" ? styles.navActive : ""} onClick={() => setMode("hall")}>The Hall</button>
          <button className={mode === "chamber" ? styles.navActive : ""} onClick={() => setMode("chamber")}>{selected.name}&apos;s Chamber</button>
          <button className={mode === "council" ? styles.navActive : ""} onClick={() => setMode("council")}>Council Table</button>
          <button className={mode === "archive" ? styles.navActive : ""} onClick={() => setMode("archive")}>Archive</button>
        </nav>

        {notice && <div className={styles.notice} onClick={() => setNotice("")}>{notice}<span>×</span></div>}

        {mode === "hall" && (
          <>
            <section className={styles.roomHeading}>
              <div><p className={styles.kicker}>THE HALL</p><h2>Nine operators, visible through real work.</h2></div>
              <div className={styles.summaryStrip}>
                <div><strong>{activeBriefs.length}</strong><span>Active Briefs</span></div>
                <div><strong>{briefs.filter((brief) => brief.status === "READY_FOR_REVIEW").length}</strong><span>Awaiting Review</span></div>
                <div><strong>0</strong><span>Automatic AI Calls</span></div>
              </div>
            </section>

            <section className={styles.hallGrid}>
              {MUSE_DIRECTORY.map((muse) => {
                const relevant = activeBriefs.filter((brief) => briefParticipants(brief).includes(muse.id));
                const led = relevant.filter((brief) => brief.leadMuseId === muse.id);
                const focus = led[0] ?? relevant[0] ?? null;
                return (
                  <button key={muse.id} className={styles.museCard} data-palette={muse.palette} onClick={() => enterChamber(muse.id)}>
                    <div className={styles.characterFrame}><span>{muse.symbol}</span><small>{muse.mythicSeat}</small></div>
                    <div className={styles.cardCopy}>
                      <p className={styles.cardRole}>{muse.role}</p>
                      <h3>{muse.name}</h3>
                      <p className={styles.coreQuestion}>{muse.coreQuestion}</p>
                      <div className={styles.cardFocus}>
                        <span>Current focus</span>
                        <strong>{focus?.title ?? "No active Brief"}</strong>
                        <small>{led.length} lead · {Math.max(0, relevant.length - led.length)} support</small>
                      </div>
                    </div>
                  </button>
                );
              })}
            </section>

            <section className={styles.architectureNote}>
              <strong>Museum 2.0</strong>
              <p>ChatGPT / Nine Muses Project = cognition · Master 2.0 = canon · Museum = embodiment and state · Wizard OS = execution.</p>
            </section>
          </>
        )}

        {mode === "chamber" && (
          <>
            <section className={styles.chamberHero}>
              <div className={styles.chamberPortrait}><span>{selected.symbol}</span><small>{selected.mythicSeat}</small></div>
              <div className={styles.chamberIdentity}>
                <p className={styles.kicker}>CHAMBER · {selected.role.toUpperCase()}</p>
                <h2>{selected.name}</h2>
                <p className={styles.secondary}>{selected.secondary}</p>
                <blockquote>{selected.coreLine}</blockquote>
                <p>{selected.domain}</p>
                <div className={styles.identityMeta}><span>{selected.voice}</span><span>Counterweight · {museName(selected.counterweightId)}</span></div>
              </div>
            </section>

            <section className={styles.chamberGrid}>
              <article className={styles.panel}>
                <div className={styles.panelHeader}><div><p className={styles.kicker}>CURRENT RESPONSIBILITIES</p><h3>{selected.name}&apos;s Briefs</h3></div><strong>{selectedMuseBriefs.length}</strong></div>
                <div className={styles.briefMiniList}>
                  {selectedMuseBriefs.length === 0 && <p className={styles.empty}>No active Briefs are assigned to {selected.name}.</p>}
                  {selectedMuseBriefs.map((brief) => (
                    <button key={brief.id} onClick={() => { setSelectedBriefId(brief.id); setMode("council"); }}>
                      <span>{brief.leadMuseId === selected.id ? "LEAD" : "SUPPORT"}</span>
                      <strong>{brief.title}</strong>
                      <small>{prettyStatus(brief.status)} · {brief.nextAction || "No next action"}</small>
                    </button>
                  ))}
                </div>
                <button className={styles.primaryButton} onClick={giveMuseWork}>Give {selected.name} Work</button>
              </article>

              <article className={styles.panel}>
                <p className={styles.kicker}>CONSULT IN CHATGPT</p>
                <h3>Carry the context, not another model call.</h3>
                <p className={styles.panelCopy}>Write the question here, copy the compact packet, then paste it into {selected.name}&apos;s home thread in the Nine Muses project.</p>
                <textarea className={styles.largeInput} value={consultQuestion} onChange={(event) => setConsultQuestion(event.target.value)} placeholder={`What do you want ${selected.name} to consider?`} />
                <button className={styles.primaryButton} onClick={copyConsultPacket}>Copy Consult Packet</button>
                <small className={styles.costNote}>Gateway cost: $0 · No AI request is made by this button.</small>
              </article>
            </section>

            <section className={styles.panel}>
              <div className={styles.panelHeader}><div><p className={styles.kicker}>SHARED WIZARD OS WORLD</p><h3>Operational context</h3></div><strong>{projects.length}</strong></div>
              <div className={styles.projectGrid}>
                {loading && <p className={styles.empty}>Reading shared context…</p>}
                {!loading && projects.length === 0 && <p className={styles.empty}>No shared Wizard OS projects returned.</p>}
                {projects.slice(0, 8).map((project) => (
                  <article key={project.id}><span>{project.kind ?? project.type ?? "Project"}</span><strong>{project.title}</strong><small>{project.next ?? project.nextAction ?? "No next action"}</small></article>
                ))}
              </div>
            </section>
          </>
        )}

        {mode === "council" && (
          <>
            <section className={styles.roomHeading}>
              <div><p className={styles.kicker}>COUNCIL TABLE</p><h2>Committed work, ownership and Artist decisions.</h2></div>
              <div className={styles.zeroCallBadge}>Deterministic state · $0 AI</div>
            </section>

            <section className={styles.councilLayout}>
              <aside className={styles.briefRail}>
                <div className={styles.railHeader}><h3>Active Briefs</h3><span>{activeBriefs.length}</span></div>
                {activeBriefs.length === 0 && <p className={styles.empty}>No active Briefs yet.</p>}
                {activeBriefs.map((brief) => (
                  <button key={brief.id} className={selectedBriefId === brief.id ? styles.briefSelected : ""} onClick={() => setSelectedBriefId(brief.id)}>
                    <span>{museName(brief.leadMuseId)}</span>
                    <strong>{brief.title}</strong>
                    <small>{prettyStatus(brief.status)}</small>
                  </button>
                ))}
              </aside>

              <section className={styles.councilCenter}>
                {selectedBrief && editBrief ? (
                  <article className={styles.briefEditor}>
                    <div className={styles.panelHeader}><div><p className={styles.kicker}>SELECTED BRIEF</p><h3>{selectedBrief.title}</h3></div><button className={styles.smallButton} onClick={() => copyHandoffPacket(selectedBrief)}>Copy Handoff</button></div>
                    <div className={styles.formGrid}>
                      <label><span>Title</span><input value={editBrief.title} onChange={(e) => setEditBrief({ ...editBrief, title: e.target.value })} /></label>
                      <label><span>Status</span><select value={editBrief.status} onChange={(e) => setEditBrief({ ...editBrief, status: e.target.value as BriefStatus })}>{STATUS_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
                      <label><span>Lead</span><select value={editBrief.leadMuseId} onChange={(e) => setEditBrief({ ...editBrief, leadMuseId: e.target.value as MuseId, supportMuseIds: editBrief.supportMuseIds.filter((id) => id !== e.target.value) })}>{MUSE_DIRECTORY.map((muse) => <option key={muse.id} value={muse.id}>{muse.name}</option>)}</select></label>
                      <label><span>Linked Wizard OS Project</span><select value={editBrief.linkedProjectId} onChange={(e) => setEditBrief({ ...editBrief, linkedProjectId: e.target.value })}><option value="">None</option>{projects.map((project) => <option key={project.id} value={project.id}>{project.title}</option>)}</select></label>
                    </div>
                    <label className={styles.fullLabel}><span>Objective</span><textarea value={editBrief.objective} onChange={(e) => setEditBrief({ ...editBrief, objective: e.target.value })} /></label>
                    <div className={styles.supportChooser}><span>Support</span>{MUSE_DIRECTORY.filter((muse) => muse.id !== editBrief.leadMuseId).map((muse) => <button key={muse.id} className={editBrief.supportMuseIds.includes(muse.id) ? styles.supportActive : ""} onClick={() => toggleEditSupport(muse.id)}>{muse.name}</button>)}</div>
                    <div className={styles.formGrid}>
                      <label><span>Decision</span><textarea value={editBrief.decision} onChange={(e) => setEditBrief({ ...editBrief, decision: e.target.value })} /></label>
                      <label><span>Next Action</span><textarea value={editBrief.nextAction} onChange={(e) => setEditBrief({ ...editBrief, nextAction: e.target.value })} /></label>
                      <label><span>Evidence</span><textarea value={editBrief.evidence} onChange={(e) => setEditBrief({ ...editBrief, evidence: e.target.value })} /></label>
                      <label><span>Artifact</span><textarea value={editBrief.artifact} onChange={(e) => setEditBrief({ ...editBrief, artifact: e.target.value })} /></label>
                      <label><span>Blocker</span><textarea value={editBrief.blocker} onChange={(e) => setEditBrief({ ...editBrief, blocker: e.target.value })} /></label>
                      <label><span>Due date / target</span><input value={editBrief.dueDate} onChange={(e) => setEditBrief({ ...editBrief, dueDate: e.target.value })} placeholder="Optional" /></label>
                    </div>
                    <button className={styles.primaryButton} disabled={saving} onClick={saveSelectedBrief}>{saving ? "Saving…" : "Save Brief"}</button>
                  </article>
                ) : (
                  <article className={styles.emptyCouncil}><span>◇</span><h3>Select a Brief</h3><p>Choose committed work from the left, or open a new Brief on the right.</p></article>
                )}
              </section>

              <aside className={styles.createRail}>
                <p className={styles.kicker}>OPEN A BRIEF</p>
                <input value={newBrief.title} onChange={(e) => setNewBrief({ ...newBrief, title: e.target.value })} placeholder="Brief title" />
                <textarea value={newBrief.objective} onChange={(e) => setNewBrief({ ...newBrief, objective: e.target.value })} placeholder="Objective" />
                <label><span>Lead</span><select value={newBrief.leadMuseId} onChange={(e) => setNewBrief({ ...newBrief, leadMuseId: e.target.value as MuseId, supportMuseIds: newBrief.supportMuseIds.filter((id) => id !== e.target.value) })}>{MUSE_DIRECTORY.map((muse) => <option key={muse.id} value={muse.id}>{muse.name}</option>)}</select></label>
                <div className={styles.supportChooser}><span>Support</span>{MUSE_DIRECTORY.filter((muse) => muse.id !== newBrief.leadMuseId).map((muse) => <button key={muse.id} className={newBrief.supportMuseIds.includes(muse.id) ? styles.supportActive : ""} onClick={() => toggleNewSupport(muse.id)}>{muse.name}</button>)}</div>
                <input value={newBrief.nextAction} onChange={(e) => setNewBrief({ ...newBrief, nextAction: e.target.value })} placeholder="Next action" />
                <button className={styles.primaryButton} disabled={saving} onClick={createBrief}>Open Brief</button>
                <div className={styles.railRule} />
                <p className={styles.kicker}>IMPORT MUSEUM RECEIPT</p>
                <textarea className={styles.receiptInput} value={receiptText} onChange={(e) => setReceiptText(e.target.value)} placeholder={"MUSEUM RECEIPT\nBrief: …\nOwner: …\nStatus: …\nDecision: …\nNext Action: …"} />
                <button className={styles.secondaryButton} disabled={saving} onClick={importReceipt}>Import Receipt</button>
                <small className={styles.costNote}>Parsing is deterministic. No model is called.</small>
              </aside>
            </section>
          </>
        )}

        {mode === "archive" && (
          <>
            <section className={styles.roomHeading}>
              <div><p className={styles.kicker}>THE ARCHIVE</p><h2>Material history, not model chatter.</h2></div>
              <div className={styles.summaryStrip}><div><strong>{archivedBriefs.length}</strong><span>Closed Briefs</span></div><div><strong>{materialHistory.length}</strong><span>Recent Events</span></div></div>
            </section>

            <section className={styles.archiveGrid}>
              <article className={styles.panel}>
                <p className={styles.kicker}>COMPLETED / DEFERRED</p>
                <h3>Closed Briefs</h3>
                <div className={styles.closedList}>
                  {archivedBriefs.length === 0 && <p className={styles.empty}>No Briefs have been closed yet.</p>}
                  {archivedBriefs.map((brief) => <button key={brief.id} onClick={() => { setSelectedBriefId(brief.id); setMode("council"); }}><span>{prettyStatus(brief.status)}</span><strong>{brief.title}</strong><small>{museName(brief.leadMuseId)} · updated {formatDate(brief.updatedAt)}</small></button>)}
                </div>
              </article>

              <article className={styles.panel}>
                <p className={styles.kicker}>MATERIAL LEDGER</p>
                <h3>Recent changes</h3>
                <div className={styles.historyList}>
                  {materialHistory.length === 0 && <p className={styles.empty}>No material Brief history yet.</p>}
                  {materialHistory.map((entry) => <div key={`${entry.briefId}:${entry.id}`}><span>{entry.kind}</span><strong>{entry.briefTitle}</strong><p>{entry.text}</p><small>{formatDate(entry.createdAt)}</small></div>)}
                </div>
              </article>
            </section>

            <section className={styles.architectureNote}>
              <strong>Legacy Quest system retired from normal flow</strong>
              <p>Old Quest and Chamber AI routes remain dormant for compatibility, but The Museum 2.0 does not call them automatically or expose them in its primary navigation.</p>
            </section>
          </>
        )}

        <footer className={styles.footerNote}>
          <span>THE MUSEUM · 2.0</span>
          <p>Different minds. Same world. Conversation in ChatGPT; factual state here; execution in Wizard OS.</p>
        </footer>
      </section>
    </main>
  );
}
