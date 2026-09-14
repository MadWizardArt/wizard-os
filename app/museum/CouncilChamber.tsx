"use client";

import type { CSSProperties } from "react";
import type { MuseId } from "../../lib/museum";
import { MUSE_DIRECTORY } from "../../lib/museum-directory";
import { MUSE_ROOMS } from "../../lib/museum-rooms";
import { RoomArtwork } from "./MuseRoom";
import styles from "./CouncilChamber.module.css";

type FocusPreview = { title: string; nextAction?: string };

type CouncilChamberProps = {
  focusByMuse: Map<MuseId, FocusPreview>;
  loading: boolean;
  loadFailed: boolean;
  onEnter: (id: MuseId) => void;
};

const POSITIONS = [
  [50, 10],
  [75, 17],
  [89, 39],
  [82, 69],
  [63, 84],
  [37, 84],
  [18, 69],
  [11, 39],
  [25, 17],
] as const;

export default function CouncilChamber({ focusByMuse, loading, loadFailed, onEnter }: CouncilChamberProps) {
  return (
    <section className={styles.chamber} aria-labelledby="council-chamber-title">
      <div className={styles.vault} aria-hidden="true" />
      <div className={styles.stars} aria-hidden="true" />
      <div className={styles.floor} aria-hidden="true" />
      <div className={styles.centralGlow} aria-hidden="true" />

      <div className={styles.dais}>
        <span className={styles.seal} aria-hidden="true">✦</span>
        <p>The Council Chamber</p>
        <h2 id="council-chamber-title">Nine doors. Nine minds.</h2>
        <small>Enter a room to see where her attention rests.</small>
      </div>

      <div className={styles.portalRing}>
        {MUSE_DIRECTORY.map((muse, index) => {
          const focus = focusByMuse.get(muse.id);
          const [x, y] = POSITIONS[index];
          const style = {
            "--portal-x": `${x}%`,
            "--portal-y": `${y}%`,
            "--portal-delay": `${index * -0.7}s`,
          } as CSSProperties;

          return (
            <button
              key={muse.id}
              className={styles.portal}
              style={style}
              data-palette={muse.palette}
              onClick={() => onEnter(muse.id)}
              aria-label={`Enter ${muse.name}'s room, ${MUSE_ROOMS[muse.id].name}`}
            >
              <span className={styles.arch} aria-hidden="true">
                <span className={styles.roomWindow}><RoomArtwork muse={muse} compact /></span>
                <span className={styles.portalShade} />
                <span className={styles.lintel}>{muse.symbol}</span>
              </span>
              <span className={styles.nameplate}>
                <strong>{muse.name}</strong>
                <small>{MUSE_ROOMS[muse.id].name}</small>
                <em className={focus ? styles.active : styles.idle}>
                  {loading ? "…" : loadFailed ? "Unavailable" : focus?.title || "Open"}
                </em>
              </span>
            </button>
          );
        })}
      </div>

      <div className={styles.inscription} aria-hidden="true">
        <span>ARCHITECTURE</span><span>STRATEGY</span><span>BEAUTY</span><span>STORY</span><span>MEMORY</span><span>RISK</span><span>MEANING</span><span>LIFE</span><span>PLAY</span>
      </div>
    </section>
  );
}
