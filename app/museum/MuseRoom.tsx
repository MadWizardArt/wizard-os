"use client";

import { useEffect, useState } from "react";
import type { MuseDirectoryEntry } from "../../lib/museum-directory";
import { MUSE_AGENT_CHARTERS } from "../../lib/museum-agent-charters";
import type { StoredMuseMemory } from "../../lib/museum-memory-storage";
import { MUSE_ROOMS } from "../../lib/museum-rooms";
import styles from "./MuseRoom.module.css";
import presenceStyles from "./MusePresence.module.css";
import signalStyles from "./MuseSignals.module.css";
import { deriveDefaultPresence, PRESENCE_META } from "./useMusePresence";
import { SIGNAL_META, useMuseSignals } from "./useMuseSignals";

export function RoomArtwork({ muse, compact = false }: { muse: MuseDirectoryEntry; compact?: boolean }) {
  const room = MUSE_ROOMS[muse.id];
  // Hall portraits use still artwork; full rooms may opt into a durable local animation.
  const [artworkSrc, setArtworkSrc] = useState(compact ? room.image : room.animatedImage ?? room.image);
  const [videoFailed, setVideoFailed] = useState(false);
  const [failed, setFailed] = useState(false);

  const handleArtworkError = () => {
    if (artworkSrc !== room.image) {
      setArtworkSrc(room.image);
      return;
    }
    setFailed(true);
  };

  if (room.animatedVideo && !videoFailed) {
    return (
      <video className={compact ? styles.cardArt : styles.roomArt} poster={room.image}
        autoPlay loop muted playsInline preload="metadata"
        aria-label={`${muse.name} welcoming you into ${room.name}`}
        onError={() => setVideoFailed(true)}>
        <source src={room.animatedVideo} type="video/webm" />
      </video>
    );
  }

  return failed ? (
    <div className={styles.artFallback} role="img" aria-label={`${muse.name} — room illustration unavailable`}>
      <span aria-hidden="true">{muse.symbol}</span><span>{room.name}</span>
    </div>
  ) : (
    <img className={compact ? styles.cardArt : styles.roomArt} src={artworkSrc}
      alt={`${muse.name} welcoming you into ${room.name}`} width={1536} height={1024}
      loading={compact ? "lazy" : "eager"} decoding="async" onError={handleArtworkError} />
  );
}

function AmbientLayers({ muse }: { muse: MuseDirectoryEntry }) {
  switch (muse.id) {
    case "novy": return <div className={`${styles.ambient} ${styles.novyAmbient}`} aria-hidden="true"><div className={styles.constellationField} /><div className={styles.orrery}><i /><i /><i /><b>✦</b></div><div className={styles.candleGlow} /><div className={styles.dust} /></div>;
    case "callista": return <div className={`${styles.ambient} ${styles.callistaAmbient}`} aria-hidden="true"><div className={styles.sunDisc} /><div className={styles.laurelShadow} /><div className={styles.strategySweep} /><div className={styles.goldDust} /></div>;
    case "aurelia": return <div className={`${styles.ambient} ${styles.aureliaAmbient}`} aria-hidden="true"><div className={styles.atelierGlow} /><div className={styles.linenVeil} /><div className={styles.roseMotes} /><div className={styles.brushGlint} /></div>;
    case "lyra": return <div className={`${styles.ambient} ${styles.lyraAmbient}`} aria-hidden="true"><div className={styles.reel}><i /><i /><i /><i /></div><div className={styles.waveform}><i /><i /><i /><i /><i /><i /><i /></div><div className={styles.rhythmLight} /></div>;
    case "cleo": return <div className={`${styles.ambient} ${styles.cleoAmbient}`} aria-hidden="true"><div className={styles.archiveDust} /><div className={styles.goldSeal}>✦</div><div className={styles.ledgerShimmer} /><div className={styles.archiveLines} /></div>;
    case "melina": return <div className={`${styles.ambient} ${styles.melinaAmbient}`} aria-hidden="true"><div className={styles.coldWindow} /><div className={styles.scales}><span /><i /><b /><em /></div><div className={styles.redCandle} /></div>;
    case "seraphine": return <div className={`${styles.ambient} ${styles.seraphineAmbient}`} aria-hidden="true"><div className={styles.gardenLight} /><div className={styles.incense}><i /><i /><i /></div><div className={styles.bellPendulum}><span /></div><div className={styles.leafShadow} /></div>;
    case "tessa": return <div className={`${styles.ambient} ${styles.tessaAmbient}`} aria-hidden="true"><div className={styles.daylightSweep} /><div className={styles.ribbon}><i /><i /></div><div className={styles.studioGeometry} /><div className={styles.plantShadow} /></div>;
    case "thalia": return <div className={`${styles.ambient} ${styles.thaliaAmbient}`} aria-hidden="true"><div className={styles.marginalia}>✦　☽　◇　✶</div><div className={styles.playingCard}><span>?</span></div><div className={styles.maskGlint}>◡</div><div className={styles.sparkField} /></div>;
    default: return null;
  }
}

function signalTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Recently";
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(date);
}

