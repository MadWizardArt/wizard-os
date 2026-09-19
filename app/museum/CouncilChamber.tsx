"use client";

import Image from "next/image";
import { useMemo, useState, type CSSProperties } from "react";
import type { MuseDirectoryEntry } from "../../lib/museum-directory";
import type { MuseId } from "../../lib/museum";
import { MUSE_DIRECTORY } from "../../lib/museum-directory";
import { MUSE_ROOMS } from "../../lib/museum-rooms";
import { RoomArtwork } from "./MuseRoom";
import styles from "./CouncilChamber.module.css";
import polish from "./CouncilChamberPolish.module.css";
import systemPortal from "./CouncilSystemsPortal.module.css";
import presenceStyles from "./MusePresence.module.css";
import signalStyles from "./MuseSignals.module.css";
import { deriveDefaultPresence, PRESENCE_META, useMusePresence } from "./useMusePresence";
import { SIGNAL_META, type MuseSignal, useMuseSignals } from "./useMuseSignals";

type CouncilChamberProps = {
  onEnter: (id: MuseId) => void;
};

const POSITIONS = [
  [50, 16],
  [75, 18],
  [89, 39],
  [82, 69],
  [25, 18],
  [37, 82],
  [18, 69],
  [11, 39],
  [63, 82],
] as const;

function MusePortal({ muse, index, signal, onEnter }: {
  muse: MuseDirectoryEntry;
  index: number;
  signal?: MuseSignal;
  onEnter: (id: MuseId) => void;
}) {
  const [x, y] = POSITIONS[index];
  const style = {
    "--portal-x": `${x}%`,
    "--portal-y": `${y}%`,
    "--portal-delay": `${index * -0.7}s`,
  } as CSSProperties;
  const automaticPresence = signal?.visualState ?? deriveDefaultPresence(false);
  const { presence } = useMusePresence(muse.id, automaticPresence);
  const presenceMeta = PRESENCE_META[presence];
  const signalMeta = signal ? SIGNAL_META[signal.type] : null;

  return (
    <button
      className={`${styles.portal} ${polish.portal}`}
      style={style}
      data-muse={muse.id}
      data-palette={muse.palette}
      data-presence={presence}
      data-signal={signal?.type ?? "none"}
      onClick={() => onEnter(muse.id)}
      aria-label={`Enter ${muse.name}'s room, ${MUSE_ROOMS[muse.id].name}. ${presenceMeta.label}.${signal ? ` ${signalMeta?.label}: ${signal.title}.` : ""}`}
    >
      <span className={`${styles.arch} ${polish.arch}`} aria-hidden="true">
        <span className={`${styles.roomWindow} ${polish.roomWindow}`}><RoomArtwork muse={muse} compact /></span>
        <span className={`${presenceStyles.portalHalo} ${presenceStyles[presence]}`} />
        <span className={styles.portalShade} />
        <span className={styles.lintel}>{muse.symbol}</span>
      </span>
      <span className={styles.nameplate}>
        <strong>{muse.name}</strong>
        <small>{MUSE_ROOMS[muse.id].name}</small>
        <span className={`${presenceStyles.portalBadge} ${presenceStyles[presence]}`}>{presenceMeta.label}</span>
        {signal && signalMeta && (
          <span className={`${signalStyles.doorSignal} ${signalStyles[signal.type]} ${signal.readAt ? "" : signalStyles.unread}`}>
            <strong aria-hidden="true">{signalMeta.symbol}</strong>{signalMeta.label}
          </span>
        )}
      </span>
    </button>
  );
}

export default function CouncilChamber({ onEnter }: CouncilChamberProps) {
  const { active } = useMuseSignals();
  const [systemsOpen, setSystemsOpen] = useState(false);
  const signalByMuse = useMemo(() => {
    const map = new Map<MuseId, MuseSignal>();
    for (const signal of active) if (!map.has(signal.museId)) map.set(signal.museId, signal);
    return map;
  }, [active]);

  return (
    <section className={`${styles.chamber} ${polish.chamber}`} aria-label="Council Chamber">
      <div className={styles.vault} aria-hidden="true" />
      <div className={styles.stars} aria-hidden="true" />
      <div className={styles.floor} aria-hidden="true" />
      <div className={styles.centralGlow} aria-hidden="true" />

      <div className={polish.centerpiece} aria-hidden="true">
        <Image
          src="/museum/council-centerpiece.webp"
          alt=""
          width={420}
          height={825}
          sizes="(max-width: 720px) 0px, (max-width: 980px) 33vw, 390px"
        />
      </div>

      <div className={`${styles.dais} ${polish.dais}`}>
        <button
          type="button"
          className={`${styles.seal} ${polish.seal} ${systemPortal.sealButton}`}
          aria-expanded={systemsOpen}
          aria-controls="museum-systems-portal"
          aria-label={systemsOpen ? "Close Council systems portal" : "Open Council systems portal"}
          title="Council systems"
          onClick={() => setSystemsOpen((current) => !current)}
        >
          ✦
        </button>
        <nav
          id="museum-systems-portal"
          className={`${systemPortal.menu} ${systemsOpen ? systemPortal.menuOpen : ""}`}
          aria-label="Council systems"
          aria-hidden={!systemsOpen}
        >
          <a href="/museum/agency" tabIndex={systemsOpen ? 0 : -1}>Agency</a>
          <a href="/museum/cognition" tabIndex={systemsOpen ? 0 : -1}>Cognition</a>
          <a href="/museum/intelligence" tabIndex={systemsOpen ? 0 : -1}>Intelligence</a>
        </nav>
        <p className={`${systemPortal.hint} ${systemsOpen ? systemPortal.hintOpen : ""}`}>{systemsOpen ? "Choose a Council system" : "Council systems"}</p>
      </div>

      <div className={styles.portalRing}>
        {MUSE_DIRECTORY.map((muse, index) => (
          <MusePortal
            key={muse.id}
            muse={muse}
            index={index}
            signal={signalByMuse.get(muse.id)}
            onEnter={onEnter}
          />
        ))}
      </div>

      <div className={styles.inscription} aria-hidden="true">
        <span>ARCHITECTURE</span><span>STRATEGY</span><span>BEAUTY</span><span>STORY</span><span>MEMORY</span><span>RISK</span><span>MEANING</span><span>LIFE</span><span>PLAY</span>
      </div>
    </section>
  );
}
