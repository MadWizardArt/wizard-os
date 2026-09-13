"use client";

import { useEffect, useMemo, useState } from "react";
import { MUSE_DIRECTORY, MUSE_BY_ID } from "../../../lib/museum-directory";
import type { MuseId } from "../../../lib/museum";
import styles from "./quests.module.css";

type Assignment = {
  id: string;
  museId: MuseId;
  role: "LEAD" | "SUPPORT" | "REVIEWER";
  note: string;
};

type MuseActionType = "CONSULT" | "DELEGATE" | "HANDOFF" | "REVIEW" | "CHALLENGE" | "ESCALATE" | "CONVENE";

type MuseResponse = {
  museId: MuseId;
  status: "COMPLETE" | "ERROR";
  text: string;
  model: string;
  createdAt: string;
  error: string;
};

type QuestEvent = {
  id: string;
  type: MuseActionType;
  actorMuseId: MuseId;
  targetMuseId: MuseId | null;
  message: string;
  createdAt: string;
  responses: MuseResponse[];
};

type LinkedProject = {
  id: string;
  title: string;
  type: string;
  status: string;
  progress: number;
  nextAction: string | null;
};

type Quest = {
  id: string;
  title: string;
  brief: string;
  status: "DRAFT" | "ACTIVE" | "WAITING" | "REVIEW" | "COMPLETE" | "ARCHIVED";
  projectId: string | null;
  project: LinkedProject | null;
  assignments: Assignment[];
  events: QuestEvent[];
  createdAt: string;
  updatedAt: string;
};

type ProjectOption = {
  id: string;
  title: string;
  type?: string;
  kind?: string;
  status?: string;
  statusEnum?: string;
};

type QuestForm = {
  title: string;
  brief: string;
  projectId: string;
  leadMuse: MuseId;
  supportMuse: "" | MuseId;
  reviewerMuse: "" | MuseId;
};

type ActionForm = {
  type: MuseActionType;
  actorMuseId: MuseId;
  targetMuseId: "" | MuseId;
  message: string;
};

const EMPTY_FORM: QuestForm = {
  title: "",
  brief: "",
  projectId: "",
  leadMuse: "novy",
  supportMuse: "",
  reviewerMuse: "",
};

const ACTIONS: Array<{ type: MuseActionType; label: string; description: string; target: boolean }> = [
  { type: "CONSULT", label: "Consult", description: "Ask another Muse for specialist input without changing ownership.", target: true },
  { type: "DELEGATE", label: "Delegate", description: "Give part of the quest to another Muse. The Lead remains responsible.", target: true },
  { type: "HANDOFF", label: "Handoff", description: "Transfer Lead ownership of the quest to another Muse.", target: true },
  { type: "REVIEW", label: "Review", description: "Request a formal critique and move the quest into Review.", target: true },
  { type: "CHALLENGE", label: "Challenge", description: "Record a formal disagreement or counterargument between Muses.", target: true },
  { type: "ESCALATE", label: "Escalate", description: "Return the decision to the Artist and mark the quest Waiting.", target: false },
  { type: "CONVENE", label: "Convene", description: "Bring the assigned Council party together around the same quest.", target: false },
];

const ACTIVE_STATUSES = new Set(["DRAFT", "ACTIVE", "WAITING", "REVIEW"]);