export default function MuseRoom({ muse, onCouncil }: { muse: MuseDirectoryEntry; onCouncil: () => void }) {
  const room = MUSE_ROOMS[muse.id];
  const charter = MUSE_AGENT_CHARTERS[muse.id];
  const { latestActive, markRead, acknowledge } = useMuseSignals(muse.id);
  const presence = latestActive?.visualState ?? deriveDefaultPresence(false);
  const presenceMeta = PRESENCE_META[presence];
  const signalMeta = latestActive ? SIGNAL_META[latestActive.type] : null;
  const [signalError, setSignalError] = useState("");
  const [memories, setMemories] = useState<Array<StoredMuseMemory & { id: string }>>([]);
  const [memoryError, setMemoryError] = useState("");
  const [memoryLoading, setMemoryLoading] = useState(true);

  useEffect(() => {
    const controller = new AbortController();
    setMemories([]);
    setMemoryError("");
    setMemoryLoading(true);
    fetch(`/api/museum/memory?muse=${muse.id}`, { cache: "no-store", signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error("Verified memory could not be read.");
        return response.json();
      })
      .then((data: unknown) => {
        if (!controller.signal.aborted) setMemories(Array.isArray(data) ? data : []);
      })
      .catch(() => {
        if (!controller.signal.aborted) setMemoryError("Memory is unavailable right now.");
      })
      .finally(() => {
        if (!controller.signal.aborted) setMemoryLoading(false);
      });
    return () => controller.abort();
  }, [muse.id]);
  const updateSignal = async (action: "read" | "acknowledge") => {
    if (!latestActive) return;
    setSignalError("");
    try { if (action === "read") await markRead(latestActive.id); else await acknowledge(latestActive.id); }
    catch (error) { setSignalError(error instanceof Error ? error.message : "Signal could not be updated."); }
  };

  return (
    <section className={`${styles.room} ${styles[`${muse.id}Room`] ?? ""}`} data-muse={muse.id} data-presence={presence} data-signal={latestActive?.type ?? "none"} aria-labelledby="muse-room-name">
      <RoomArtwork key={muse.id} muse={muse} />
      <AmbientLayers muse={muse} />
      <div className={`${presenceStyles.roomAura} ${presenceStyles[presence]}`} aria-hidden="true" />
      {latestActive && <div className={`${signalStyles.signalAura} ${signalStyles[latestActive.type]}`} aria-hidden="true" />}
      <div className={styles.scrim} />
      <div className={`${presenceStyles.roomState} ${presenceStyles[presence]}`} role="status" aria-label={`${muse.name} is ${presenceMeta.label}`}><span>{presenceMeta.label}</span><small>{presenceMeta.roomLine}</small></div>
      <div className={styles.roomCaption}><span aria-hidden="true">{muse.symbol}</span> {room.name}</div>
      <div className={styles.identity}>
        <p className={styles.eyebrow}>{muse.role}</p><h2 id="muse-room-name">{muse.name}</h2><p className={styles.description}>{room.description}</p><blockquote>“{muse.coreLine}”</blockquote>
        <div className={styles.profileSection}>
          <span className={styles.profileLabel}>Her purpose</span>
          <p>{charter.mission}</p>
          <details className={styles.profileDetails}>
            <summary>Identity &amp; operating charter</summary>
            <p><strong>Creative objective</strong><br />{charter.creativeObjective}</p>
            <p><strong>Economic objective</strong><br />{charter.economicObjective}</p>
            <p><strong>May propose</strong><br />{charter.proposes.join(" · ")}</p>
            <p><strong>Artist authority</strong><br />{charter.commitRule}</p>
          </details>
        </div>
        <div className={styles.profileSection}>
          <span className={styles.profileLabel}>Recorded memory · {memories.length}</span>
          {memoryLoading ? <p>Reading her record…</p> : memoryError ? <p role="status">{memoryError}</p> : memories.length === 0 ? <p>No Council memory recorded yet.</p> : <div className={styles.memoryList}>{memories.slice(0, 3).map((memory) => <article key={memory.id}><strong>{memory.title}</strong><p>{memory.summary}</p><small>{memory.kind} · {memory.category} · verified by {memory.verifiedBy}</small></article>)}</div>}
        </div>
        {latestActive && signalMeta && <section className={`${signalStyles.signalCard} ${latestActive.readAt ? "" : signalStyles.unread}`} aria-label={`Latest signal for ${muse.name}`}><div className={signalStyles.signalHeader}><span className={signalStyles.signalType}><i aria-hidden="true">{signalMeta.symbol}</i>{signalMeta.label}</span><time className={signalStyles.signalTime} dateTime={latestActive.occurredAt}>{signalTime(latestActive.occurredAt)}</time></div><h4>{latestActive.title}</h4><p>{latestActive.summary}</p><span className={signalStyles.signalArea}>{latestActive.area}</span><div className={signalStyles.signalActions}>{!latestActive.readAt && <button onClick={() => void updateSignal("read")}>Mark seen</button>}<button onClick={() => void updateSignal("acknowledge")}>Acknowledge</button></div>{signalError && <p role="alert">{signalError}</p>}</section>}
        <nav className={styles.actions} aria-label={`${muse.name} room controls`}><a href={`/museum/intelligence?source=profile&muse=${muse.id}`}>Consult {muse.name} <span>Prepare a question in Intelligence</span></a><a href={`/grotto?muse=${muse.id}`}>Her Gallery <span>Visual canon and references</span></a><button onClick={onCouncil}>Convene Council <span>Bring a question to the table</span></button><a href="/museum/agency">Proposals <span>Review work awaiting approval</span></a></nav>
      </div>
    </section>
  );
}
