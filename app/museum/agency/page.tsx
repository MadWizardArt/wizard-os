"use client";

import { useEffect, useMemo, useState } from "react";
import { MUSE_AGENT_CHARTERS, STAGE_THREE_POLICY } from "../../../lib/museum-agent-charters";
import { MUSE_BY_ID, MUSE_DIRECTORY } from "../../../lib/museum-directory";
import type { MuseId } from "../../../lib/museum";
import type { ProposalStatus, StoredMuseProposal } from "../../../lib/museum-proposal-storage";
import styles from "./stage-three.module.css";

type ProposalRecord = StoredMuseProposal & { id: string };
type Decision = "approve" | "reject" | "complete";

export default function AgencyConsolePage() {
  const [selectedMuse, setSelectedMuse] = useState<MuseId>("callista");
  const [proposals, setProposals] = useState<ProposalRecord[]>([]);
  const [status, setStatus] = useState<ProposalStatus | "all">("proposed");
  const [loading, setLoading] = useState(true);
  const [observing, setObserving] = useState(false);
  const [notice, setNotice] = useState("");
  const [decisionNote, setDecisionNote] = useState<Record<string, string>>({});
  const [savingId, setSavingId] = useState<string | null>(null);

  const selected = MUSE_BY_ID[selectedMuse];
  const charter = MUSE_AGENT_CHARTERS[selectedMuse];

  const filtered = useMemo(() => {
    return proposals.filter((proposal) => status === "all" || proposal.status === status);
  }, [proposals, status]);

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

  useEffect(() => {
    void loadProposals();
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
      setNotice(action === "approve"
        ? "Approved by the Artist. The proposal is now eligible for routing, not automatic execution."
        : action === "reject"
          ? "Proposal declined and retained as learning history."
          : "Proposal marked complete and ready for outcome review.");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Decision could not be saved.");
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
            <p className={styles.lede}>Operators become agents by noticing, reasoning, creating, and proposing. The Artist still commits.</p>
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
          {!loading && filtered.length === 0 && <div className={styles.emptyState}><strong>No proposals in this view.</strong><p>The Muses now know how to inspect a bounded set of real operational signals. Run an observation pass when you want them to surface anything that currently deserves your attention.</p></div>}

          <div className={styles.proposals}>
            {filtered.map((proposal) => {
              const muse = MUSE_BY_ID[proposal.museId];
              const busy = savingId === proposal.id;
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
                </article>
              );
            })}
          </div>
        </section>
      </section>
    </main>
  );
}
