"use client";

import { useEffect, useMemo, useState } from "react";
import { MUSE_DIRECTORY } from "../../../lib/museum-directory";
import type { MuseId } from "../../../lib/museum";
import type { ProposalCategory } from "../../../lib/museum-proposal-storage";
import type { CouncilKnowledgeRecord, KnowledgeKind } from "../../../lib/museum-knowledge";
import type { IntelligenceQuestRecord } from "../../../lib/museum-intelligence";
import styles from "./selective-intelligence.module.css";

const CATEGORIES: ProposalCategory[] = ["revenue", "product", "content", "system", "risk", "research", "capacity", "experiment"];

type IntelligencePayload = { enabled: boolean; model: string; quests: IntelligenceQuestRecord[] };
type QuestDraft = { museId: MuseId; category: ProposalCategory; question: string; reason: string; expectedValue: string };

const EMPTY_QUEST: QuestDraft = {
  museId: "callista",
  category: "revenue",
  question: "",
  reason: "",
  expectedValue: "",
};

export default function SelectiveIntelligencePage() {
  const [knowledge, setKnowledge] = useState<CouncilKnowledgeRecord[]>([]);
  const [payload, setPayload] = useState<IntelligencePayload>({ enabled: false, model: "openai/gpt-5.6-sol", quests: [] });
  const [draft, setDraft] = useState<QuestDraft>(EMPTY_QUEST);
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const [knowledgeResponse, intelligenceResponse] = await Promise.all([
        fetch("/api/museum/knowledge", { cache: "no-store" }),
        fetch("/api/museum/intelligence", { cache: "no-store" }),
      ]);
      const knowledgeJson = await knowledgeResponse.json();
      const intelligenceJson = await intelligenceResponse.json();
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

  useEffect(() => { void load(); }, []);

  const completed = useMemo(() => payload.quests.filter((quest) => quest.status === "completed"), [payload.quests]);
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
      await load();
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
      await load();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "The quest could not be fueled.");
    } finally {
      setBusy(null);
    }
  };

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

        <section className={styles.stats}>
          <article><strong>{knowledge.length}</strong><span>knowledge capsules</span></article>
          <article><strong>{payload.quests.filter((quest) => quest.status === "candidate").length}</strong><span>waiting quests</span></article>
          <article><strong>{completed.length}</strong><span>completed syntheses</span></article>
          <article><strong>{totalTokens.toLocaleString()}</strong><span>recorded tokens</span></article>
        </section>

        <section className={styles.guardrail}>
          <div><strong>AI fuel</strong><p>{payload.enabled ? `Unlocked · ${payload.model}` : "Locked by default. Preparing a quest costs no model tokens."}</p></div>
          <div><strong>Artist Gate</strong><p>Only pressing <em>Fuel this quest</em> requests model reasoning. The answer returns as advice, never as an automatic business action.</p></div>
          <div><strong>Context discipline</strong><p>Each quest receives only relevant Knowledge Vault entries, routed Muse evidence, and qualified Council patterns.</p></div>
        </section>

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
                {quest.status === "candidate" && <button className={styles.fuel} disabled={busy === quest.id} onClick={() => runQuest(quest.id)}>{busy === quest.id ? "Fueling…" : "✦ Fuel this quest"}</button>}
                {quest.answer && <details open><summary>Muse synthesis</summary><p className={styles.answer}>{quest.answer}</p>{quest.usage && <small>Usage · {quest.usage.inputTokens ?? "?"} in / {quest.usage.outputTokens ?? "?"} out / {quest.usage.totalTokens ?? "?"} total · {quest.model}</small>}</details>}
              </article>;
            })}
          </div>
        </section>

        <section className={styles.section}>
          <div className={styles.sectionHead}><div><p className={styles.kicker}>COUNCIL KNOWLEDGE VAULT</p><h2>Project knowledge available to future quests</h2></div><small>Seeded from the canonical Nine Muses reference</small></div>
          <p className={styles.explainer}>These are retrieval capsules, not model-weight training. Future project decisions can be distilled into additional capsules with provenance instead of dumping whole conversations into every prompt.</p>
          <div className={styles.knowledgeGrid}>
            {knowledge.map((entry) => <article key={entry.id} className={styles.knowledge}>
              <div className={styles.tags}><span>{entry.kind.replaceAll("_", " ")}</span>{entry.category && <span>{entry.category}</span>}{entry.verifiedByArtist && <span>Artist verified</span>}</div>
              <h3>{entry.title}</h3><p>{entry.content}</p><small>{entry.sourceRef}</small>
            </article>)}
          </div>
          <details className={styles.importNote}><summary>How Nine Muses project knowledge enters Wizard OS</summary><p>Use a curated knowledge capsule: title, concise fact or directive, source reference, relevant Muse/category, and verification state. This keeps the Vault useful and auditable. Direct automatic access from an external Wizard OS deployment into a ChatGPT Project is not assumed.</p></details>
        </section>
      </section>
    </main>
  );
}
