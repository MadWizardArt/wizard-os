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

export default function MuseRoom({ muse, assignment, onFocus, onChat, onCouncil }: {
  muse: MuseDirectoryEntry;
  assignment: string;
  onFocus: () => void;
  onChat: () => void;
  onCouncil: () => void;
}) {
  const room = MUSE_ROOMS[muse.id];
  return (
    <section className={styles.room} aria-labelledby="muse-room-name">
      <RoomArtwork key={muse.id} muse={muse} />
      <div className={styles.scrim} />
      <div className={styles.roomCaption}><span aria-hidden="true">{muse.symbol}</span> {room.name}</div>
      <div className={styles.identity}>
        <p className={styles.eyebrow}>{muse.role}</p>
        <h2 id="muse-room-name">{muse.name}</h2>
        <p className={styles.description}>{room.description}</p>
        <blockquote>“{muse.coreLine}”</blockquote>
        <div className={styles.assignment}><span>Current Focus</span><strong>{assignment}</strong></div>
        <nav className={styles.actions} aria-label={`${muse.name} room controls`}>
          <button onClick={onChat}>Chat <span>Prepare a consultation ↗</span></button>
          <button onClick={onFocus}>Focus <span>View or update her focus</span></button>
          <button onClick={onCouncil}>Council <span>Bring sisters together</span></button>
          <a href="/">Wizard OS <span>Open your workspace</span></a>
        </nav>
      </div>
    </section>
  );
}
