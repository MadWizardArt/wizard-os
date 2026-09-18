"use client";

import { useEffect, useMemo, useState } from "react";
import { MUSE_DIRECTORY } from "../../../lib/museum-directory";
import type { MuseId } from "../../../lib/museum";
import type { ProposalCategory } from "../../../lib/museum-proposal-storage";
import type { CouncilKnowledgeRecord } from "../../../lib/museum-knowledge";
import type { IntelligenceFuelUsage, IntelligenceQuestRecord } from "../../../lib/museum-intelligence";
import styles from "./selective-intelligence.module.css";

const CATEGORIES: ProposalCategory[] = ["revenue", "product", "content", "system", "risk", "research", "capacity", "experiment"];

type GatewayStatus = {
  state: "ready" | "empty" | "unavailable" | "unknown";
  balance: number | null;
  totalUsed: number | null;
  modelListed: boolean | null;
  checkedAt: string;
};

type IntelligencePayload = {
  enabled: boolean;
  model: string;
  gateway: GatewayStatus | null;
  usage: IntelligenceFuelUsage | null;
  quests: IntelligenceQuestRecord[];
};

type QuestDraft = { museId: MuseId; category: ProposalCategory; brief: string };
type ArtistSession = {
  configured: boolean;
  authenticated: boolean;
  fuelEnabled: boolean;
  knowledgeIntakeConfigured: boolean;
  model: string;
  budget: { maxRuns: number; dailyTokens: number; maxOutputTokens: number };
};

type MindWorkingState = {
  version: 1;
  museId: MuseId;
  objective: string;
  category: ProposalCategory;
  sourceKey: string;
  status: "active" | "waiting" | "blocked" | "complete" | "superseded";
  nextAction: string | null;
  completionCondition: string;
  notes: string | null;
  evidenceRefs: string[];
  verificationStatus: "unverified" | "artist-confirmed" | "system-verified";
  verifiedAt: string | null;
  completedAt: string | null;
  graduatedMemoryId: string | null;
};

type MindMemory = {
  version: 1;
  museId: MuseId;
  kind: "decision" | "outcome" | "lesson";
  title: string;
  summary: string;
  category: ProposalCategory;
  verifiedBy: "artist" | "system";
  createdAt: string;
};

type MindContinuityPayload = {
  museId: MuseId;
  workingStates: Array<{ id: string; state: MindWorkingState }>;
  durableMemories: Array<{ id: string; memory: MindMemory }>;
};

const EMPTY_QUEST: QuestDraft = {
  museId: "callista",
  category: "revenue",
  brief: "",
};

const EMPTY_PAYLOAD: IntelligencePayload = {
  enabled: false,
  model: "openai/gpt-5.6-sol",
  gateway: null,
  usage: null,
  quests: [],
};