function labelStatus(status: Quest["status"]) {
  return status.toLowerCase().replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function normalizeQuest(quest: Quest): Quest {
  return {
    ...quest,
    events: (quest.events ?? []).map((event) => ({ ...event, responses: event.responses ?? [] })),
  };
}

function nextFormFromLocalStorage(): QuestForm {
  const form = { ...EMPTY_FORM };
  const selected = localStorage.getItem("wizard-os-museum-selected-muse") as MuseId | null;
  if (selected && MUSE_BY_ID[selected]) form.leadMuse = selected;

  try {
    const party = JSON.parse(localStorage.getItem("wizard-os-museum-party") ?? "[]") as MuseId[];
    const clean = party.filter((id) => MUSE_BY_ID[id]);
    if (clean[0]) form.leadMuse = clean[0];
    if (clean[1]) form.supportMuse = clean[1];
    if (clean[2]) form.reviewerMuse = clean[2];
  } catch {}

  return form;
}

function actionSentence(event: QuestEvent) {
  const actor = MUSE_BY_ID[event.actorMuseId]?.name ?? event.actorMuseId;
  const target = event.targetMuseId ? MUSE_BY_ID[event.targetMuseId]?.name ?? event.targetMuseId : null;
  switch (event.type) {
    case "CONSULT": return `${actor} consulted ${target}.`;
    case "DELEGATE": return `${actor} delegated work to ${target}.`;
    case "HANDOFF": return `${actor} handed Lead ownership to ${target}.`;
    case "REVIEW": return `${actor} requested review from ${target}.`;
    case "CHALLENGE": return `${actor} challenged ${target}.`;
    case "ESCALATE": return `${actor} escalated the decision to the Artist.`;
    case "CONVENE": return `${actor} convened the Council party.`;
  }
}

export default function MuseumQuestBoard() {
  const [quests, setQuests] = useState<Quest[]>([]);
  const [projects, setProjects] = useState<ProjectOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [actionQuest, setActionQuest] = useState<Quest | null>(null);
  const [saving, setSaving] = useState(false);
  const [savingAction, setSavingAction] = useState(false);
  const [error, setError] = useState("");
  const [filterMuse, setFilterMuse] = useState<"all" | MuseId>("all");
  const [form, setForm] = useState<QuestForm>(EMPTY_FORM);
  const [actionForm, setActionForm] = useState<ActionForm>({ type: "CONSULT", actorMuseId: "novy", targetMuseId: "", message: "" });

  const load = async () => {
    setLoading(true);
    try {
      const [questResponse, projectResponse] = await Promise.all([fetch("/api/museum/quests"), fetch("/api/projects")]);
      if (!questResponse.ok) throw new Error("Quest Board is unavailable.");
      const [questData, projectData] = await Promise.all([
        questResponse.json() as Promise<Quest[]>,
        projectResponse.ok ? (projectResponse.json() as Promise<ProjectOption[]>) : Promise.resolve([]),
      ]);
      setQuests(questData.map(normalizeQuest));
      setProjects(projectData);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Quest Board is unavailable.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const filteredQuests = useMemo(
    () => filterMuse === "all" ? quests : quests.filter((quest) => quest.assignments.some((assignment) => assignment.museId === filterMuse)),
    [filterMuse, quests],
  );

  const activeCount = quests.filter((quest) => ACTIVE_STATUSES.has(quest.status)).length;
  const reviewCount = quests.filter((quest) => quest.status === "REVIEW").length;
  const completedCount = quests.filter((quest) => quest.status === "COMPLETE").length;
  const actionCount = quests.reduce((total, quest) => total + quest.events.length, 0);

  const openCreate = () => {
    setError("");
    setForm(nextFormFromLocalStorage());
    setShowCreate(true);
  };

  const createQuest = async () => {
    setError("");
    if (!form.title.trim()) return setError("Give the quest a title.");
    const selected = [form.leadMuse, form.supportMuse, form.reviewerMuse].filter(Boolean);
    if (new Set(selected).size !== selected.length) return setError("Each Muse can hold only one role on a quest.");

    const assignments = [
      { museId: form.leadMuse, role: "LEAD" },
      ...(form.supportMuse ? [{ museId: form.supportMuse, role: "SUPPORT" }] : []),
      ...(form.reviewerMuse ? [{ museId: form.reviewerMuse, role: "REVIEWER" }] : []),
    ];

    setSaving(true);
    try {
      const response = await fetch("/api/museum/quests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: form.title, brief: form.brief, projectId: form.projectId || null, assignments }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Could not create quest.");
      setQuests((current) => [normalizeQuest(result as Quest), ...current]);
      setShowCreate(false);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Could not create quest.");
    } finally {
      setSaving(false);
    }
  };

  const setQuestStatus = async (quest: Quest, status: Quest["status"]) => {
    setError("");
    const previous = quests;
    setQuests((current) => current.map((item) => item.id === quest.id ? { ...item, status } : item));
    try {
      const response = await fetch(`/api/museum/quests/${quest.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      const updated = await response.json();
      if (!response.ok) throw new Error(updated.error ?? "Could not update quest.");
      setQuests((current) => current.map((item) => item.id === quest.id ? normalizeQuest(updated as Quest) : item));
    } catch (statusError) {
      setQuests(previous);
      setError(statusError instanceof Error ? statusError.message : "Could not update quest.");
    }
  };

  const openAction = (quest: Quest) => {
    setError("");
    const lead = quest.assignments.find((assignment) => assignment.role === "LEAD")?.museId ?? quest.assignments[0]?.museId ?? "novy";
    const firstOther = MUSE_DIRECTORY.find((muse) => muse.id !== lead)?.id ?? "aurelia";
    setActionQuest(quest);
    setActionForm({ type: "CONSULT", actorMuseId: lead, targetMuseId: firstOther, message: "" });
  };

  const actionDefinition = ACTIONS.find((action) => action.type === actionForm.type) ?? ACTIONS[0];
  const actorAssignment = actionQuest?.assignments.find((assignment) => assignment.museId === actionForm.actorMuseId);

  const submitAction = async () => {
    if (!actionQuest) return;
    setError("");
    if (actionDefinition.target && !actionForm.targetMuseId) return setError("Choose a target Muse.");
    if (actionForm.targetMuseId === actionForm.actorMuseId) return setError("Choose another Muse as the target.");
    setSavingAction(true);
    try {
      const response = await fetch(`/api/museum/quests/${actionQuest.id}/actions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: actionForm.type,
          actorMuseId: actionForm.actorMuseId,
          targetMuseId: actionDefinition.target ? actionForm.targetMuseId || null : null,
          message: actionForm.message,
        }),
      });
      const updated = await response.json();
      if (!response.ok) throw new Error(updated.error ?? "Could not complete Council action.");
      setQuests((current) => current.map((quest) => quest.id === actionQuest.id ? normalizeQuest(updated as Quest) : quest));
      setActionQuest(null);
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : "Could not complete Council action.");
    } finally {
      setSavingAction(false);
    }
  };

  return (
    <main className={styles.page}>
      <div className={styles.atmosphere} />
      <section className={styles.shell}>
        <header className={styles.header}>
          <div>
            <p className={styles.kicker}>THE MUSEUM · SHARED AGENCY</p>
            <h1>Quest Board</h1>
            <p>Persistent work shared by the Nine Muses. Ownership, Council actions, responses and handoffs remain attached to one shared quest.</p>
          </div>
          <button className={styles.primary} onClick={openCreate}>+ New Quest</button>
        </header>

        <section className={styles.metrics}>
          <article><span>Active Quests</span><strong>{activeCount}</strong><small>Draft, active, waiting or review</small></article>
          <article><span>Awaiting Review</span><strong>{reviewCount}</strong><small>Ready for another Muse or the Artist</small></article>
          <article><span>Completed</span><strong>{completedCount}</strong><small>Persistent Museum history</small></article>
          <article><span>Council Actions</span><strong>{actionCount}</strong><small>Consults, handoffs and decisions</small></article>
          <article><span>Shared Projects</span><strong>{new Set(quests.map((quest) => quest.projectId).filter(Boolean)).size}</strong><small>Linked to Wizard OS work</small></article>
        </section>

        <section className={styles.filterBar}>
          <button className={filterMuse === "all" ? styles.filterActive : ""} onClick={() => setFilterMuse("all")}>All</button>
          {MUSE_DIRECTORY.map((muse) => (
            <button key={muse.id} className={filterMuse === muse.id ? styles.filterActive : ""} onClick={() => setFilterMuse(muse.id)}>{muse.symbol} {muse.name}</button>
          ))}
        </section>

        {error && !showCreate && !actionQuest && <div className={styles.error}>{error}</div>}

        {loading ? (
          <section className={styles.empty}><strong>Reading the Quest Board…</strong></section>
        ) : filteredQuests.length === 0 ? (
          <section className={styles.empty}>
            <strong>{filterMuse === "all" ? "No quests yet" : `No quests assigned to ${MUSE_BY_ID[filterMuse].name}`}</strong>
            <p>Create a quest to give the Council persistent work.</p>
            {filterMuse === "all" && <button className={styles.primary} onClick={openCreate}>Create first quest</button>}
          </section>
        ) : (
          <section className={styles.questGrid}>
            {filteredQuests.map((quest) => {
              const lead = quest.assignments.find((assignment) => assignment.role === "LEAD");
              const others = quest.assignments.filter((assignment) => assignment.role !== "LEAD");
              const recentEvents = [...quest.events].slice(-4).reverse();
              return (
                <article className={styles.questCard} key={quest.id}>
                  <div className={styles.questTop}>
                    <span className={`${styles.status} ${styles[`status${quest.status}`]}`}>{labelStatus(quest.status)}</span>
                    <span className={styles.updated}>Updated {new Date(quest.updatedAt).toLocaleDateString()}</span>
                  </div>
                  <h2>{quest.title}</h2>
                  <p className={styles.brief}>{quest.brief || "No brief recorded yet."}</p>

                  {quest.project && (
                    <a className={styles.projectLink} href={`/?project=${quest.project.id}`}>
                      <span>Linked Project</span>
                      <strong>{quest.project.title}</strong>
                      <small>{quest.project.progress}% · {quest.project.status.toLowerCase().replaceAll("_", " ")}</small>
                    </a>
                  )}

                  <div className={styles.roster}>
                    {lead && (
                      <div className={styles.lead}>
                        <span>{MUSE_BY_ID[lead.museId]?.symbol ?? "✦"}</span>
                        <div><small>Lead</small><strong>{MUSE_BY_ID[lead.museId]?.name ?? lead.museId}</strong></div>
                      </div>
                    )}
                    {others.map((assignment) => (
                      <div key={assignment.id}>
                        <span>{MUSE_BY_ID[assignment.museId]?.symbol ?? "·"}</span>
                        <div><small>{assignment.role === "REVIEWER" ? "Reviewer" : "Support"}</small><strong>{MUSE_BY_ID[assignment.museId]?.name ?? assignment.museId}</strong></div>
                      </div>
                    ))}
                  </div>

                  <section className={styles.timeline}>
                    <div className={styles.timelineHead}><span>Council Activity</span><strong>{quest.events.length}</strong></div>
                    {recentEvents.length === 0 ? <p>No Muse-to-Muse actions recorded yet.</p> : recentEvents.map((event) => (
                      <div className={styles.event} key={event.id}>
                        <span className={styles.eventSigil}>{MUSE_BY_ID[event.actorMuseId]?.symbol ?? "✦"}</span>
                        <div className={styles.eventBody}>
                          <strong>{actionSentence(event)}</strong>
                          {event.message && <p>{event.message}</p>}
                          <small>{new Date(event.createdAt).toLocaleString()}</small>
                          {event.responses.length > 0 && (
                            <div className={styles.responseStack}>
                              {event.responses.map((museResponse, index) => (
                                <article className={`${styles.museResponse} ${museResponse.status === "ERROR" ? styles.responseError : ""}`} key={`${event.id}:${museResponse.museId}:${index}`}>
                                  <header>
                                    <span>{MUSE_BY_ID[museResponse.museId]?.symbol ?? "✦"}</span>
                                    <strong>{MUSE_BY_ID[museResponse.museId]?.name ?? museResponse.museId}</strong>
                                    <small>{MUSE_BY_ID[museResponse.museId]?.role ?? "Muse"}</small>
                                  </header>
                                  {museResponse.status === "COMPLETE" ? (
                                    <p className={styles.museResponseText}>{museResponse.text}</p>
                                  ) : (
                                    <p className={styles.responseErrorText}>{museResponse.error || "Muse response generation failed."}</p>
                                  )}
                                  <footer>{museResponse.model || "AI Gateway"}</footer>
                                </article>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </section>

                  <div className={styles.actions}>
                    {quest.status !== "COMPLETE" && <button className={styles.councilAction} onClick={() => openAction(quest)}>Council Action</button>}
                    {quest.status !== "ACTIVE" && quest.status !== "COMPLETE" && <button onClick={() => void setQuestStatus(quest, "ACTIVE")}>Resume</button>}
                    {quest.status === "ACTIVE" && <button onClick={() => void setQuestStatus(quest, "WAITING")}>Wait</button>}
                    {quest.status !== "REVIEW" && quest.status !== "COMPLETE" && <button onClick={() => void setQuestStatus(quest, "REVIEW")}>Send to Review</button>}
                    {quest.status === "REVIEW" && <button className={styles.complete} onClick={() => void setQuestStatus(quest, "COMPLETE")}>Complete</button>}
                    {quest.status === "COMPLETE" && <button onClick={() => void setQuestStatus(quest, "ACTIVE")}>Reopen</button>}
                  </div>
                </article>
              );
            })}
          </section>
        )}

        <section className={styles.nextLayer}>
          <span>v0.4</span>
          <div><strong>Council actions can now return actual specialist responses.</strong><p>Consult, Delegate, Handoff, Review and Challenge call the target Muse; Escalate creates an Artist-facing memo; Convene asks every assigned Muse for a separate domain position.</p></div>
        </section>
      </section>

      {showCreate && (
        <div className={styles.modalBackdrop} onMouseDown={() => setShowCreate(false)}>
          <section className={styles.modal} onMouseDown={(event) => event.stopPropagation()}>
            <header className={styles.modalHeader}>
              <div><p className={styles.kicker}>ASSIGN SHARED WORK</p><h2>New Quest</h2></div>
              <button onClick={() => setShowCreate(false)}>×</button>
            </header>

            <label className={styles.field}><span>Quest title</span><input autoFocus maxLength={120} value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} placeholder="Winter Collection Launch" /></label>
            <label className={styles.field}><span>Brief</span><textarea maxLength={2500} value={form.brief} onChange={(event) => setForm({ ...form, brief: event.target.value })} placeholder="What should the Muses accomplish, decide, or produce?" /></label>
            <label className={styles.field}><span>Linked Wizard OS project</span><select value={form.projectId} onChange={(event) => setForm({ ...form, projectId: event.target.value })}><option value="">No linked project</option>{projects.map((project) => <option key={project.id} value={project.id}>{project.title}</option>)}</select></label>

            <div className={styles.assignmentGrid}>
              <label className={styles.field}><span>Lead Muse</span><select value={form.leadMuse} onChange={(event) => setForm({ ...form, leadMuse: event.target.value as MuseId })}>{MUSE_DIRECTORY.map((muse) => <option key={muse.id} value={muse.id}>{muse.name} · {muse.role}</option>)}</select></label>
              <label className={styles.field}><span>Support Muse</span><select value={form.supportMuse} onChange={(event) => setForm({ ...form, supportMuse: event.target.value as "" | MuseId })}><option value="">None</option>{MUSE_DIRECTORY.map((muse) => <option key={muse.id} value={muse.id}>{muse.name}</option>)}</select></label>
              <label className={styles.field}><span>Reviewer Muse</span><select value={form.reviewerMuse} onChange={(event) => setForm({ ...form, reviewerMuse: event.target.value as "" | MuseId })}><option value="">None</option>{MUSE_DIRECTORY.map((muse) => <option key={muse.id} value={muse.id}>{muse.name}</option>)}</select></label>
            </div>

            {error && <div className={styles.error}>{error}</div>}
            <footer className={styles.modalFooter}>
              <span>One Lead is required. Support and Reviewer are optional.</span>
              <button className={styles.primary} disabled={saving || !form.title.trim()} onClick={() => void createQuest()}>{saving ? "Creating…" : "Create Quest"}</button>
            </footer>
          </section>
        </div>
      )}

      {actionQuest && (
        <div className={styles.modalBackdrop} onMouseDown={() => !savingAction && setActionQuest(null)}>
          <section className={`${styles.modal} ${styles.actionModal}`} onMouseDown={(event) => event.stopPropagation()}>
            <header className={styles.modalHeader}>
              <div><p className={styles.kicker}>MUSE-TO-MUSE COMMAND</p><h2>Council Action</h2><span className={styles.modalQuest}>{actionQuest.title}</span></div>
              <button disabled={savingAction} onClick={() => setActionQuest(null)}>×</button>
            </header>

            <div className={styles.actionTypeGrid}>
              {ACTIONS.map((action) => (
                <button disabled={savingAction} key={action.type} className={actionForm.type === action.type ? styles.actionTypeActive : ""} onClick={() => setActionForm((current) => ({ ...current, type: action.type, targetMuseId: action.target ? current.targetMuseId : "" }))}>
                  <strong>{action.label}</strong><span>{action.description}</span>
                </button>
              ))}
            </div>

            <div className={styles.assignmentGrid}>
              <label className={styles.field}><span>Acting Muse</span><select disabled={savingAction} value={actionForm.actorMuseId} onChange={(event) => setActionForm({ ...actionForm, actorMuseId: event.target.value as MuseId })}>{actionQuest.assignments.map((assignment) => <option key={assignment.museId} value={assignment.museId}>{MUSE_BY_ID[assignment.museId].name} · {assignment.role.toLowerCase()}</option>)}</select></label>
              {actionDefinition.target && <label className={styles.field}><span>Target Muse</span><select disabled={savingAction} value={actionForm.targetMuseId} onChange={(event) => setActionForm({ ...actionForm, targetMuseId: event.target.value as MuseId })}><option value="">Choose Muse</option>{MUSE_DIRECTORY.filter((muse) => muse.id !== actionForm.actorMuseId).map((muse) => <option key={muse.id} value={muse.id}>{muse.name} · {muse.role}</option>)}</select></label>}
            </div>

            {(actionForm.type === "DELEGATE" || actionForm.type === "HANDOFF") && actorAssignment?.role !== "LEAD" && <div className={styles.commandNotice}>Only the Lead Muse can {actionForm.type === "DELEGATE" ? "delegate" : "hand off ownership"}. Choose the current Lead as the acting Muse.</div>}

            <label className={styles.field}><span>Instruction / reason</span><textarea disabled={savingAction} maxLength={1200} value={actionForm.message} onChange={(event) => setActionForm({ ...actionForm, message: event.target.value })} placeholder={actionForm.type === "ESCALATE" ? "What decision needs the Artist?" : actionForm.type === "CONVENE" ? "What should the Council resolve together?" : "What should the receiving Muse examine, produce, or challenge?"} /></label>

            <div className={styles.generationNotice}>
              <span>✦</span>
              <p>{actionForm.type === "CONVENE" ? "Each assigned Muse will respond separately from her own portfolio." : actionForm.type === "ESCALATE" ? "The acting Muse will prepare an escalation memo for you." : "The receiving Muse will respond now using this quest's shared context."}</p>
            </div>

            {error && <div className={styles.error}>{error}</div>}
            <footer className={styles.modalFooter}>
              <span>{savingAction ? "The Museum is generating and preserving the Council response…" : actionDefinition.description}</span>
              <button className={styles.primary} disabled={savingAction || ((actionForm.type === "DELEGATE" || actionForm.type === "HANDOFF") && actorAssignment?.role !== "LEAD")} onClick={() => void submitAction()}>{savingAction ? "Muse Responding…" : `${actionDefinition.label} + Respond`}</button>
            </footer>
          </section>
        </div>
      )}
    </main>
  );
}
