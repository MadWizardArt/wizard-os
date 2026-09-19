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

type ArtistRelationshipContract = {
  version: 1;
  authority: string;
  challengeDoctrine: string[];
  continuationDoctrine: string[];
  handoffDoctrine: string[];
  trustRules: string[];
};

type MindContinuityPayload = {
  museId: MuseId;
  workingStates: Array<{ id: string; state: MindWorkingState }>;
  durableMemories: Array<{ id: string; memory: MindMemory }>;
  relationship: ArtistRelationshipContract | null;
};

type CounterweightPacketRecord = {
  id: string;
  version: 1;
  primaryMuseId: MuseId;
  counterweightMuseId: MuseId;
  category: ProposalCategory;
  question: string;
  primaryPosition: string;
  trigger: string;
  relationship: string;
  status: "draft" | "counterweight-ready" | "synthesis-ready" | "complete";
  counterweightQuestId: string | null;
  synthesisQuestId: string | null;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
};

type CounterweightDraft = {
  primaryMuseId: "novy" | "thalia";
  category: ProposalCategory;
  question: string;
  primaryPosition: string;
  trigger: string;
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

const EMPTY_COUNTERWEIGHT: CounterweightDraft = {
  primaryMuseId: "novy",
  category: "system",
  question: "",
  primaryPosition: "",
  trigger: "",
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
  const [counterweights, setCounterweights] = useState<CounterweightPacketRecord[]>([]);
  const [counterweightDraft, setCounterweightDraft] = useState<CounterweightDraft>(EMPTY_COUNTERWEIGHT);
  const [lessonDrafts, setLessonDrafts] = useState<Record<string, string>>({});
  const [draft, setDraft] = useState<QuestDraft>(EMPTY_QUEST);
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [boardFilter, setBoardFilter] = useState<"all" | "action" | "quests" | "packets" | "mind" | "knowledge">("all");

  const loadProtected = async () => {
    setLoading(true);
    try {
      const [knowledgeResponse, intelligenceResponse, mindResponse, counterweightResponse] = await Promise.all([
        fetch("/api/museum/knowledge", { cache: "no-store" }),
        fetch("/api/museum/intelligence", { cache: "no-store" }),
        fetch("/api/museum/mind-state?muse=novy", { cache: "no-store" }),
        fetch("/api/museum/counterweight", { cache: "no-store" }),
      ]);
      const knowledgeJson = await knowledgeResponse.json();
      const intelligenceJson = await intelligenceResponse.json();
      const mindJson = await mindResponse.json();
      const counterweightJson = await counterweightResponse.json();
      if (knowledgeResponse.status === 401 || intelligenceResponse.status === 401 || mindResponse.status === 401 || counterweightResponse.status === 401) {
        setSession((current) => current ? { ...current, authenticated: false } : current);
        throw new Error("Artist session expired. Unlock the chamber again.");
      }
      if (!knowledgeResponse.ok) throw new Error(knowledgeJson.error || "Council knowledge could not be read.");
      if (!intelligenceResponse.ok) throw new Error(intelligenceJson.error || "Intelligence quests could not be read.");
      if (!mindResponse.ok) throw new Error(mindJson.error || "Novy continuity could not be read.");
      if (!counterweightResponse.ok) throw new Error(counterweightJson.error || "Counterweight packets could not be read.");
      setKnowledge(Array.isArray(knowledgeJson) ? knowledgeJson : []);
      setPayload(intelligenceJson);
      setMind(mindJson);
      setCounterweights(Array.isArray(counterweightJson) ? counterweightJson : []);
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
    setCounterweights([]);
    setCounterweightDraft(EMPTY_COUNTERWEIGHT);
    setLessonDrafts({});
    setNotice("Intelligence Chamber locked.");
  };

  const completed = useMemo(() => payload.quests.filter((quest) => quest.status === "completed"), [payload.quests]);
  const pendingKnowledge = useMemo(() => knowledge.filter((entry) => !entry.verifiedByArtist), [knowledge]);
  const activeKnowledge = useMemo(() => knowledge.filter((entry) => entry.verifiedByArtist), [knowledge]);
  const totalTokens = completed.reduce((sum, quest) => sum + (quest.usage?.totalTokens ?? 0), 0);
  const questById = useMemo(() => new Map(payload.quests.map((quest) => [quest.id, quest])), [payload.quests]);
  const counterweightPartner: "novy" | "thalia" = counterweightDraft.primaryMuseId === "novy" ? "thalia" : "novy";

  const createCounterweight = async () => {
    if (!counterweightDraft.question.trim() || !counterweightDraft.primaryPosition.trim() || !counterweightDraft.trigger.trim()) {
      setNotice("Counterweight packets need a question, primary position, and canonical trigger.");
      return;
    }
    setBusy("counterweight:create");
    try {
      const response = await fetch("/api/museum/counterweight", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...counterweightDraft,
          counterweightMuseId: counterweightPartner,
        }),
      });
      const json = await response.json();
      if (!response.ok) throw new Error(json.error || "Counterweight packet could not be created.");
      setCounterweightDraft((current) => ({ ...EMPTY_COUNTERWEIGHT, primaryMuseId: current.primaryMuseId, category: current.category }));
      setNotice("Counterweight packet prepared. No AI credits have been spent.");
      await loadProtected();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Counterweight packet could not be created.");
    } finally {
      setBusy(null);
    }
  };

  const advanceCounterweight = async (id: string, action: "prepare-counterweight" | "prepare-synthesis" | "complete") => {
    setBusy(`counterweight:${id}:${action}`);
    try {
      const response = await fetch("/api/museum/counterweight", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, action }),
      });
      const json = await response.json();
      if (!response.ok) throw new Error(json.error || "Counterweight packet could not advance.");
      setNotice(
        action === "prepare-counterweight"
          ? "Counterweight quest prepared. Fueling it remains your explicit choice."
          : action === "prepare-synthesis"
            ? "Accountable synthesis quest prepared. Fueling it remains your explicit choice."
            : "Counterweight packet complete. Both reasoning lines remain preserved in the quest ledger.",
      );
      await loadProtected();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Counterweight packet could not advance.");
    } finally {
      setBusy(null);
    }
  };

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

  const readyQuestCount = payload.quests.filter((quest) => quest.status === "candidate").length;
  const failedQuestCount = payload.quests.filter((quest) => quest.status === "failed").length;
  const openPacketCount = counterweights.filter((packet) => packet.status !== "complete").length;
  const openMindCount = mind?.workingStates.filter(({ state }) => ["active", "waiting", "blocked"].includes(state.status)).length ?? 0;
  const actionCount = readyQuestCount + failedQuestCount + openPacketCount + openMindCount + pendingKnowledge.length;
  const filterAllows = (kind: "quests" | "packets" | "mind" | "knowledge", actionable = false) =>
    boardFilter === "all" || boardFilter === kind || (boardFilter === "action" && actionable);

  return (
    <main className={styles.page}>
      <section className={styles.shell}>
        <header className={styles.header}>
          <div>
            <p className={styles.kicker}>THE MUSEUM · INTELLIGENCE CHAMBER</p>
            <h1>Selective Intelligence</h1>
            <p>A compact Council board. Open only the thread you need; completed work stays available without filling the room.</p>
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

          <section className={styles.boardStatus}>
            <div><span className={styles.statusLabel}>Council</span><strong>{councilReady ? "Ready" : "Attention"}</strong></div>
            <div><span className={styles.statusLabel}>Model</span><strong>{modelLabel(payload.model)}</strong></div>
            <div><span className={styles.statusLabel}>Runs</span><strong>{poweredToday}/{usage?.maxRuns ?? session?.budget.maxRuns ?? 0}</strong></div>
            <div><span className={styles.statusLabel}>Tokens</span><strong>{usage ? `${usage.usedTokens.toLocaleString()} / ${usage.dailyTokens.toLocaleString()}` : "—"}</strong></div>
            <div><span className={styles.statusLabel}>Gateway</span><strong>{gatewayBalance}</strong></div>
          </section>

          <div className={styles.quickActions}>
            <details className={styles.newThread}>
              <summary><span>＋</span> New quest</summary>
              <div className={styles.threadComposer}>
                <div className={styles.twoCol}>
                  <label>Muse<select value={draft.museId} onChange={(event) => setDraft({ ...draft, museId: event.target.value as MuseId })}>{MUSE_DIRECTORY.map((muse) => <option key={muse.id} value={muse.id}>{muse.name}</option>)}</select></label>
                  <label>Domain<select value={draft.category} onChange={(event) => setDraft({ ...draft, category: event.target.value as ProposalCategory })}>{CATEGORIES.map((category) => <option key={category}>{category}</option>)}</select></label>
                </div>
                <label>Quest brief<textarea value={draft.brief} onChange={(event) => setDraft({ ...draft, brief: event.target.value })} onKeyDown={(event) => { if ((event.metaKey || event.ctrlKey) && event.key === "Enter") void createQuest(); }} placeholder="Paste the question or request." /></label>
                <button className={styles.primary} disabled={busy === "create" || !draft.brief.trim()} onClick={createQuest}>{busy === "create" ? "Preparing…" : "Prepare quest"}</button>
              </div>
            </details>

            <details className={styles.newThread}>
              <summary><span>⇄</span> New counterweight</summary>
              <div className={styles.threadComposer}>
                <div className={styles.twoCol}>
                  <label>Primary Muse<select value={counterweightDraft.primaryMuseId} onChange={(event) => setCounterweightDraft({ ...counterweightDraft, primaryMuseId: event.target.value as "novy" | "thalia" })}><option value="novy">Novy · Systems Architect</option><option value="thalia">Thalia · Creative Provocateur</option></select></label>
                  <label>Counterweight<input value={counterweightPartner === "novy" ? "Novy · Systems Architect" : "Thalia · Creative Provocateur"} readOnly /></label>
                </div>
                <label>Domain<select value={counterweightDraft.category} onChange={(event) => setCounterweightDraft({ ...counterweightDraft, category: event.target.value as ProposalCategory })}>{CATEGORIES.map((category) => <option key={category}>{category}</option>)}</select></label>
                <label>Decision question<textarea value={counterweightDraft.question} onChange={(event) => setCounterweightDraft({ ...counterweightDraft, question: event.target.value })} placeholder="What decision should the pair examine?" /></label>
                <label>Primary position<textarea value={counterweightDraft.primaryPosition} onChange={(event) => setCounterweightDraft({ ...counterweightDraft, primaryPosition: event.target.value })} placeholder="Preserve the primary Muse's position." /></label>
                <label>Trigger<textarea value={counterweightDraft.trigger} onChange={(event) => setCounterweightDraft({ ...counterweightDraft, trigger: event.target.value })} placeholder="Why is the counterweight materially relevant?" /></label>
                <button className={styles.primary} disabled={busy === "counterweight:create" || !counterweightDraft.question.trim() || !counterweightDraft.primaryPosition.trim() || !counterweightDraft.trigger.trim()} onClick={createCounterweight}>{busy === "counterweight:create" ? "Preparing…" : "Create packet"}</button>
              </div>
            </details>
          </div>

          <section className={styles.board}>
            <div className={styles.boardHead}><div><p className={styles.kicker}>COUNCIL BOARD</p><h2>Threads</h2></div><span>{actionCount} need attention</span></div>
            <nav className={styles.boardFilters} aria-label="Council board filters">
              {([
                ["all", "All"],
                ["action", `Action · ${actionCount}`],
                ["quests", `Quests · ${payload.quests.length}`],
                ["packets", `Packets · ${counterweights.length}`],
                ["mind", `Mind · ${(mind?.workingStates.length ?? 0) + (mind?.durableMemories.length ?? 0)}`],
                ["knowledge", `Knowledge · ${knowledge.length}`],
              ] as const).map(([value, label]) => <button key={value} className={boardFilter === value ? styles.filterActive : ""} onClick={() => setBoardFilter(value)}>{label}</button>)}
            </nav>

            <div className={styles.threadList}>
              {mind?.relationship && boardFilter !== "action" && (boardFilter === "all" || boardFilter === "mind") && <details className={styles.threadRow}>
                <summary><span className={styles.threadVote}>◆</span><span className={styles.threadMain}><strong>Artist Relationship V{mind.relationship.version}</strong><small>Novy · canonical working contract</small></span><span className={styles.threadMeta}>pinned</span></summary>
                <div className={styles.threadBody}>
                  <p>{mind.relationship.authority}</p>
                  <div className={styles.compactGrid}>
                    <div><strong>Challenge</strong>{mind.relationship.challengeDoctrine.map((item) => <p key={item}>{item}</p>)}</div>
                    <div><strong>Continue</strong>{mind.relationship.continuationDoctrine.map((item) => <p key={item}>{item}</p>)}</div>
                    <div><strong>Handoff</strong>{mind.relationship.handoffDoctrine.map((item) => <p key={item}>{item}</p>)}</div>
                    <div><strong>Trust</strong>{mind.relationship.trustRules.map((item) => <p key={item}>{item}</p>)}</div>
                  </div>
                </div>
              </details>}

              {counterweights.map((packet) => {
                const actionable = packet.status !== "complete";
                if (!filterAllows("packets", actionable)) return null;
                const primary = MUSE_DIRECTORY.find((item) => item.id === packet.primaryMuseId)?.name ?? packet.primaryMuseId;
                const counterweight = MUSE_DIRECTORY.find((item) => item.id === packet.counterweightMuseId)?.name ?? packet.counterweightMuseId;
                const counterQuest = packet.counterweightQuestId ? questById.get(packet.counterweightQuestId) : null;
                const synthesisQuest = packet.synthesisQuestId ? questById.get(packet.synthesisQuestId) : null;
                return <details className={`${styles.threadRow} ${actionable ? styles.threadAction : ""}`} key={packet.id}>
                  <summary><span className={styles.threadVote}>⇄</span><span className={styles.threadMain}><strong>{packet.question}</strong><small>Counterweight · {primary} → {counterweight} · {packet.category}</small></span><span className={styles.threadMeta}>{packet.status.replaceAll("-", " ")}</span></summary>
                  <div className={styles.threadBody}>
                    <p className={styles.threadLead}>{packet.relationship}</p>
                    <div className={styles.compactPair}><div><strong>Primary position</strong><p>{packet.primaryPosition}</p></div><div><strong>Trigger</strong><p>{packet.trigger}</p></div></div>
                    <div className={styles.miniSteps}><span className={packet.counterweightQuestId ? styles.done : ""}>1 · challenge {counterQuest ? questStatus(counterQuest.status) : ""}</span><span className={packet.synthesisQuestId ? styles.done : ""}>2 · synthesis {synthesisQuest ? questStatus(synthesisQuest.status) : ""}</span><span className={packet.status === "complete" ? styles.done : ""}>3 · close</span></div>
                    <div className={styles.threadActions}>
                      {packet.status === "draft" && <button className={styles.secondary} disabled={busy === `counterweight:${packet.id}:prepare-counterweight`} onClick={() => advanceCounterweight(packet.id, "prepare-counterweight")}>Prepare counterweight quest</button>}
                      {packet.status === "counterweight-ready" && counterQuest?.status === "completed" && <button className={styles.secondary} disabled={busy === `counterweight:${packet.id}:prepare-synthesis`} onClick={() => advanceCounterweight(packet.id, "prepare-synthesis")}>Prepare synthesis</button>}
                      {packet.status === "counterweight-ready" && counterQuest?.status !== "completed" && <span>Fuel {counterweight} in the quest thread.</span>}
                      {packet.status === "synthesis-ready" && synthesisQuest?.status === "completed" && <button className={styles.primary} disabled={busy === `counterweight:${packet.id}:complete`} onClick={() => advanceCounterweight(packet.id, "complete")}>Close packet</button>}
                      {packet.status === "synthesis-ready" && synthesisQuest?.status !== "completed" && <span>Fuel {primary} in the quest thread.</span>}
                      {packet.status === "complete" && <span>Complete · both reasoning records preserved</span>}
                    </div>
                  </div>
                </details>;
              })}

              {payload.quests.map((quest) => {
                const actionable = ["candidate", "running", "failed"].includes(quest.status);
                if (!filterAllows("quests", actionable)) return null;
                const museName = MUSE_DIRECTORY.find((item) => item.id === quest.museId)?.name ?? quest.museId;
                const preview = quest.answer ? cleanMarkdown(quest.answer.split("\n").find((line) => line.trim()) || quest.reason) : quest.reason;
                return <details className={`${styles.threadRow} ${actionable ? styles.threadAction : ""}`} key={quest.id}>
                  <summary><span className={styles.threadVote}>✦</span><span className={styles.threadMain}><strong>{quest.question}</strong><small>{museName} · {quest.category} · {preview.slice(0, 150)}</small></span><span className={`${styles.threadMeta} ${styles[`status_${quest.status}`]}`}>{questStatus(quest.status)}</span></summary>
                  <div className={styles.threadBody}>
                    <p><strong>Why</strong> · {quest.reason}</p>
                    <p><strong>Useful if</strong> · {quest.expectedValue}</p>
                    {quest.retryOf && <p className={styles.retryNote}>Prepared from an earlier failed attempt.</p>}
                    {quest.status === "candidate" && <button className={styles.fuel} disabled={busy === quest.id || !payload.enabled || (usage?.remainingRuns ?? 0) <= 0} onClick={() => runQuest(quest.id)}>{busy === quest.id ? `${museName} is thinking…` : payload.enabled ? `✦ Ask ${museName}` : "AI fuel locked"}</button>}
                    {quest.status === "running" && <p className={styles.running}>✦ {museName} is synthesizing the current evidence.</p>}
                    {quest.status === "failed" && <div className={styles.failureBox}><strong>This attempt did not complete.</strong><p>{quest.error || "The quest stopped before a synthesis was returned."}</p><div className={styles.reviewRow}><button className={styles.secondary} disabled={busy === `retry:${quest.id}` || busy === `delete:${quest.id}`} onClick={() => retryQuest(quest.id)}>Prepare retry</button><button className={styles.secondary} disabled={busy === `retry:${quest.id}` || busy === `delete:${quest.id}`} onClick={() => deleteQuest(quest.id)}>Delete failed attempt</button></div></div>}
                    {quest.answer && <div className={styles.synthesis}><div className={styles.synthesisHead}><span>✦</span><div><small>{museName} returned</small><strong>Muse synthesis</strong></div></div><MuseAnswer answer={quest.answer} />{quest.usage && <div className={styles.usageLine}><span>{(quest.usage.totalTokens ?? 0).toLocaleString()} tokens</span><span>{modelLabel(quest.model ?? payload.model)}</span></div>}</div>}
                  </div>
                </details>;
              })}

              {mind?.workingStates.map((record) => {
                const state = record.state;
                const actionable = ["active", "waiting", "blocked"].includes(state.status) || (state.status === "complete" && state.verificationStatus === "unverified");
                if (!filterAllows("mind", actionable)) return null;
                const verified = state.verificationStatus !== "unverified";
                const canGraduate = state.status === "complete" && verified && !state.graduatedMemoryId;
                return <details className={`${styles.threadRow} ${actionable ? styles.threadAction : ""}`} key={record.id}>
                  <summary><span className={styles.threadVote}>◎</span><span className={styles.threadMain}><strong>{state.objective}</strong><small>Working state · {state.category} · {state.nextAction || "No next action"}</small></span><span className={styles.threadMeta}>{state.status}</span></summary>
                  <div className={styles.threadBody}>
                    <p><strong>Complete when</strong> · {state.completionCondition}</p>
                    {state.notes && <p>{state.notes}</p>}
                    <details className={styles.nestedDetails}><summary>Evidence · {state.evidenceRefs.length}</summary>{state.evidenceRefs.length ? <ul>{state.evidenceRefs.map((ref) => <li key={ref}>{ref}</li>)}</ul> : <p>No evidence recorded.</p>}</details>
                    {state.graduatedMemoryId && <p className={styles.graduated}>Graduated → {state.graduatedMemoryId}</p>}
                    {!state.graduatedMemoryId && <div className={styles.threadActions}>
                      {["active", "waiting", "blocked"].includes(state.status) && <button className={styles.secondary} disabled={busy === `mind-status:${record.id}`} onClick={() => updateMindStatus(record, "complete")}>Mark complete</button>}
                      {state.status === "complete" && !verified && <button className={styles.primary} disabled={busy === `mind-verify:${record.id}` || state.evidenceRefs.length === 0} onClick={() => verifyMindState(record)}>Verify evidence</button>}
                      {canGraduate && <><textarea className={styles.lessonDraft} value={lessonDrafts[record.id] || ""} onChange={(event) => setLessonDrafts((current) => ({ ...current, [record.id]: event.target.value }))} placeholder="Durable lesson worth carrying forward." /><button className={styles.primary} disabled={busy === `mind-graduate:${record.id}` || !(lessonDrafts[record.id] || "").trim()} onClick={() => graduateMindState(record)}>Graduate lesson</button></>}
                    </div>}
                  </div>
                </details>;
              })}

              {mind?.durableMemories.map(({ id, memory }) => {
                if (!filterAllows("mind", false)) return null;
                return <details className={styles.threadRow} key={id}>
                  <summary><span className={styles.threadVote}>◇</span><span className={styles.threadMain}><strong>{memory.title}</strong><small>Durable memory · {memory.kind} · {memory.category}</small></span><span className={styles.threadMeta}>verified</span></summary>
                  <div className={styles.threadBody}><p>{memory.summary}</p><small>{new Date(memory.createdAt).toLocaleString()} · verified by {memory.verifiedBy}</small></div>
                </details>;
              })}

              {knowledge.map((entry) => {
                const actionable = !entry.verifiedByArtist;
                if (!filterAllows("knowledge", actionable)) return null;
                return <details className={`${styles.threadRow} ${actionable ? styles.threadAction : ""}`} key={entry.id}>
                  <summary><span className={styles.threadVote}>▤</span><span className={styles.threadMain}><strong>{entry.title}</strong><small>Knowledge · {entry.kind.replaceAll("_", " ")}{entry.category ? ` · ${entry.category}` : ""} · {entry.content.slice(0, 140)}</small></span><span className={styles.threadMeta}>{entry.verifiedByArtist ? "verified" : "review"}</span></summary>
                  <div className={styles.threadBody}><p>{entry.content}</p><small>{entry.sourceRef}</small>{!entry.verifiedByArtist && <div className={styles.threadActions}><button className={styles.primary} disabled={busy === `knowledge:${entry.id}`} onClick={() => reviewKnowledge(entry.id, "verify")}>Verify</button><button className={styles.secondary} disabled={busy === `knowledge:${entry.id}`} onClick={() => reviewKnowledge(entry.id, "archive")}>Archive</button></div>}</div>
                </details>;
              })}

              {!loading && actionCount === 0 && boardFilter === "action" && <div className={styles.emptyBoard}>Nothing needs attention.</div>}
              {loading && <div className={styles.emptyBoard}>Reading the Council ledger…</div>}
            </div>
          </section>
        </>}
      </section>
    </main>
  );
}