function modelLabel(model: string) {
  const id = model.split("/").pop() ?? model;
  if (id === "gpt-5.6-sol") return "GPT-5.6 Sol";
  return id.replaceAll("-", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function questStatus(status: IntelligenceQuestRecord["status"]) {
  if (status === "candidate") return "Ready to fuel";
  if (status === "running") return "Thinking";
  if (status === "completed") return "Complete";
  if (status === "failed") return "Needs attention";
  return "Closed";
}

function cleanMarkdown(text: string) {
  return text.replace(/\*\*/g, "").replace(/^#{1,4}\s*/, "").trim();
}

function MuseAnswer({ answer }: { answer: string }) {
  return <div className={styles.answerBody}>
    {answer.split("\n").map((raw, index) => {
      const line = raw.trim();
      if (!line) return <span className={styles.answerSpace} key={index} />;
      if (/^#{1,4}\s/.test(line)) return <h4 key={index}>{cleanMarkdown(line)}</h4>;
      if (/^[-*]\s/.test(line)) return <p className={styles.answerBullet} key={index}><span>•</span>{cleanMarkdown(line.slice(2))}</p>;
      return <p key={index}>{cleanMarkdown(line)}</p>;
    })}
  </div>;
}

export default function SelectiveIntelligencePage() {
  const [session, setSession] = useState<ArtistSession | null>(null);
  const [accessKey, setAccessKey] = useState("");
  const [knowledge, setKnowledge] = useState<CouncilKnowledgeRecord[]>([]);
  const [payload, setPayload] = useState<IntelligencePayload>(EMPTY_PAYLOAD);
  const [mind, setMind] = useState<MindContinuityPayload | null>(null);
  const [lessonDrafts, setLessonDrafts] = useState<Record<string, string>>({});
  const [draft, setDraft] = useState<QuestDraft>(EMPTY_QUEST);
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const loadProtected = async () => {
    setLoading(true);
    try {
      const [knowledgeResponse, intelligenceResponse, mindResponse] = await Promise.all([
        fetch("/api/museum/knowledge", { cache: "no-store" }),
        fetch("/api/museum/intelligence", { cache: "no-store" }),
        fetch("/api/museum/mind-state?muse=novy", { cache: "no-store" }),
      ]);
      const knowledgeJson = await knowledgeResponse.json();
      const intelligenceJson = await intelligenceResponse.json();
      const mindJson = await mindResponse.json();
      if (knowledgeResponse.status === 401 || intelligenceResponse.status === 401 || mindResponse.status === 401) {
        setSession((current) => current ? { ...current, authenticated: false } : current);
        throw new Error("Artist session expired. Unlock the chamber again.");
      }
      if (!knowledgeResponse.ok) throw new Error(knowledgeJson.error || "Council knowledge could not be read.");
      if (!intelligenceResponse.ok) throw new Error(intelligenceJson.error || "Intelligence quests could not be read.");
      if (!mindResponse.ok) throw new Error(mindJson.error || "Novy continuity could not be read.");
      setKnowledge(Array.isArray(knowledgeJson) ? knowledgeJson : []);
      setPayload(intelligenceJson);
      setMind(mindJson);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "The Intelligence Chamber could not be loaded.");
    } finally {
      setLoading(false);
    }
  };

  const loadSession = async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/museum/artist-session", { cache: "no-store" });
      const json = await response.json();
      if (!response.ok) throw new Error(json.error || "Artist Gate could not be read.");
      setSession(json);
      if (json.authenticated) await loadProtected();
      else setLoading(false);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Artist Gate could not be read.");
      setLoading(false);
    }
  };

  useEffect(() => { void loadSession(); }, []);

  const unlock = async () => {
    setBusy("unlock");
    try {
      const response = await fetch("/api/museum/artist-session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accessKey }),
      });
      const json = await response.json();
      if (!response.ok) throw new Error(json.error || "Artist Gate did not unlock.");
      setSession(json);
      setAccessKey("");
      setNotice("Welcome back, Artist. The Council is ready when you are.");
      await loadProtected();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Artist Gate did not unlock.");
    } finally {
      setBusy(null);
    }
  };

  const logout = async () => {
    await fetch("/api/museum/artist-session", { method: "DELETE" });
    setSession((current) => current ? { ...current, authenticated: false } : current);
    setKnowledge([]);
    setPayload(EMPTY_PAYLOAD);
    setMind(null);
    setLessonDrafts({});
    setNotice("Intelligence Chamber locked.");
  };

  const completed = useMemo(() => payload.quests.filter((quest) => quest.status === "completed"), [payload.quests]);
  const pendingKnowledge = useMemo(() => knowledge.filter((entry) => !entry.verifiedByArtist), [knowledge]);
  const activeKnowledge = useMemo(() => knowledge.filter((entry) => entry.verifiedByArtist), [knowledge]);
  const totalTokens = completed.reduce((sum, quest) => sum + (quest.usage?.totalTokens ?? 0), 0);

  const createQuest = async () => {
    if (!draft.brief.trim()) {
      setNotice("Paste a quest brief first.");
      return;
    }
    setBusy("create");
    try {
      const response = await fetch("/api/museum/intelligence", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(draft),
      });
      const json = await response.json();
      if (!response.ok) throw new Error(json.error || "Quest could not be prepared.");
      setDraft((current) => ({ ...current, brief: "" }));
      setNotice("Quest prepared from one brief. No AI credits have been spent yet.");
      await loadProtected();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Quest could not be prepared.");
    } finally {
      setBusy(null);
    }
  };

  const runQuest = async (id: string) => {
    setBusy(id);
    try {
      const response = await fetch("/api/museum/intelligence", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, action: "run" }),
      });
      const json = await response.json();
      if (!response.ok) throw new Error(json.error || "The Muse could not complete this quest.");
      setNotice("Muse synthesis complete. Nothing was committed without your approval.");
      await loadProtected();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "The Muse could not complete this quest.");
      await loadProtected();
    } finally {
      setBusy(null);
    }
  };

  const retryQuest = async (id: string) => {
    setBusy(`retry:${id}`);
    try {
      const response = await fetch("/api/museum/intelligence", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, action: "retry" }),
      });
      const json = await response.json();
      if (!response.ok) throw new Error(json.error || "The quest could not be prepared for retry.");
      setNotice("Fresh retry prepared. You can keep or delete the original failed attempt.");
      await loadProtected();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "The quest could not be prepared for retry.");
    } finally {
      setBusy(null);
    }
  };

  const deleteQuest = async (id: string) => {
    if (!window.confirm("Delete this failed attempt from the Museum ledger?")) return;
    setBusy(`delete:${id}`);
    try {
      const response = await fetch("/api/museum/intelligence", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      const json = await response.json();
      if (!response.ok) throw new Error(json.error || "The failed quest could not be deleted.");
      setNotice("Failed attempt deleted from the Museum ledger.");
      await loadProtected();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "The failed quest could not be deleted.");
    } finally {
      setBusy(null);
    }
  };

  const updateMindStatus = async (record: { id: string; state: MindWorkingState }, status: MindWorkingState["status"]) => {
    setBusy(`mind-status:${record.id}`);
    try {
      const state = record.state;
      const response = await fetch("/api/museum/mind-state", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          museId: state.museId,
          category: state.category,
          objective: state.objective,
          sourceKey: state.sourceKey,
          completionCondition: state.completionCondition,
          status,
        }),
      });
      const json = await response.json();
      if (!response.ok) throw new Error(json.error || "Working state could not be updated.");
      setNotice(status === "complete" ? "Working state marked complete. It still requires explicit verification." : "Working state updated.");
      await loadProtected();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Working state could not be updated.");
    } finally {
      setBusy(null);
    }
  };

  const verifyMindState = async (record: { id: string; state: MindWorkingState }) => {
    setBusy(`mind-verify:${record.id}`);
    try {
      const response = await fetch("/api/museum/mind-state", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: record.id, action: "verify", evidenceRefs: record.state.evidenceRefs }),
      });
      const json = await response.json();
      if (!response.ok) throw new Error(json.error || "Working state could not be verified.");
      setNotice("Evidence verified by the Artist. The state is now eligible for explicit memory graduation.");
      await loadProtected();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Working state could not be verified.");
    } finally {
      setBusy(null);
    }
  };

  const graduateMindState = async (record: { id: string; state: MindWorkingState }) => {
    const summary = (lessonDrafts[record.id] || "").trim();
    if (!summary) {
      setNotice("Write the durable lesson before graduating this state.");
      return;
    }
    setBusy(`mind-graduate:${record.id}`);
    try {
      const response = await fetch("/api/museum/mind-state", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: record.id, action: "graduate", kind: "lesson", summary }),
      });
      const json = await response.json();
      if (!response.ok) throw new Error(json.error || "Working state could not become durable memory.");
      setLessonDrafts((current) => {
        const next = { ...current };
        delete next[record.id];
        return next;
      });
      setNotice("Durable lesson graduated into Novy's personal memory.");
      await loadProtected();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Working state could not become durable memory.");
    } finally {
      setBusy(null);
    }
  };

  const reviewKnowledge = async (id: string, action: "verify" | "archive") => {
    setBusy(`knowledge:${id}`);
    try {
      const response = await fetch("/api/museum/knowledge", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, action }),
      });
      const json = await response.json();
      if (!response.ok) throw new Error(json.error || "Knowledge review failed.");
      setNotice(action === "verify"
        ? "Knowledge admitted to future Muse reasoning."
        : "Knowledge archived and excluded from future Muse reasoning.");
      await loadProtected();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Knowledge review failed.");
    } finally {
      setBusy(null);
    }
  };

  const usage = payload.usage;
  const gateway = payload.gateway;
  const authenticated = Boolean(session?.authenticated);
  const poweredToday = usage ? usage.completedRuns + usage.activeRuns : 0;
  const gatewayBalance = gateway?.balance == null ? "—" : `$${gateway.balance.toFixed(2)}`;
  const modelReady = gateway?.modelListed !== false;
  const councilReady = payload.enabled && gateway?.state === "ready" && modelReady;

  return (
    <main className={styles.page}>
      <section className={styles.shell}>
        <header className={styles.header}>
          <div>
            <p className={styles.kicker}>THE MUSEUM · INTELLIGENCE CHAMBER</p>
            <h1>Selective Intelligence</h1>
            <p>Bring the Council the questions that deserve deeper thought. Wizard OS gathers the evidence; one accountable Muse returns the synthesis; you retain the decision.</p>
          </div>
          <div className={styles.links}><a href="/museum/cognition">Cognition</a><a href="/museum/agency">Agency</a><a href="/museum">Museum</a></div>
        </header>

        {notice && <button className={styles.notice} onClick={() => setNotice("")}>{notice}<span>×</span></button>}

        {!authenticated && (
          <section className={styles.artistGate}>
            <div>
              <p className={styles.kicker}>ARTIST GATE</p>
              <h2>{session?.configured ? "Unlock the Intelligence Chamber" : "Artist access awaits one-time configuration"}</h2>
              <p>{session?.configured
                ? "Your key opens a short-lived private session. It is exchanged for a secure cookie and is not kept in the page."
                : "Configure the Artist access key in the production environment before the Council can use powered reasoning."}</p>
            </div>
            {session?.configured && <div className={styles.unlockRow}>
              <input type="password" value={accessKey} onChange={(event) => setAccessKey(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") void unlock(); }} placeholder="Artist access key" autoComplete="current-password" />
              <button className={styles.primary} disabled={busy === "unlock" || accessKey.length < 1} onClick={unlock}>{busy === "unlock" ? "Unlocking…" : "Unlock"}</button>
            </div>}
          </section>
        )}

        {authenticated && <>
          <div className={styles.sessionBar}><span><span className={styles.liveDot} />Artist session active</span><button onClick={logout}>Lock</button></div>

          <section className={`${styles.readiness} ${councilReady ? styles.ready : styles.attention}`}>
            <div className={styles.readinessLead}>
              <p className={styles.kicker}>COUNCIL FUEL</p>
              <h2>{councilReady ? "The Council is ready." : "The Council needs attention."}</h2>
              <p>{councilReady
                ? `${modelLabel(payload.model)} is armed with a funded Gateway balance. Every powered quest still requires your explicit click.`
                : !payload.enabled
                  ? "Powered reasoning is locked. You may still prepare quests without spending credits."
                  : gateway?.state === "empty"
                    ? "AI Gateway has no available balance. Add credits before fueling another quest."
                    : !modelReady
                      ? `${modelLabel(payload.model)} is not currently listed for this Gateway account.`
                      : "Gateway status could not be confirmed. Prepared quests remain safe until you choose to fuel them."}</p>
            </div>
            <div className={styles.readinessGrid}>
              <article><span>Model</span><strong>{modelLabel(payload.model)}</strong><small>{modelReady ? "Available" : "Check access"}</small></article>
              <article><span>Gateway credits</span><strong>{gatewayBalance}</strong><small>{gateway?.state === "ready" ? "Funded" : gateway?.state === "empty" ? "Top up required" : "Status unavailable"}</small></article>
              <article><span>Today</span><strong>{poweredToday}/{usage?.maxRuns ?? session?.budget.maxRuns ?? 0}</strong><small>{usage ? `${usage.usedTokens.toLocaleString()} / ${usage.dailyTokens.toLocaleString()} tokens` : "Reading allowance"}</small></article>
            </div>
            {gateway?.state === "empty" && <a className={styles.gatewayLink} href="https://vercel.com/mad-wizard/~/ai" target="_blank" rel="noreferrer">Open AI Gateway treasury ↗</a>}
          </section>

          <section className={styles.stats}>
            <article><strong>{activeKnowledge.length}</strong><span>verified knowledge</span></article>
            <article><strong>{pendingKnowledge.length}</strong><span>awaiting review</span></article>
            <article><strong>{payload.quests.filter((quest) => quest.status === "candidate").length}</strong><span>ready quests</span></article>
            <article><strong>{totalTokens.toLocaleString()}</strong><span>lifetime quest tokens</span></article>
          </section>

          <section className={styles.section}>
            <div className={styles.sectionHead}><div><p className={styles.kicker}>NOVY MIND · REFERENCE ORGANISM</p><h2>Working continuity and durable memory</h2></div><small>{mind ? `${mind.workingStates.length} states · ${mind.durableMemories.length} memories` : "Reading mind…"}</small></div>
            <p className={styles.explainer}>Working state is temporary and may change. Durable memory only appears after completion, evidence, verification, and explicit graduation. This panel uses the same continuity ledger that fuels Novy&apos;s future reasoning.</p>
            <div className={styles.mindGrid}>
              <div className={styles.mindColumn}>
                <div className={styles.mindColumnHead}><h3>Working state</h3><span>Live operational context</span></div>
                {!mind && <p className={styles.empty}>Reading Novy&apos;s continuity…</p>}
                {mind && mind.workingStates.length === 0 && <div className={styles.emptyBox}><strong>No working state.</strong><p>Novy has no persisted operational context yet.</p></div>}
                {mind?.workingStates.slice(0, 8).map((record) => {
                  const state = record.state;
                  const verified = state.verificationStatus !== "unverified";
                  const canGraduate = state.status === "complete" && verified && !state.graduatedMemoryId;
                  return <article className={styles.mindCard} key={record.id}>
                    <div className={styles.tags}><span>{state.status}</span><span>{state.verificationStatus.replaceAll("-", " ")}</span><span>{state.category}</span></div>
                    <h3>{state.objective}</h3>
                    <p><strong>Next</strong> · {state.nextAction || "No next action"}</p>
                    <small><strong>Complete when</strong> · {state.completionCondition}</small>
                    <div className={styles.mindEvidence}>
                      <strong>Evidence</strong>
                      {state.evidenceRefs.length ? <ul>{state.evidenceRefs.map((ref) => <li key={ref}>{ref}</li>)}</ul> : <span>No evidence recorded yet.</span>}
                    </div>
                    {state.graduatedMemoryId && <p className={styles.graduated}>Graduated → {state.graduatedMemoryId}</p>}
                    {!state.graduatedMemoryId && <div className={styles.mindActions}>
                      {["active", "waiting", "blocked"].includes(state.status) && <button className={styles.secondary} disabled={busy === `mind-status:${record.id}`} onClick={() => updateMindStatus(record, "complete")}>{busy === `mind-status:${record.id}` ? "Saving…" : "Mark complete"}</button>}
                      {state.status === "complete" && !verified && <button className={styles.primary} disabled={busy === `mind-verify:${record.id}` || state.evidenceRefs.length === 0} onClick={() => verifyMindState(record)}>{busy === `mind-verify:${record.id}` ? "Verifying…" : "Verify evidence"}</button>}
                      {canGraduate && <>
                        <textarea className={styles.lessonDraft} value={lessonDrafts[record.id] || ""} onChange={(event) => setLessonDrafts((current) => ({ ...current, [record.id]: event.target.value }))} placeholder="State the durable lesson worth carrying into future reasoning." />
                        <button className={styles.primary} disabled={busy === `mind-graduate:${record.id}` || !(lessonDrafts[record.id] || "").trim()} onClick={() => graduateMindState(record)}>{busy === `mind-graduate:${record.id}` ? "Graduating…" : "Graduate lesson"}</button>
                      </>}
                    </div>}
                  </article>;
                })}
              </div>
              <div className={styles.mindColumn}>
                <div className={styles.mindColumnHead}><h3>Durable memory</h3><span>Verified lessons and decisions</span></div>
                {mind && mind.durableMemories.length === 0 && <div className={styles.emptyBox}><strong>No durable memory.</strong><p>Verified learning will appear here after explicit graduation.</p></div>}
                {mind?.durableMemories.slice(0, 8).map(({ id, memory }) => <article className={styles.memoryCard} key={id}>
                  <div className={styles.tags}><span>{memory.kind}</span><span>{memory.category}</span><span>verified by {memory.verifiedBy}</span></div>
                  <h3>{memory.title}</h3>
                  <p>{memory.summary}</p>
                  <small>{new Date(memory.createdAt).toLocaleString()}</small>
                </article>)}
              </div>
            </div>
          </section>

          {pendingKnowledge.length > 0 && <section className={styles.section}>
            <div className={styles.sectionHead}><div><p className={styles.kicker}>KNOWLEDGE INBOX</p><h2>Context awaiting your approval</h2></div><small>{pendingKnowledge.length} capsule{pendingKnowledge.length === 1 ? "" : "s"}</small></div>
            <p className={styles.explainer}>Incoming project knowledge stays inert until you verify it. Nothing here can influence a Muse yet.</p>
            <div className={styles.knowledgeGrid}>
              {pendingKnowledge.map((entry) => <article key={entry.id} className={`${styles.knowledge} ${styles.pendingKnowledge}`}>
                <div className={styles.tags}><span>Awaiting Artist</span><span>{entry.kind.replaceAll("_", " ")}</span>{entry.category && <span>{entry.category}</span>}</div>
                <h3>{entry.title}</h3><p>{entry.content}</p><small>{entry.sourceRef}</small>
                <div className={styles.reviewRow}>
                  <button className={styles.primary} disabled={busy === `knowledge:${entry.id}`} onClick={() => reviewKnowledge(entry.id, "verify")}>Verify for Muses</button>
                  <button className={styles.secondary} disabled={busy === `knowledge:${entry.id}`} onClick={() => reviewKnowledge(entry.id, "archive")}>Archive</button>
                </div>
              </article>)}
            </div>
          </section>}

          <section className={styles.section}>
            <div className={styles.sectionHead}><div><p className={styles.kicker}>FETCH QUEST</p><h2>Paste it once. Ask one Muse.</h2></div><small>Preparing is free</small></div>
            <div className={styles.composer}>
              <div className={styles.twoCol}>
                <label>Accountable Muse<select value={draft.museId} onChange={(event) => setDraft({ ...draft, museId: event.target.value as MuseId })}>{MUSE_DIRECTORY.map((muse) => <option key={muse.id} value={muse.id}>{muse.name} · {muse.role}</option>)}</select></label>
                <label>Domain<select value={draft.category} onChange={(event) => setDraft({ ...draft, category: event.target.value as ProposalCategory })}>{CATEGORIES.map((category) => <option key={category}>{category}</option>)}</select></label>
              </div>
              <label>Quest brief<textarea value={draft.brief} onChange={(event) => setDraft({ ...draft, brief: event.target.value })} onKeyDown={(event) => { if ((event.metaKey || event.ctrlKey) && event.key === "Enter") void createQuest(); }} placeholder="Paste the question or request exactly as you asked it here. Wizard OS will derive the internal reasoning purpose and useful outcome automatically." /></label>
              <p className={styles.explainer}>One paste is enough. The Museum derives the internal reasoning and expected-value fields deterministically, without spending an extra AI call. Press Ctrl/⌘ + Enter to prepare.</p>
              <button className={styles.primary} disabled={busy === "create" || !draft.brief.trim()} onClick={createQuest}>{busy === "create" ? "Preparing…" : "Prepare quest"}</button>
            </div>
          </section>

          <section className={styles.section}>
            <div className={styles.sectionHead}><div><p className={styles.kicker}>QUEST LOG</p><h2>Council answers and attempts</h2></div><small>{payload.quests.length} total</small></div>
            {loading && <p className={styles.empty}>Reading the Council ledger…</p>}
            {!loading && payload.quests.length === 0 && <div className={styles.emptyBox}><strong>No quests yet.</strong><p>The Council stays deterministic until you decide a question deserves powered reasoning.</p></div>}
            <div className={styles.questGrid}>
              {payload.quests.map((quest) => {
                const muse = MUSE_DIRECTORY.find((item) => item.id === quest.museId);
                const museName = muse?.name ?? quest.museId;
                return <article className={`${styles.quest} ${quest.status === "completed" ? styles.questComplete : ""}`} key={quest.id}>
                  <div className={styles.questTop}>
                    <div className={styles.tags}><span>{museName}</span><span>{quest.category}</span></div>
                    <span className={`${styles.status} ${styles[`status_${quest.status}`]}`}>{questStatus(quest.status)}</span>
                  </div>
                  <h3>{quest.question}</h3>
                  <p className={styles.questReason}>{quest.reason}</p>
                  <small>Useful if · {quest.expectedValue}</small>
                  {quest.retryOf && <p className={styles.retryNote}>Prepared from an earlier failed attempt.</p>}

                  {quest.status === "candidate" && <button className={styles.fuel} disabled={busy === quest.id || !payload.enabled || (usage?.remainingRuns ?? 0) <= 0} onClick={() => runQuest(quest.id)}>{busy === quest.id ? `${museName} is thinking…` : payload.enabled ? `✦ Ask ${museName}` : "AI fuel locked"}</button>}
                  {quest.status === "running" && <p className={styles.running}>✦ {museName} is synthesizing the current evidence.</p>}
                  {quest.status === "failed" && <div className={styles.failureBox}>
                    <strong>This attempt did not complete.</strong>
                    <p>{quest.error || "The quest stopped before a synthesis was returned."}</p>
                    <div className={styles.reviewRow}>
                      <button className={styles.secondary} disabled={busy === `retry:${quest.id}` || busy === `delete:${quest.id}`} onClick={() => retryQuest(quest.id)}>{busy === `retry:${quest.id}` ? "Preparing retry…" : "Prepare retry"}</button>
                      <button className={styles.secondary} disabled={busy === `retry:${quest.id}` || busy === `delete:${quest.id}`} onClick={() => deleteQuest(quest.id)}>{busy === `delete:${quest.id}` ? "Deleting…" : "Delete failed attempt"}</button>
                    </div>
                  </div>}
                  {quest.answer && <div className={styles.synthesis}>
                    <div className={styles.synthesisHead}><span>✦</span><div><small>{museName} returned</small><strong>Muse synthesis</strong></div></div>
                    <MuseAnswer answer={quest.answer} />
                    {quest.usage && <div className={styles.usageLine}><span>{(quest.usage.totalTokens ?? 0).toLocaleString()} tokens</span><span>{modelLabel(quest.model ?? payload.model)}</span></div>}
                  </div>}
                </article>;
              })}
            </div>
          </section>

          <section className={styles.section}>
            <div className={styles.sectionHead}><div><p className={styles.kicker}>COUNCIL KNOWLEDGE</p><h2>What the Muses are allowed to remember</h2></div><small>{activeKnowledge.length} verified capsules</small></div>
            <p className={styles.explainer}>These are retrieval capsules, not model training. Only context you have verified can enter future powered quests.</p>
            <div className={styles.knowledgeGrid}>
              {activeKnowledge.map((entry) => <article key={entry.id} className={styles.knowledge}>
                <div className={styles.tags}><span>{entry.kind.replaceAll("_", " ")}</span>{entry.category && <span>{entry.category}</span>}<span>Artist verified</span></div>
                <h3>{entry.title}</h3><p>{entry.content}</p><small>{entry.sourceRef}</small>
              </article>)}
            </div>
            <details className={styles.importNote}><summary>How project knowledge enters Wizard OS</summary><p>A trusted bridge can send compact capsules into the Knowledge Inbox. Every external capsule arrives unverified. You decide what becomes active Council context.</p></details>
          </section>
        </>}
      </section>
    </main>
  );
}
