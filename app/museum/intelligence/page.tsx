"use client";

import { useEffect, useMemo, useState } from "react";
import { MUSE_DIRECTORY } from "../../../lib/museum-directory";
import type { MuseId } from "../../../lib/museum";
import type { ProposalCategory } from "../../../lib/museum-proposal-storage";
import type { CouncilKnowledgeRecord } from "../../../lib/museum-knowledge";
import type { IntelligenceFuelUsage, IntelligenceQuestRecord } from "../../../lib/museum-intelligence";
import styles from "./selective-intelligence.module.css";

const CATEGORIES: ProposalCategory[] = ["revenue", "product", "content", "system", "risk", "research", "capacity", "experiment"];

type IntelligencePayload = { enabled: boolean; model: string; usage: IntelligenceFuelUsage | null; quests: IntelligenceQuestRecord[] };
type QuestDraft = { museId: MuseId; category: ProposalCategory; question: string; reason: string; expectedValue: string };
type ArtistSession = {
  configured: boolean;
  authenticated: boolean;
  fuelEnabled: boolean;
  knowledgeIntakeConfigured: boolean;
  model: string;
  budget: { maxRuns: number; dailyTokens: number; maxOutputTokens: number };
};

const EMPTY_QUEST: QuestDraft = {
  museId: "callista",
  category: "revenue",
  question: "",
  reason: "",
  expectedValue: "",
};

const EMPTY_PAYLOAD: IntelligencePayload = { enabled: false, model: "openai/gpt-5.6-sol", usage: null, quests: [] };

