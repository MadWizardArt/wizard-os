"use client";

import { useEffect, useRef, useState } from "react";
import type { MusePresenceState } from "./useMusePresence";
import styles from "./NovyPresence.module.css";

const NOVY_VIDEO: Record<MusePresenceState, string> = {
  working: "/museum/muses/novy/working.webm",
  available: "/museum/muses/novy/idle.webm",
  waiting: "/museum/muses/novy/thinking.webm",
  council: "/museum/muses/novy/council.webm",
  quiet: "/museum/muses/novy/quiet.webm",
};

export default function NovyPresence({ presence }: { presence: MusePresenceState }) {
  const [videoAvailable, setVideoAvailable] = useState(true);
  const videoRef = useRef<HTMLVideoElement>(null);
  const src = NOVY_VIDEO[presence];

  useEffect(() => {
    setVideoAvailable(true);
    const video = videoRef.current;
    if (!video) return;
    video.load();
    void video.play().catch(() => undefined);
  }, [src]);

  if (!videoAvailable) return null;

  return (
    <div className={styles.presence} aria-hidden="true" data-novy-presence={presence}>
      <video
        ref={videoRef}
        className={styles.video}
        autoPlay
        muted
        loop
        playsInline
        preload={presence === "working" ? "auto" : "metadata"}
        onError={() => setVideoAvailable(false)}
      >
        <source src={src} type="video/webm" />
      </video>
      <div className={styles.vignette} />
    </div>
  );
}
