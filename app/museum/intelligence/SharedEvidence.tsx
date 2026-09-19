"use client";

import { useEffect, useState } from "react";
import { MUSE_BY_ID, MUSE_DIRECTORY } from "../../../lib/museum-directory";
import type { MuseId } from "../../../lib/museum";
import type { CouncilPattern, SharedMemorySignal } from "../../../lib/museum-agent-cognition";
import styles from "./selective-intelligence.module.css";

type SharedCognition = {
  routedMemories: SharedMemorySignal[];
  patterns: CouncilPattern[];
};

export default function SharedEvidence() {
  const [museId, setMuseId] = useState<MuseId>("callista");
  const [data, setData] = useState<SharedCognition | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError("");
    setData(null);
    fetch(`/api/museum/cognition?muse=${museId}`, { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || "Evidence unavailable.");
        if (!controller.signal.aborted) setData(result);
      })
      .catch((reason) => {
        if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : "Evidence unavailable.");
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [museId]);

  return <div className={styles.evidenceBody}>
    <p>Read-only: verified memories shared across specialties. Nothing here spends AI or changes a Muse's confidence.</p>
    <label>Receiving Muse
      <select value={museId} onChange={(event) => setMuseId(event.target.value as MuseId)}>
        {MUSE_DIRECTORY.map((muse) => <option key={muse.id} value={muse.id}>{muse.name}</option>)}
      </select>
    </label>
    {loading && <p>Reading routed evidence…</p>}
    {error && <p role="alert">{error}</p>}
    {!loading && !error && <>
      <h3>Relevant memories · {data?.routedMemories.length ?? 0}</h3>
      {data?.routedMemories.length === 0 && <p>No cross-Muse evidence recorded for {MUSE_BY_ID[museId].name} yet.</p>}
      {data?.routedMemories.map((item) => <article className={styles.evidenceItem} key={item.id}>
        <strong>{item.memory.title}</strong>
        <small>{MUSE_BY_ID[item.sourceMuseId].name} · {item.memory.category}</small>
        <p>{item.memory.summary}</p>
        <details><summary>Why this was shared</summary><p>{item.relevance}</p></details>
      </article>)}
      <h3>Council patterns · {data?.patterns.length ?? 0}</h3>
      {data?.patterns.length === 0 && <p>Patterns require at least three outcomes across two Muses.</p>}
      {data?.patterns.map((item) => <article className={styles.evidenceItem} key={item.category}>
        <strong>{item.category} · {item.kind}</strong>
        <small>{item.sampleSize} outcomes across {item.museCount} Muses</small>
        <p>{item.summary}</p>
      </article>)}
    </>}
  </div>;
}