export default function SelectiveIntelligencePage() {
  const [session, setSession] = useState<ArtistSession | null>(null);
  const [accessKey, setAccessKey] = useState("");
  const [knowledge, setKnowledge] = useState<CouncilKnowledgeRecord[]>([]);
  const [payload, setPayload] = useState<IntelligencePayload>(EMPTY_PAYLOAD);
  const [draft, setDraft] = useState<QuestDraft>(EMPTY_QUEST);
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const loadProtected = async () => {
    setLoading(true);
    try {
      const [knowledgeResponse, intelligenceResponse] = await Promise.all([
        fetch("/api/museum/knowledge", { cache: "no-store" }),
        fetch("/api/museum/intelligence", { cache: "no-store" }),
      ]);
      const knowledgeJson = await knowledgeResponse.json();
      const intelligenceJson = await intelligenceResponse.json();
      if (knowledgeResponse.status === 401 || intelligenceResponse.status === 401) {
        setSession((current) => current ? { ...current, authenticated: false } : current);
        throw new Error("Artist session expired. Unlock Selective Intelligence again.");
      }
      if (!knowledgeResponse.ok) throw new Error(knowledgeJson.error || "Knowledge Vault could not be read.");
      if (!intelligenceResponse.ok) throw new Error(intelligenceJson.error || "Intelligence quests could not be read.");
      setKnowledge(Array.isArray(knowledgeJson) ? knowledgeJson : []);
      setPayload(intelligenceJson);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Selective Intelligence could not be loaded.");
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
      setNotice("Artist session authenticated. Paid Muse reasoning remains subject to the visible fuel budget.");
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
    setNotice("Artist session locked.");
  };

  const completed = useMemo(() => payload.quests.filter((quest) => quest.status === "completed"), [payload.quests]);
  const pendingKnowledge = useMemo(() => knowledge.filter((entry) => !entry.verifiedByArtist), [knowledge]);
  const activeKnowledge = useMemo(() => knowledge.filter((entry) => entry.verifiedByArtist), [knowledge]);
  const totalTokens = completed.reduce((sum, quest) => sum + (quest.usage?.totalTokens ?? 0), 0);

  const createQuest = async () => {
    setBusy("create");
    try {
      const response = await fetch("/api/museum/intelligence", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(draft),
      });
      const json = await response.json();
      if (!response.ok) throw new Error(json.error || "Quest could not be created.");
      setDraft(EMPTY_QUEST);
      setNotice("Intelligence Quest prepared. No model call has been made yet.");
      await loadProtected();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Quest could not be created.");
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
      if (!response.ok) throw new Error(json.error || "The quest could not be fueled.");
      setNotice("The Muse returned one bounded synthesis. Nothing was committed automatically.");
      await loadProtected();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "The quest could not be fueled.");
      await loadProtected();
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
        ? "Knowledge capsule verified by the Artist and admitted to future Muse retrieval."
        : "Knowledge capsule archived and excluded from Muse retrieval.");
      await loadProtected();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Knowledge review failed.");
    } finally {
      setBusy(null);
    }
  };

  const usage = payload.usage;
  const authenticated = Boolean(session?.authenticated);

  return (
    <main className={styles.page}>
      <section className={styles.shell}>
        <header className={styles.header}>
          <div>
            <p className={styles.kicker}>THE MUSEUM · STAGE III-E</p>
            <h1>Selective Intelligence</h1>
            <p>Deterministic systems do the gathering. A model is invited only for a bounded question that deserves deeper judgment, strategy, research, or invention.</p>
          </div>
          <div className={styles.links}><a href="/museum/cognition">Cognition</a><a href="/museum/agency">Agency</a><a href="/museum">Museum</a></div>
        </header>

        {notice && <button className={styles.notice} onClick={() => setNotice("")}>{notice}<span>×</span></button>}

        {!authenticated && (
          <section className={styles.artistGate}>
            <div>
              <p className={styles.kicker}>ARTIST GATE</p>
              <h2>{session?.configured ? "Unlock the intelligence chamber" : "Artist access awaits one-time configuration"}</h2>
              <p>{session?.configured
                ? "The Knowledge Vault and paid reasoning controls are private to your Artist session. The key is exchanged for a short-lived HttpOnly session cookie and is not stored in the page."
                : "Set MUSE_ARTIST_ACCESS_KEY to a private value of at least 16 characters in the Wizard OS production environment. AI fuel remains locked until Artist access is configured."}</p>
            </div>
            {session?.configured && <div className={styles.unlockRow}>
              <input type="password" value={accessKey} onChange={(event) => setAccessKey(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") void unlock(); }} placeholder="Artist access key" autoComplete="current-password" />
              <button className={styles.primary} disabled={busy === "unlock" || accessKey.length < 1} onClick={unlock}>{busy === "unlock" ? "Unlocking…" : "Unlock"}</button>
            </div>}
          </section>
        )}

        {authenticated && <>
          <div className={styles.sessionBar}><span>Artist session authenticated</span><button onClick={logout}>Lock</button></div>

          <section className={styles.stats}>
            <article><strong>{activeKnowledge.length}</strong><span>active knowledge</span></article>
            <article><strong>{pendingKnowledge.length}</strong><span>knowledge inbox</span></article>
            <article><strong>{payload.quests.filter((quest) => quest.status === "candidate").length}</strong><span>waiting quests</span></article>
            <article><strong>{totalTokens.toLocaleString()}</strong><span>recorded tokens total</span></article>
          </section>

          <section className={styles.guardrail}>
            <div><strong>AI fuel</strong><p>{payload.enabled ? `Armed · ${payload.model}` : "Locked. Quests may be prepared, but no model call can fire."}</p></div>
            <div><strong>Today&apos;s allowance</strong><p>{usage ? `${usage.completedRuns + usage.activeRuns}/${usage.maxRuns} runs · ${usage.usedTokens.toLocaleString()}/${usage.dailyTokens.toLocaleString()} recorded tokens` : "Reading budget…"}</p></div>
            <div><strong>Project knowledge bridge</strong><p>{session?.knowledgeIntakeConfigured ? "Intake key configured. Incoming Nine Muses capsules enter the Inbox inert until you verify them." : "Bridge endpoint installed; intake key is not configured yet."}</p></div>
          </section>

          {pendingKnowledge.length > 0 && <section className={styles.section}>
            <div className={styles.sectionHead}><div><p className={styles.kicker}>KNOWLEDGE INBOX</p><h2>Project context awaiting the Artist</h2></div><small>{pendingKnowledge.length} inert capsule{pendingKnowledge.length === 1 ? "" : "s"}</small></div>
            <p className={styles.explainer}>Inbox capsules are stored with provenance but cannot influence Intelligence Quests until you verify them.</p>
            <div className={styles.knowledgeGrid}>
              {pendingKnowledge.map((entry) => <article key={entry.id} className={`${styles.knowledge} ${styles.pendingKnowledge}`}>
                <div className={styles.tags}><span>awaiting Artist</span><span>{entry.kind.replaceAll("_", " ")}</span>{entry.category && <span>{entry.category}</span>}</div>
                <h3>{entry.title}</h3><p>{entry.content}</p><small>{entry.sourceRef}</small>
                <div className={styles.reviewRow}>
                  <button className={styles.primary} disabled={busy === `knowledge:${entry.id}`} onClick={() => reviewKnowledge(entry.id, "verify")}>Verify for Muses</button>
                  <button className={styles.secondary} disabled={busy === `knowledge:${entry.id}`} onClick={() => reviewKnowledge(entry.id, "archive")}>Archive</button>
                </div>
              </article>)}
            </div>
          </section>}

          <section className={styles.section}>
            <div className={styles.sectionHead}><div><p className={styles.kicker}>FETCH QUEST</p><h2>Prepare one question worth paying intelligence for</h2></div><small>No AI call on creation</small></div>
            <div className={styles.composer}>
              <div className={styles.twoCol}>
                <label>Accountable Muse<select value={draft.museId} onChange={(event) => setDraft({ ...draft, museId: event.target.value as MuseId })}>{MUSE_DIRECTORY.map((muse) => <option key={muse.id} value={muse.id}>{muse.name} · {muse.role}</option>)}</select></label>
                <label>Category<select value={draft.category} onChange={(event) => setDraft({ ...draft, category: event.target.value as ProposalCategory })}>{CATEGORIES.map((category) => <option key={category}>{category}</option>)}</select></label>
              </div>
              <label>Question<textarea value={draft.question} onChange={(event) => setDraft({ ...draft, question: event.target.value })} placeholder="What decision or creative problem genuinely deserves deeper synthesis?" /></label>
              <div className={styles.twoCol}>
                <label>Why AI is worth using<input value={draft.reason} onChange={(event) => setDraft({ ...draft, reason: event.target.value })} placeholder="Why deterministic rules are not enough" /></label>
                <label>Expected value<input value={draft.expectedValue} onChange={(event) => setDraft({ ...draft, expectedValue: event.target.value })} placeholder="What better decision could this unlock?" /></label>
              </div>
              <button className={styles.primary} disabled={busy === "create"} onClick={createQuest}>{busy === "create" ? "Preparing…" : "Prepare Intelligence Quest"}</button>
            </div>
          </section>

          <section className={styles.section}>
            <div className={styles.sectionHead}><div><p className={styles.kicker}>QUEST LOG</p><h2>Bounded model reasoning</h2></div><small>{payload.quests.length} total</small></div>
            {loading && <p className={styles.empty}>Reading the intelligence ledger…</p>}
            {!loading && payload.quests.length === 0 && <div className={styles.emptyBox}><strong>No quests yet.</strong><p>The Council can remain fully deterministic until a question is worth escalating.</p></div>}
            <div className={styles.questGrid}>
              {payload.quests.map((quest) => {
                const muse = MUSE_DIRECTORY.find((item) => item.id === quest.museId);
                return <article className={styles.quest} key={quest.id}>
                  <div className={styles.tags}><span>{muse?.name ?? quest.museId}</span><span>{quest.category}</span><span>{quest.status}</span></div>
                  <h3>{quest.question}</h3>
                  <p>{quest.reason}</p>
                  <small>Expected value · {quest.expectedValue}</small>
                  {quest.status === "candidate" && <button className={styles.fuel} disabled={busy === quest.id || !payload.enabled || (usage?.remainingRuns ?? 0) <= 0} onClick={() => runQuest(quest.id)}>{busy === quest.id ? "Fueling…" : payload.enabled ? "✦ Fuel this quest" : "AI fuel locked"}</button>}
                  {quest.status === "running" && <p className={styles.running}>The accountable Muse is synthesizing this quest now.</p>}
                  {quest.error && <p className={styles.error}>Quest failure · {quest.error}</p>}
                  {quest.answer && <details open><summary>Muse synthesis</summary><p className={styles.answer}>{quest.answer}</p>{quest.usage && <small>Usage · {quest.usage.inputTokens ?? "?"} in / {quest.usage.outputTokens ?? "?"} out / {quest.usage.totalTokens ?? "?"} total · {quest.model}</small>}</details>}
                </article>;
              })}
            </div>
          </section>

          <section className={styles.section}>
            <div className={styles.sectionHead}><div><p className={styles.kicker}>COUNCIL KNOWLEDGE VAULT</p><h2>Artist-verified context available to future quests</h2></div><small>{activeKnowledge.length} active capsules</small></div>
            <p className={styles.explainer}>These are retrieval capsules, not model-weight training. Only Artist-verified capsules can enter Muse reasoning.</p>
            <div className={styles.knowledgeGrid}>
              {activeKnowledge.map((entry) => <article key={entry.id} className={styles.knowledge}>
                <div className={styles.tags}><span>{entry.kind.replaceAll("_", " ")}</span>{entry.category && <span>{entry.category}</span>}<span>Artist verified</span></div>
                <h3>{entry.title}</h3><p>{entry.content}</p><small>{entry.sourceRef}</small>
              </article>)}
            </div>
            <details className={styles.importNote}><summary>How Nine Muses project knowledge enters Wizard OS</summary><p>A trusted intake endpoint accepts compact capsules from a future Project connector or other approved bridge. Every external capsule is forced into the Knowledge Inbox as unverified, even if the sender labels it as an Artist directive. You decide what becomes active Council memory.</p></details>
          </section>
        </>}
      </section>
    </main>
  );
}
