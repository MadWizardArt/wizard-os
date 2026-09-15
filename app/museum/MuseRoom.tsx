"use client";

import { useState } from "react";
import type { MuseDirectoryEntry } from "../../lib/museum-directory";
import { MUSE_ROOMS } from "../../lib/museum-rooms";
import styles from "./MuseRoom.module.css";
import presenceStyles from "./MusePresence.module.css";
import signalStyles from "./MuseSignals.module.css";
import {
  deriveDefaultPresence,
  PRESENCE_META,
  type MusePresenceState,
  useMusePresence,
} from "./useMusePresence";
import { SIGNAL_META, useMuseSignals } from "./useMuseSignals";

export function RoomArtwork({ muse, compact = false }: { muse: MuseDirectoryEntry; compact?: boolean }) {
  const room = MUSE_ROOMS[muse.id];
  const [artworkSrc, setArtworkSrc] = useState(room.animatedImage ?? room.image);
  const [failed, setFailed] = useState(false);

  const handleArtworkError = () => {
    if (artworkSrc !== room.image) {
      setArtworkSrc(room.image);
      return;
    }
    setFailed(true);
  };

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
  const { latestActive, markRead, acknowledge } = useMuseSignals(muse.id);
  const automaticPresence = latestActive?.visualState ?? deriveDefaultPresence(false);
  const { presence, overridden, setPresence } = useMusePresence(muse.id, automaticPresence);
  const presenceMeta = PRESENCE_META[presence];
  const signalMeta = latestActive ? SIGNAL_META[latestActive.type] : null;
  const [signalError, setSignalError] = useState("");
  const changePresence = (value: string) => setPresence(value === "auto" ? null : value as MusePresenceState);
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
        {latestActive && signalMeta && <section className={`${signalStyles.signalCard} ${latestActive.readAt ? "" : signalStyles.unread}`} aria-label={`Latest signal for ${muse.name}`}><div className={signalStyles.signalHeader}><span className={signalStyles.signalType}><i aria-hidden="true">{signalMeta.symbol}</i>{signalMeta.label}</span><time className={signalStyles.signalTime} dateTime={latestActive.occurredAt}>{signalTime(latestActive.occurredAt)}</time></div><h4>{latestActive.title}</h4><p>{latestActive.summary}</p><span className={signalStyles.signalArea}>{latestActive.area}</span><div className={signalStyles.signalActions}>{!latestActive.readAt && <button onClick={() => void updateSignal("read")}>Mark seen</button>}<button onClick={() => void updateSignal("acknowledge")}>Acknowledge</button></div>{signalError && <p role="alert">{signalError}</p>}</section>}
        <div className={presenceStyles.control}><label><span>Presence</span><select aria-label={`${muse.name} visual presence`} value={overridden ? presence : "auto"} onChange={(event) => changePresence(event.target.value)}><option value="auto">Auto · {PRESENCE_META[automaticPresence].label}</option><option value="working">Working</option><option value="available">Available</option><option value="waiting">Waiting on Brandon</option><option value="council">In Council</option><option value="quiet">Quiet</option></select></label><small>Visual only. Manual presence overrides Wizard OS signals until returned to Auto.</small></div>
        <nav className={styles.actions} aria-label={`${muse.name} room controls`}><button onClick={onCouncil}>Council <span>Return to the council chamber</span></button><a href="/museum/agency">Agency <span>Review Muse proposals</span></a><a href="/">Wizard OS <span>Open your workspace</span></a></nav>
      </div>
    </section>
  );
}
