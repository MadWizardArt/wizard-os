"use client";

import { useEffect, useMemo, useState } from "react";
import styles from "./grotto.module.css";

type View = "gallery" | "create" | "session";
type ChoiceKey = "mood" | "setting" | "pose" | "frame";

type Choices = {
  mood: string;
  setting: string;
  pose: string;
  frame: string;
};

type GalleryItem = {
  id: string;
  src: string | null;
  alt: string;
  canonical?: boolean;
};

const GALLERY: GalleryItem[] = [
  {
    id: "tessa-canon",
    src: "/museum/tessa.webp",
    alt: "Tessa",
    canonical: true,
  },
  ...Array.from({ length: 15 }, (_, index) => ({
    id: `empty-${index + 1}`,
    src: null,
    alt: "",
  })),
];

const OPTIONS: Record<ChoiceKey, string[]> = {
  mood: ["Soft", "Playful", "Mysterious", "Serene"],
  setting: ["Onsen", "Shrine", "Room", "Garden"],
  pose: ["Seated", "Standing", "Reclining", "Surprise me"],
  frame: ["Portrait", "Full", "Close", "Wide"],
};

function ChoiceRow({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: string[];
  onChange: (value: string) => void;
}) {
  return (
    <div className={styles.choiceGroup}>
      <span>{label}</span>
      <div className={styles.choices}>
        {options.map((option) => (
          <button
            type="button"
            key={option}
            className={value === option ? styles.selected : ""}
            onClick={() => onChange(option)}
          >
            {option}
          </button>
        ))}
      </div>
    </div>
  );
}

export default function GrottoPage() {
  const [view, setView] = useState<View>("gallery");
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const [favorite, setFavorite] = useState(false);
  const [choices, setChoices] = useState<Choices>({
    mood: "Serene",
    setting: "Onsen",
    pose: "Seated",
    frame: "Portrait",
  });

  const visibleIndices = useMemo(
    () => GALLERY.map((item, index) => (item.src ? index : -1)).filter((index) => index >= 0),
    [],
  );

  const current = activeIndex === null ? null : GALLERY[activeIndex];

  const moveViewer = (direction: -1 | 1) => {
    if (activeIndex === null || visibleIndices.length < 2) return;
    const position = visibleIndices.indexOf(activeIndex);
    const nextPosition = (position + direction + visibleIndices.length) % visibleIndices.length;
    setActiveIndex(visibleIndices[nextPosition]);
  };

  useEffect(() => {
    if (activeIndex === null) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setActiveIndex(null);
      if (event.key === "ArrowLeft") moveViewer(-1);
      if (event.key === "ArrowRight") moveViewer(1);
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [activeIndex]);

  const setChoice = (key: ChoiceKey, value: string) => {
    setChoices((currentChoices) => ({ ...currentChoices, [key]: value }));
  };

  const beginRemix = () => {
    setActiveIndex(null);
    setView("create");
  };

  const sessionToCreate = (preset: Partial<Choices>) => {
    setChoices((currentChoices) => ({ ...currentChoices, ...preset }));
    setView("create");
  };

  return (
    <main className={styles.page}>
      <section className={styles.shell}>
        <header className={styles.topbar}>
          <a className={styles.back} href="/museum">← Museum</a>
          <span className={styles.mark} aria-hidden="true">◇</span>
          <span className={styles.name}>Tessa</span>
        </header>

        <section className={styles.hero} aria-label="Tessa's Grotto chamber">
          <img className={styles.heroImage} src="/museum/tessa.webp" alt="" />
          <div className={styles.heroVeil} />
          <div className={styles.heroCopy}>
            <small>The Grotto</small>
            <h1>Tessa</h1>
            <p>A quieter room beneath the Museum. Images first; everything else stays out of the way.</p>
          </div>
        </section>

        <nav className={styles.tabs} aria-label="Tessa Grotto views">
          {(["gallery", "create", "session"] as View[]).map((item) => (
            <button
              type="button"
              key={item}
              className={view === item ? styles.active : ""}
              onClick={() => setView(item)}
            >
              {item}
            </button>
          ))}
        </nav>

        {view === "gallery" && (
          <section className={styles.gallery} aria-label="Tessa gallery">
            {GALLERY.map((item, index) => item.src ? (
              <button
                className={styles.tile}
                type="button"
                key={item.id}
                onClick={() => setActiveIndex(index)}
                aria-label={`Open ${item.alt}`}
              >
                <img src={item.src} alt={item.alt} />
                {item.canonical && <span className={styles.canon}>Canon</span>}
              </button>
            ) : (
              <div className={styles.emptyTile} key={item.id} aria-hidden="true" />
            ))}
          </section>
        )}

        {view === "create" && (
          <section className={styles.create} aria-label="Create with Tessa">
            <div className={styles.createInner}>
              <ChoiceRow label="Mood" value={choices.mood} options={OPTIONS.mood} onChange={(value) => setChoice("mood", value)} />
              <ChoiceRow label="Setting" value={choices.setting} options={OPTIONS.setting} onChange={(value) => setChoice("setting", value)} />
              <ChoiceRow label="Pose" value={choices.pose} options={OPTIONS.pose} onChange={(value) => setChoice("pose", value)} />
              <ChoiceRow label="Frame" value={choices.frame} options={OPTIONS.frame} onChange={(value) => setChoice("frame", value)} />
              <button className={styles.generate} type="button" disabled>Generate</button>
              <p className={styles.connectionNote}>Generator connection comes next.</p>
            </div>
          </section>
        )}

        {view === "session" && (
          <section className={styles.session} aria-label="Tessa session">
            <div className={styles.sessionFrame}>
              <img className={styles.sessionPortrait} src="/museum/tessa.webp" alt="Tessa" />
              <div className={styles.sessionActions}>
                <button type="button" onClick={() => sessionToCreate({ frame: "Close" })}>Closer</button>
                <button type="button" onClick={() => sessionToCreate({ pose: "Surprise me" })}>New pose</button>
                <button type="button" onClick={() => sessionToCreate({ mood: "Playful", pose: "Surprise me" })}>Surprise me</button>
              </div>
            </div>
          </section>
        )}
      </section>

      {current?.src && (
        <div className={styles.lightbox} role="dialog" aria-modal="true" aria-label="Gallery viewer">
          <button className={styles.close} type="button" onClick={() => setActiveIndex(null)} aria-label="Close">×</button>
          {visibleIndices.length > 1 && <button className={styles.prev} type="button" onClick={() => moveViewer(-1)} aria-label="Previous image">‹</button>}
          <img className={styles.lightboxImage} src={current.src} alt={current.alt} />
          {visibleIndices.length > 1 && <button className={styles.next} type="button" onClick={() => moveViewer(1)} aria-label="Next image">›</button>}
          <div className={styles.viewerActions}>
            <button type="button" onClick={() => setFavorite((value) => !value)}>{favorite ? "Favorited" : "Favorite"}</button>
            <button type="button" onClick={beginRemix}>Remix</button>
            <button type="button" disabled={current.canonical} title={current.canonical ? "Canon stays protected" : undefined}>Delete</button>
          </div>
        </div>
      )}
    </main>
  );
}
