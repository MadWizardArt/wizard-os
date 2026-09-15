"use client";

import { useEffect, useState } from "react";
import { MUSE_BY_ID, MUSE_DIRECTORY } from "../../../lib/museum-directory";
import type { MuseId } from "../../../lib/museum";
import type { CouncilPattern, SharedMemorySignal } from "../../../lib/museum-agent-cognition";
import styles from "./shared-cognition.module.css";

type CognitionPayload = {
  targetMuseId: MuseId;
  routedMemories: SharedMemorySignal[];
  patterns: CouncilPattern[];
};

export default function SharedCognitionPage() {
  const [selectedMuse, setSelectedMuse] = useState<MuseId>("callista");
  const [data, setData] = useState<CognitionPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    fetch(`/api/museum/cognition?muse=${selectedMuse}`, { cache: "no-store" })
      .then(async (response) => {
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error || "Shared Council cognition could not be read.");
        if (active) setData(payload);
      })
      .catch((reason) => {
        if (active) setError(reason instanceof Error ? reason.message : "Shared Council cognition could not be read.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, [selectedMuse]);

  const selected = MUSE_BY_ID[selectedMuse];

  return (
    <main className={styles.page}>
      <section className={styles.shell}>
        <header className={styles.header}>
          <div>
            <p className={styles.kicker}>THE MUSEUM · STAGE III-D</p>
            <h1>Shared Council Cognition</h1>
            <p>Relevant verified experience may cross Muse boundaries. Evidence is routed selectively; nothing is duplicated, committed, or executed here.</p>
          </div>
          <div className={styles.links}><a href="/museum/intelligence">Intelligence</a><a href="/museum/agency">Agency</a><a href="/museum">Museum</a></div>
        </header>

        <section className={styles.principle}>
          <div><strong>Selective sharing</strong><p>Only outcome and lesson memories relevant to another Muse&apos;s portfolio are routed to her.</p></div>
          <div><strong>Provenance preserved</strong><p>Every shared memory still belongs to the Muse who produced the original recommendation and outcome.</p></div>
          <div><strong>No groupthink</strong><p>Shared evidence can inform rationale, but it does not currently alter another Muse&apos;s confidence score.</p></div>
        </section>

        <nav className={styles.roster} aria-label="Choose a Muse">
          {MUSE_DIRECTORY.map((muse) => (
            <button key={muse.id} className={selectedMuse === muse.id ? styles.active : ""} onClick={() => setSelectedMuse(muse.id)}>
              <span>{muse.symbol}</span><strong>{muse.name}</strong><small>{muse.role}</small>
            </button>
          ))}
        </nav>

        <section className={styles.section}>
          <div className={styles.sectionHead}>
            <div><p className={styles.kicker}>ROUTED EVIDENCE</p><h2>What the Council currently shares with {selected.name}</h2></div>
            <small>{data?.routedMemories.length ?? 0} relevant memories</small>
          </div>
          {loading && <p className={styles.empty}>Reading shared Council memory…</p>}
          {error && <p className={styles.error}>{error}</p>}
          {!loading && !error && data?.routedMemories.length === 0 && (
            <div className={styles.emptyBox}><strong>No cross-Muse evidence yet.</strong><p>This is expected while Stage III-C is young. Verified outcomes will begin appearing here only when they are relevant to {selected.name}&apos;s portfolio.</p></div>
          )}
          <div className={styles.grid}>
            {data?.routedMemories.map((signal) => {
              const source = MUSE_BY_ID[signal.sourceMuseId];
              return (
                <article className={styles.card} key={signal.id}>
                  <div className={styles.tags}><span>{source.symbol} {source.name}</span><span>{signal.memory.category}</span>{signal.memory.outcomeRating && <span>{signal.memory.outcomeRating}</span>}</div>
                  <h3>{signal.memory.title}</h3>
                  <p>{signal.memory.summary}</p>
                  {signal.memory.actualValue && <small>Actual value · {signal.memory.actualValue}</small>}
                  <details><summary>Why {selected.name} receives this</summary><p>{signal.relevance}</p></details>
                </article>
              );
            })}
          </div>
        </section>

        <section className={styles.section}>
          <div className={styles.sectionHead}>
            <div><p className={styles.kicker}>COUNCIL PATTERNS</p><h2>Evidence that has crossed specialties</h2></div>
            <small>Requires 3+ outcomes across 2+ Muses</small>
          </div>
          {!loading && !error && data?.patterns.length === 0 && (
            <div className={styles.emptyBox}><strong>No Council-level patterns yet.</strong><p>The threshold is intentionally conservative. A pattern appears only after multiple verified outcomes from more than one Muse.</p></div>
          )}
          <div className={styles.patterns}>
            {data?.patterns.map((pattern) => (
              <article className={styles.pattern} key={pattern.category} data-kind={pattern.kind}>
                <div><span>{pattern.category}</span><span>{pattern.kind}</span></div>
                <h3>{pattern.sampleSize} outcomes · {pattern.museCount} Muses</h3>
                <p>{pattern.summary}</p>
                <small>{pattern.positive} positive · {pattern.neutral} neutral · {pattern.weak} weak</small>
              </article>
            ))}
          </div>
        </section>
      </section>
    </main>
  );
}
