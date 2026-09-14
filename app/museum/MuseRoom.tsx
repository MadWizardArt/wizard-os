"use client";

import { useState } from "react";
import type { MuseDirectoryEntry } from "../../lib/museum-directory";
import { MUSE_ROOMS } from "../../lib/museum-rooms";
import styles from "./MuseRoom.module.css";

export function RoomArtwork({ muse, compact = false }: { muse: MuseDirectoryEntry; compact?: boolean }) {
  const [failed, setFailed] = useState(false);
  const room = MUSE_ROOMS[muse.id];
  return failed ? (
    <div className={styles.artFallback} role="img" aria-label={`${muse.name} — room illustration unavailable`}>
      <span aria-hidden="true">{muse.symbol}</span><span>{room.name}</span>
    </div>
  ) : (
    <img className={compact ? styles.cardArt : styles.roomArt} src={room.image}
      alt={`${muse.name} welcoming you into ${room.name}`} width={1536} height={1024}
      loading={compact ? "lazy" : "eager"} decoding="async" onError={() => setFailed(true)} />
  );
}

function AmbientLayers({ muse }: { muse: MuseDirectoryEntry }) {
  switch (muse.id) {
    case "novy":
      return (
        <div className={`${styles.ambient} ${styles.novyAmbient}`} aria-hidden="true">
          <div className={styles.constellationField} />
          <div className={styles.orrery}><i /><i /><i /><b>✦</b></div>
          <div className={styles.candleGlow} />
          <div className={styles.dust} />
        </div>
      );
    case "callista":
      return (
        <div className={`${styles.ambient} ${styles.callistaAmbient}`} aria-hidden="true">
          <div className={styles.sunDisc} />
          <div className={styles.laurelShadow} />
          <div className={styles.strategySweep} />
          <div className={styles.goldDust} />
        </div>
      );
    case "aurelia":
      return (
        <div className={`${styles.ambient} ${styles.aureliaAmbient}`} aria-hidden="true">
          <div className={styles.atelierGlow} />
          <div className={styles.linenVeil} />
          <div className={styles.roseMotes} />
          <div className={styles.brushGlint} />
        </div>
      );
    case "lyra":
      return (
        <div className={`${styles.ambient} ${styles.lyraAmbient}`} aria-hidden="true">
          <div className={styles.reel}><i /><i /><i /><i /></div>
          <div className={styles.waveform}><i /><i /><i /><i /><i /><i /><i /></div>
          <div className={styles.rhythmLight} />
        </div>
      );
    case "cleo":
      return (
        <div className={`${styles.ambient} ${styles.cleoAmbient}`} aria-hidden="true">
          <div className={styles.archiveDust} />
          <div className={styles.goldSeal}>✦</div>
          <div className={styles.ledgerShimmer} />
          <div className={styles.archiveLines} />
        </div>
      );
    case "melina":
      return (
        <div className={`${styles.ambient} ${styles.melinaAmbient}`} aria-hidden="true">
          <div className={styles.coldWindow} />
          <div className={styles.scales}><span /><i /><b /><em /></div>
          <div className={styles.redCandle} />
        </div>
      );
    case "seraphine":
      return (
        <div className={`${styles.ambient} ${styles.seraphineAmbient}`} aria-hidden="true">
          <div className={styles.gardenLight} />
          <div className={styles.incense}><i /><i /><i /></div>
          <div className={styles.bellPendulum}><span /></div>
          <div className={styles.leafShadow} />
        </div>
      );
    case "tessa":
      return (
        <div className={`${styles.ambient} ${styles.tessaAmbient}`} aria-hidden="true">
          <div className={styles.daylightSweep} />
          <div className={styles.ribbon}><i /><i /></div>
          <div className={styles.studioGeometry} />
          <div className={styles.plantShadow} />
        </div>
      );
    case "thalia":
      return (
        <div className={`${styles.ambient} ${styles.thaliaAmbient}`} aria-hidden="true">
          <div className={styles.marginalia}>✦　☽　◇　✶</div>
          <div className={styles.playingCard}><span>?</span></div>
          <div className={styles.maskGlint}>◡</div>
          <div className={styles.sparkField} />
        </div>
      );
    default:
      return null;
  }
}

export default function MuseRoom({ muse, assignment, onFocus, onChat, onCouncil }: {
  muse: MuseDirectoryEntry;
  assignment: string;
  onFocus: () => void;
  onChat: () => void;
  onCouncil: () => void;
}) {
  const room = MUSE_ROOMS[muse.id];
  return (
    <section className={`${styles.room} ${styles[`${muse.id}Room`] ?? ""}`} data-muse={muse.id} aria-labelledby="muse-room-name">
      <RoomArtwork key={muse.id} muse={muse} />
      <AmbientLayers muse={muse} />
      <div className={styles.scrim} />
      <div className={styles.roomCaption}><span aria-hidden="true">{muse.symbol}</span> {room.name}</div>
      <div className={styles.identity}>
        <p className={styles.eyebrow}>{muse.role}</p>
        <h2 id="muse-room-name">{muse.name}</h2>
        <p className={styles.description}>{room.description}</p>
        <blockquote>“{muse.coreLine}”</blockquote>
        <div className={styles.assignment}><span>Current Focus</span><strong>{assignment}</strong></div>
        <nav className={styles.actions} aria-label={`${muse.name} room controls`}>
          <button onClick={onChat}>Visit <span>Prepare a consultation ↗</span></button>
          <button onClick={onFocus}>Focus <span>View or update her attention</span></button>
          <button onClick={onCouncil}>Council <span>Return to the council chamber</span></button>
          <a href="/">Wizard OS <span>Open your workspace</span></a>
        </nav>
      </div>
    </section>
  );
}
