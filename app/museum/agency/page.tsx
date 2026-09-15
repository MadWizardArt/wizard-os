"use client";

import { useEffect, useMemo, useState } from "react";
import { MUSE_AGENT_CHARTERS, STAGE_THREE_POLICY } from "../../../lib/museum-agent-charters";
import { MUSE_BY_ID, MUSE_DIRECTORY } from "../../../lib/museum-directory";
import type { MuseId } from "../../../lib/museum";
import type { MuseOutcomeRating, StoredMuseMemory } from "../../../lib/museum-memory-storage";
import type { ProposalStatus, StoredMuseProposal } from "../../../lib/museum-proposal-storage";
import styles from "./stage-three.module.css";

type ProposalRecord = StoredMuseProposal & { id: string };
type MemoryRecord = StoredMuseMemory & { id: string };
type Decision = "approve" | "reject" | "complete";
type OutcomeDraft = { rating: MuseOutcomeRating | ""; note: string; actualValue: string };

const EMPTY_OUTCOME: OutcomeDraft = { rating: "", note: "", actualValue: "" };

function memoryDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Recently";
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(date);
}

export default function AgencyConsolePage() {
  const [selectedMuse, setSelectedMuse] = useState<MuseId>("callista");
  const [proposals, setProposals] = useState<ProposalRecord[]>([]);
  const [memories, setMemories] = useState<MemoryRecord[]>([]);
  const [status, setStatus] = useState<ProposalStatus | "all">("proposed");
  const [loading, setLoading] = useState(true);
  const [memoryLoading, setMemoryLoading] = useState(true);
  const [observing, setObserving] = useState(false);
  const [notice, setNotice] = useState("");
  const [decisionNote, setDecisionNote] = useState<Record<string, string>>({});
  const [outcomeDraft, setOutcomeDraft] = useState<Record<string, OutcomeDraft>>({});
  const [savingId, setSavingId] = useState<string | null>(null);

  const selected = MUSE_BY_ID[selectedMuse];
  const charter = MUSE_AGENT_CHARTERS[selectedMuse];

  const filtered = useMemo(() => {
    return proposals.filter((proposal) => status === "all" || proposal.status === status);
  }, [proposals, status]);

  const selectedMemories = useMemo(
    () => memories.filter((memory) => memory.museId === selectedMuse),
    [memories, selectedMuse],
  );
  const selectedOutcomes = useMemo(
    () => selectedMemories.filter((memory) => memory.kind === "outcome" && memory.outcomeRating),
    [selectedMemories],
  );
  const positiveOutcomes = selectedOutcomes.filter((memory) => memory.outcomeRating === "strong" || memory.outcomeRating === "useful").length;
  const weakOutcomes = selectedOutcomes.filter((memory) => memory.outcomeRating === "weak").length;
  const outcomeByProposal = useMemo(() => {
    const map = new Map<string, MemoryRecord>();
    for (const memory of memories) {
      if (memory.kind === "outcome" && memory.sourceProposalId && !map.has(memory.sourceProposalId)) map.set(memory.sourceProposalId, memory);
    }
    return map;
  }, [memories]);

  const loadProposals = async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/museum/proposals", { cache: "no-store" });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Proposal queue could not be read.");
      setProposals(Array.isArray(payload) ? payload : []);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Proposal queue could not be read.");
    } finally {
      setLoading(false);
    }
  };

  const loadMemories = async () => {
    setMemoryLoading(true);
    try {
      const response = await fetch("/api/museum/memory", { cache: "no-store" });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Muse memory could not be read.");
      setMemories(Array.isArray(payload) ? payload : []);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Muse memory could not be read.");
    } finally {
      setMemoryLoading(false);
    }
  };

  useEffect(() => {
    void loadProposals();
    void loadMemories();
  }, []);

  const observeNow = async () => {
    setObserving(true);
    try {
      const response = await fetch("/api/museum/observe", { method: "POST" });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "The Muses could not complete an observation pass.");
      await loadProposals();
      setStatus("proposed");
      setNotice(payload.created > 0
        ? `The Muses surfaced ${payload.created} new proposal${payload.created === 1 ? "" : "s"}. Nothing was committed.`
        : `Observation complete. ${payload.existing ?? 0} known opportunit${payload.existing === 1 ? "y was" : "ies were"} already in the council record; nothing was duplicated.`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "The Muses could not complete an observation pass.");
    } finally {
      setObserving(false);
    }
  };

  const decide = async (proposal: ProposalRecord, action: Decision) => {
    setSavingId(proposal.id);
    try {
      const response = await fetch("/api/museum/proposals", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: proposal.id,
          action,
          decisionNote: decisionNote[proposal.id] || null,
        }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Decision could not be saved.");
      setProposals((current) => current.map((item) => item.id === proposal.id ? payload : item));
      await loadMemories();
      setNotice(action === "approve"
        ? "Approved by the Artist and remembered. This is commitment, not proof of success."
        : action === "reject"
          ? "Declined and remembered as a decision only. No negative performance lesson was inferred."
          : "Execution marked complete. Record the result when you know whether it actually worked.");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Decision could not be saved.");
    } finally {
      setSavingId(null);
    }
  };

  const recordOutcome = async (proposal: ProposalRecord) => {
    const draft = outcomeDraft[proposal.id] ?? EMPTY_OUTCOME;
    if (!draft.rating) {
      setNotice("Choose an outcome rating before teaching the Muse from this result.");
      return;
    }
    setSavingId(proposal.id);
    try {
      const response = await fetch("/api/museum/memory", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          proposalId: proposal.id,
          outcomeRating: draft.rating,
          outcomeNote: draft.note || null,
          actualValue: draft.actualValue || null,
        }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Outcome could not be remembered.");
      await loadMemories();
      setOutcomeDraft((current) => ({ ...current, [proposal.id]: EMPTY_OUTCOME }));
      setNotice(`${MUSE_BY_ID[proposal.museId].name} has a verified outcome to learn from now.`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Outcome could not be remembered.");
    } finally {
      setSavingId(null);
    }
  };

  return (
    <main className={styles.page}>
      <section className={styles.shell}>
        <header className={styles.header}>
          <div>
            <p className={styles.kicker}>THE MUSEUM · STAGE III</p>
            <h1>Agency Console</h1>
            <p className={styles.lede}>Operators become agents by noticing, remembering, reasoning, creating, and proposing. The Artist still commits.</p>
          </div>
          <a className={styles.back} href="/museum">← Museum</a>
        </header>

        {notice && <button className={styles.notice} onClick={() => setNotice("")}>{notice}<span>×</span></button>}

        <section className={styles.policy}>
          <div>
            <p className={styles.kicker}>{STAGE_THREE_POLICY.name}</p>
            <h2>Financial flow in service of freer painting.</h2>
            <p>{STAGE_THREE_POLICY.objective}</p>
          </div>
          <div className={styles.rule}>
            <strong>Authority boundary</strong>
            <p>{STAGE_THREE_POLICY.authority}</p>
          </div>
          <div className={styles.loop} aria-label="Stage Three operating loop">
            {STAGE_THREE_POLICY.loop.map((step, index) => <span key={step}>{index + 1}. {step}</span>)}
          </div>
        </section>

        <section className={styles.rosterSection}>
          <div className={styles.sectionHeading}>
            <div><p className={styles.kicker}>AGENT CHARTERS</p><h2>Nine specialties. One economic objective.</h2></div>
            <small>Charters define initiative before autonomy.</small>
          </div>
          <div className={styles.roster}>
            {MUSE_DIRECTORY.map((muse) => (
              <button key={muse.id} className={selectedMuse === muse.id ? styles.selectedMuse : ""} onClick={() => setSelectedMuse(muse.id)}>
                <span>{muse.symbol}</span><strong>{muse.name}</strong><small>{muse.role}</small>
              </button>
            ))}
          </div>

          <article className={styles.charter} data-palette={selected.palette}>
            <div className={styles.charterTitle}>
              <div><p className={styles.kicker}>{selected.name.toUpperCase()} · AGENT CHARTER</p><h3>{charter.mission}</h3></div>
              <div className={styles.authority}>{charter.may.map((item) => <span key={item}>{item}</span>)}</div>
            </div>
            <div className={styles.charterGrid}>
              <div><strong>Economic objective</strong><p>{charter.economicObjective}</p></div>
              <div><strong>Creative objective</strong><p>{charter.creativeObjective}</p></div>
              <div><strong>Brandon retains</strong><p>{charter.commitRule}</p></div>
            </div>
            <div className={styles.charterLists}>
              <div><strong>Watches</strong>{charter.watches.map((item) => <span key={item}>{item}</span>)}</div>
              <div><strong>May propose</strong>{charter.proposes.map((item) => <span key={item}>{item}</span>)}</div>
              <div><strong>Measures</strong>{charter.kpis.map((item) => <span key={item}>{item}</span>)}</div>
            </div>
          </article>
        </section>

        <section className={styles.memorySection}>
          <div className={styles.sectionHeading}>
            <div><p className={styles.kicker}>STAGE III-C · MEMORY</p><h2>{selected.name}&apos;s Memory Ledger</h2></div>
            <small>Decisions are remembered. Only verified outcomes calibrate confidence.</small>
          </div>
          <div className={styles.memoryStats}>
            <article><strong>{selectedMemories.length}</strong><span>memories</span></article>
            <article><strong>{selectedOutcomes.length}</strong><span>verified outcomes</span></article>
            <article><strong>{positiveOutcomes}</strong><span>strong / useful</span></article>
            <article><strong>{weakOutcomes}</strong><span>weak outcomes</span></article>
          </div>
          {memoryLoading && <p className={styles.empty}>Reading Council memory…</p>}
          {!memoryLoading && selectedMemories.length === 0 && (
            <div className={styles.emptyState}><strong>No memories yet.</strong><p>{selected.name} will begin retaining your proposal decisions immediately. Performance learning starts only after you rate a completed outcome.</p></div>
          )}
          <div className={styles.memoryGrid}>
            {selectedMemories.slice(0, 6).map((memory) => (
              <article key={memory.id} className={styles.memoryCard}>
                <div><span>{memory.kind}</span><span>{memory.category}</span>{memory.outcomeRating && <span>{memory.outcomeRating}</span>}</div>
                <strong>{memory.title}</strong>
                <p>{memory.summary}</p>
                {memory.actualValue && <small>Actual value · {memory.actualValue}</small>}
                <time dateTime={memory.createdAt}>{memoryDate(memory.createdAt)}</time>
              </article>
            ))}
          </div>
        </section>

        <section className={styles.proposalSection}>
          <div className={styles.sectionHeading}>
            <div><p className={styles.kicker}>ARTIST GATE</p><h2>Proposal Queue</h2></div>
            <div className={styles.queueControls}>
              <button className={styles.observe} disabled={observing} onClick={observeNow}>{observing ? "Observing…" : "✦ Ask Muses to Observe"}</button>
              <div className={styles.filters}>
                {(["proposed", "approved", "completed", "rejected", "all"] as const).map((item) => (
                  <button key={item} className={status === item ? styles.activeFilter : ""} onClick={() => setStatus(item)}>{item}</button>
                ))}
              </div>
            </div>
          </div>

          {loading && <p className={styles.empty}>Reading Muse proposals…</p>}
          {!loading && filtered.length === 0 && <div className={styles.emptyState}><strong>No proposals in this view.</strong><p>The Muses inspect a bounded set of real operational signals and now bring relevant verified memory into future confidence judgments.</p></div>}

          <div className={styles.proposals}>
            {filtered.map((proposal) => {
              const muse = MUSE_BY_ID[proposal.museId];
              const busy = savingId === proposal.id;
              const rememberedOutcome = outcomeByProposal.get(proposal.id);
              const draft = outcomeDraft[proposal.id] ?? EMPTY_OUTCOME;
              return (
                <article key={proposal.id} className={styles.proposal}>
                  <div className={styles.proposalTop}>
                    <div><span className={styles.museTag}>{muse.symbol} {muse.name}</span><span className={styles.category}>{proposal.category}</span></div>
                    <span className={`${styles.status} ${styles[`status_${proposal.status}`]}`}>{proposal.status}</span>
                  </div>
                  <h3>{proposal.title}</h3>
                  <p>{proposal.summary}</p>
                  <div className={styles.meta}><span>Confidence · {proposal.confidence}</span><span>Effort · {proposal.effort}</span><span>Value · {proposal.expectedValue}</span></div>
                  <details><summary>Why this deserves attention</summary><p>{proposal.rationale}</p></details>
                  {proposal.decisionNote && <p className={styles.decisionNote}><strong>Artist note:</strong> {proposal.decisionNote}</p>}
                  {proposal.status === "proposed" && (
                    <div className={styles.decisionArea}>
                      <input value={decisionNote[proposal.id] || ""} onChange={(event) => setDecisionNote({ ...decisionNote, [proposal.id]: event.target.value })} placeholder="Optional note to the Muse" />
                      <div><button disabled={busy} className={styles.approve} onClick={() => decide(proposal, "approve")}>Approve</button><button disabled={busy} onClick={() => decide(proposal, "reject")}>Decline</button></div>
                    </div>
                  )}
                  {proposal.status === "approved" && <button disabled={busy} className={styles.complete} onClick={() => decide(proposal, "complete")}>Mark execution complete</button>}
                  {proposal.status === "completed" && rememberedOutcome && (
                    <div className={styles.rememberedOutcome}><strong>Learned outcome · {rememberedOutcome.outcomeRating}</strong><p>{rememberedOutcome.summary}</p>{rememberedOutcome.actualValue && <small>Actual value · {rememberedOutcome.actualValue}</small>}</div>
                  )}
                  {proposal.status === "completed" && !rememberedOutcome && (
                    <div className={styles.outcomeArea}>
                      <strong>Teach {muse.name} from the result</strong>
                      <div className={styles.outcomeFields}>
                        <select value={draft.rating} onChange={(event) => setOutcomeDraft({ ...outcomeDraft, [proposal.id]: { ...draft, rating: event.target.value as MuseOutcomeRating | "" } })} aria-label={`Outcome rating for ${proposal.title}`}>
                          <option value="">Outcome rating…</option>
                          <option value="strong">Strong</option>
                          <option value="useful">Useful</option>
                          <option value="neutral">Neutral</option>
                          <option value="weak">Weak</option>
                        </select>
                        <input value={draft.actualValue} onChange={(event) => setOutcomeDraft({ ...outcomeDraft, [proposal.id]: { ...draft, actualValue: event.target.value } })} placeholder="Actual value · optional" />
                      </div>
                      <textarea value={draft.note} onChange={(event) => setOutcomeDraft({ ...outcomeDraft, [proposal.id]: { ...draft, note: event.target.value } })} placeholder="What actually happened? Optional, but useful." />
                      <button disabled={busy} className={styles.rememberButton} onClick={() => recordOutcome(proposal)}>Remember outcome</button>
                    </div>
                  )}
                </article>
              );
            })}
          </div>
        </section>
      </section>
    </main>
  );
}
