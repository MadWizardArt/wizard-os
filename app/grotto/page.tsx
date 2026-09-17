"use client";

import { useEffect, useMemo, useState } from "react";
import styles from "./grotto.module.css";

type Space = "tessa" | "studio";
type View = "gallery" | "create" | "session";
type ChoiceKey = "mood" | "setting" | "pose" | "frame";
type Choices = { mood: string; setting: string; pose: string; frame: string };
type StudioFormat = "Portrait" | "Square" | "Landscape";
type StudioInput = {
  prompt: string;
  negativePrompt: string;
  format: StudioFormat;
  quantity: 1 | 4;
};
type GalleryItem = {
  id: string;
  src: string | null;
  alt: string;
  canonical?: boolean;
  favorite?: boolean;
  private?: boolean;
  prompt?: string;
  studioInput?: StudioInput | null;
};
type StoredGalleryItem = {
  id: string;
  src: string;
  favorite: boolean;
  canonical: boolean;
  prompt?: string;
  studioInput?: StudioInput | null;
};
type GrottoStatus = {
  configured: boolean;
  authenticated: boolean;
  generation: {
    enabled: boolean;
    provider: string;
    providerConfigured: boolean;
    museModelConfigured: boolean;
    configured: boolean;
  };
  studio: {
    enabled: boolean;
    provider: string;
    providerConfigured: boolean;
    checkpointConfigured: boolean;
    configured: boolean;
    defaultNegative: string;
    maxImages: number;
  };
};

const CANONICAL: GalleryItem = {
  id: "tessa-canon",
  src: "/museum/tessa.webp",
  alt: "Tessa",
  canonical: true,
  favorite: true,
};

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

async function readJson(response: Response) {
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(typeof payload.error === "string" ? payload.error : "The Grotto request failed.");
  }
  return payload;
}

function sleep(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

export default function GrottoPage() {
  const [space, setSpace] = useState<Space>("tessa");
  const [view, setView] = useState<View>("gallery");
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const [privateGallery, setPrivateGallery] = useState<StoredGalleryItem[]>([]);
  const [status, setStatus] = useState<GrottoStatus | null>(null);
  const [statusLoading, setStatusLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [note, setNote] = useState("");
  const [choices, setChoices] = useState<Choices>({
    mood: "Serene",
    setting: "Onsen",
    pose: "Seated",
    frame: "Portrait",
  });
  const [studioPrompt, setStudioPrompt] = useState("");
  const [studioNegative, setStudioNegative] = useState("");
  const [studioFormat, setStudioFormat] = useState<StudioFormat>("Portrait");
  const [studioQuantity, setStudioQuantity] = useState<1 | 4>(1);

  const gallery = useMemo<GalleryItem[]>(() => {
    const stored = privateGallery.slice(0, space === "tessa" ? 15 : 16).map((item) => ({
      ...item,
      alt: space === "tessa" ? "Tessa" : "Studio generation",
      private: true,
    }));

    const filled: GalleryItem[] = space === "tessa" ? [CANONICAL, ...stored] : [...stored];
    while (filled.length < 16) {
      filled.push({ id: `${space}-empty-${filled.length}`, src: null, alt: "" });
    }
    return filled.slice(0, 16);
  }, [privateGallery, space]);

  const visibleIndices = useMemo(
    () => gallery.map((item, index) => item.src ? index : -1).filter((index) => index >= 0),
    [gallery],
  );

  const current = activeIndex === null ? null : gallery[activeIndex];

  const loadGallery = async (target: Space) => {
    const limit = target === "tessa" ? 15 : 16;
    const payload = await readJson(await fetch(`/api/grotto/images?museId=${target}&limit=${limit}`, { cache: "no-store" }));
    setPrivateGallery(Array.isArray(payload) ? payload : []);
  };

  useEffect(() => {
    let live = true;
    void (async () => {
      try {
        const payload = await readJson(await fetch("/api/grotto/status", { cache: "no-store" })) as GrottoStatus;
        if (!live) return;
        setStatus(payload);
        setStudioNegative((currentValue) => currentValue || payload.studio.defaultNegative || "");

        const saved = localStorage.getItem("wizard-os-grotto-space") as Space | null;
        const initialSpace: Space = saved === "tessa" || saved === "studio"
          ? saved
          : payload.studio.configured && !payload.generation.configured
            ? "studio"
            : "tessa";
        setSpace(initialSpace);
        setView(initialSpace === "studio" ? "create" : "gallery");
        if (payload.authenticated) await loadGallery(initialSpace);
      } catch (error) {
        if (live) setNote(error instanceof Error ? error.message : "The Grotto could not be opened.");
      } finally {
        if (live) setStatusLoading(false);
      }
    })();
    return () => { live = false; };
  }, []);

  const selectSpace = async (next: Space) => {
    setSpace(next);
    localStorage.setItem("wizard-os-grotto-space", next);
    setActiveIndex(null);
    setNote("");
    setView(next === "studio" ? "create" : "gallery");
    if (status?.authenticated) {
      try {
        await loadGallery(next);
      } catch (error) {
        setNote(error instanceof Error ? error.message : "Gallery could not be opened.");
      }
    }
  };

  const moveViewer = (direction: -1 | 1) => {
    if (activeIndex === null || visibleIndices.length < 2) return;
    const position = visibleIndices.indexOf(activeIndex);
    setActiveIndex(visibleIndices[(position + direction + visibleIndices.length) % visibleIndices.length]);
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
  }, [activeIndex, visibleIndices]);

  const setChoice = (key: ChoiceKey, value: string) => {
    setChoices((currentChoices) => ({ ...currentChoices, [key]: value }));
  };

  const sessionToCreate = (preset: Partial<Choices>) => {
    setChoices((currentChoices) => ({ ...currentChoices, ...preset }));
    setView("create");
  };

  const toggleFavorite = async () => {
    if (!current?.private) return;
    try {
      const payload = await readJson(await fetch(`/api/grotto/images/${current.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ favorite: !current.favorite }),
      }));
      setPrivateGallery((items) => items.map((item) => item.id === current.id
        ? { ...item, favorite: Boolean(payload.favorite) }
        : item));
    } catch (error) {
      setNote(error instanceof Error ? error.message : "Favorite could not be changed.");
    }
  };

  const deleteCurrent = async () => {
    if (!current?.private || current.canonical || !window.confirm("Remove this image from the Grotto?")) return;
    try {
      await readJson(await fetch(`/api/grotto/images/${current.id}`, { method: "DELETE" }));
      setActiveIndex(null);
      await loadGallery(space);
    } catch (error) {
      setNote(error instanceof Error ? error.message : "Image could not be removed.");
    }
  };

  const beginRemix = () => {
    if (!current) return;
    if (space === "studio") {
      const recipe = current.studioInput;
      if (recipe) {
        setStudioPrompt(recipe.prompt || current.prompt || "");
        setStudioNegative(recipe.negativePrompt || status?.studio.defaultNegative || "");
        setStudioFormat(recipe.format || "Portrait");
        setStudioQuantity(recipe.quantity === 4 ? 4 : 1);
      } else if (current.prompt) {
        setStudioPrompt(current.prompt);
      }
    }
    setActiveIndex(null);
    setView("create");
  };

  const tessaGenerationQuery = (workflowId: string) => `/api/grotto/generate?${new URLSearchParams({
    workflowId,
    museId: "tessa",
    ...choices,
  }).toString()}`;

  const generateTessa = async () => {
    if (!status?.generation.configured || generating) return;
    setGenerating(true);
    setNote("");
    try {
      const estimate = await readJson(await fetch("/api/grotto/generate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ museId: "tessa", choices, estimate: true }),
      }));
      const cost = typeof estimate.costBuzz === "number" ? estimate.costBuzz : null;
      if (!window.confirm(cost === null ? "Generate with Civitai?" : `Generate for about ${cost} Buzz?`)) return;

      const submitted = await readJson(await fetch("/api/grotto/generate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ museId: "tessa", choices }),
      }));
      if (typeof submitted.workflowId !== "string") throw new Error("Civitai did not return a workflow.");

      setNote("Creating…");
      for (let attempt = 0; attempt < 120; attempt += 1) {
        await sleep(attempt === 0 ? 900 : 2500);
        const result = await readJson(await fetch(tessaGenerationQuery(submitted.workflowId), { cache: "no-store" }));
        if (String(result.status).toLowerCase() === "succeeded" && Array.isArray(result.images) && result.images.length > 0) {
          await loadGallery("tessa");
          setView("gallery");
          setNote("");
          return;
        }
      }
      throw new Error("Generation is still running. Try again in a moment.");
    } catch (error) {
      setNote(error instanceof Error ? error.message : "Generation failed.");
    } finally {
      setGenerating(false);
    }
  };

  const currentStudioInput = (): StudioInput => ({
    prompt: studioPrompt.trim(),
    negativePrompt: studioNegative.trim(),
    format: studioFormat,
    quantity: studioQuantity,
  });

  const generateStudio = async () => {
    if (!status?.studio.configured || generating) return;
    const input = currentStudioInput();
    if (!input.prompt) {
      setNote("Add a prompt first.");
      return;
    }

    setGenerating(true);
    setNote("");
    try {
      const estimate = await readJson(await fetch("/api/grotto/studio/generate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ input, estimate: true }),
      }));
      const cost = typeof estimate.costBuzz === "number" ? estimate.costBuzz : null;
      const label = input.quantity === 4 ? "4 images" : "1 image";
      if (!window.confirm(cost === null ? `Generate ${label} with Pony?` : `Generate ${label} for about ${cost} Buzz?`)) return;

      const submitted = await readJson(await fetch("/api/grotto/studio/generate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ input }),
      }));
      if (typeof submitted.workflowId !== "string") throw new Error("Civitai did not return a workflow.");

      setNote("Creating…");
      for (let attempt = 0; attempt < 120; attempt += 1) {
        await sleep(attempt === 0 ? 900 : 2500);
        const result = await readJson(await fetch("/api/grotto/studio/generate", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ workflowId: submitted.workflowId, input }),
        }));
        if (String(result.status).toLowerCase() === "succeeded" && Array.isArray(result.images) && result.images.length > 0) {
          await loadGallery("studio");
          setView("gallery");
          setNote("");
          return;
        }
      }
      throw new Error("Generation is still running. Try again in a moment.");
    } catch (error) {
      setNote(error instanceof Error ? error.message : "Studio generation failed.");
    } finally {
      setGenerating(false);
    }
  };

  const locked = !statusLoading && status && !status.authenticated;
  const tessaReady = Boolean(status?.generation.configured);
  const studioReady = Boolean(status?.studio.configured);
  const studioCountOptions = status?.studio.maxImages && status.studio.maxImages < 4 ? ["1"] : ["1", "4"];

  return (
    <main className={styles.page}>
      <section className={styles.shell}>
        <header className={styles.topbar}>
          <a className={styles.back} href="/museum">← Museum</a>
          <span className={styles.mark} aria-hidden="true">◇</span>
          <div className={styles.spaceSwitch} aria-label="Grotto spaces">
            <button type="button" className={space === "tessa" ? styles.spaceActive : ""} onClick={() => void selectSpace("tessa")}>Tessa</button>
            <button type="button" className={space === "studio" ? styles.spaceActive : ""} onClick={() => void selectSpace("studio")}>Studio</button>
          </div>
        </header>

        <section className={`${styles.hero} ${space === "studio" ? styles.studioHero : ""}`} aria-label={space === "studio" ? "Grotto Studio" : "Tessa's Grotto chamber"}>
          {space === "tessa" && <img className={styles.heroImage} src="/museum/tessa.webp" alt="" />}
          <div className={styles.heroVeil} />
          <div className={styles.heroCopy}>
            <small>The Grotto</small>
            <h1>{space === "studio" ? "Studio" : "Tessa"}</h1>
            <p>{space === "studio" ? "Freestyle Pony. Nothing belongs to a Muse unless you choose it." : "A quieter room beneath the Museum."}</p>
          </div>
        </section>

        {locked ? (
          <section className={styles.create}>
            <div className={styles.createInner}>
              <p className={styles.connectionNote}>The door remains locked. Enter through the Artist Gate in the Museum.</p>
            </div>
          </section>
        ) : space === "studio" ? (
          <>
            <nav className={styles.tabs} aria-label="Studio views">
              <button type="button" className={view === "create" ? styles.active : ""} onClick={() => setView("create")}>Create</button>
              <button type="button" className={view === "gallery" ? styles.active : ""} onClick={() => setView("gallery")}>Gallery</button>
            </nav>

            {view === "create" && (
              <section className={styles.create} aria-label="Freestyle Pony Studio">
                <div className={styles.createInner}>
                  <label className={styles.studioField}>
                    <span>Prompt</span>
                    <textarea
                      value={studioPrompt}
                      onChange={(event) => setStudioPrompt(event.target.value)}
                      placeholder="1girl, adult woman, long hair, candlelight, cinematic..."
                      autoFocus
                    />
                  </label>
                  <label className={`${styles.studioField} ${styles.studioFieldSecondary}`}>
                    <span>Negative</span>
                    <textarea value={studioNegative} onChange={(event) => setStudioNegative(event.target.value)} />
                  </label>
                  <ChoiceRow label="Format" value={studioFormat} options={["Portrait", "Square", "Landscape"]} onChange={(value) => setStudioFormat(value as StudioFormat)} />
                  <ChoiceRow label="Count" value={String(studioQuantity)} options={studioCountOptions} onChange={(value) => setStudioQuantity(value === "4" ? 4 : 1)} />
                  <button className={styles.generate} type="button" disabled={!studioReady || generating || !studioPrompt.trim()} onClick={() => void generateStudio()}>
                    {generating ? "Creating…" : `Generate ${studioQuantity}`}
                  </button>
                  {!studioReady && <p className={styles.connectionNote}>Pony Studio is not connected yet.</p>}
                  {note && <p className={styles.connectionNote}>{note}</p>}
                </div>
              </section>
            )}

            {view === "gallery" && (
              <section className={styles.gallery} aria-label="Studio gallery">
                {gallery.map((item, index) => item.src ? (
                  <button className={styles.tile} type="button" key={item.id} onClick={() => setActiveIndex(index)}>
                    <img src={item.src} alt={item.alt} />
                  </button>
                ) : <div className={styles.emptyTile} key={item.id} />)}
              </section>
            )}
          </>
        ) : (
          <>
            <nav className={styles.tabs} aria-label="Tessa Grotto views">
              {(["gallery", "create", "session"] as View[]).map((item) => (
                <button type="button" key={item} className={view === item ? styles.active : ""} onClick={() => setView(item)}>{item}</button>
              ))}
            </nav>

            {view === "gallery" && (
              <section className={styles.gallery} aria-label="Tessa gallery">
                {gallery.map((item, index) => item.src ? (
                  <button className={styles.tile} type="button" key={item.id} onClick={() => setActiveIndex(index)}>
                    <img src={item.src} alt={item.alt} />
                    {item.canonical && <span className={styles.canon}>Canon</span>}
                  </button>
                ) : <div className={styles.emptyTile} key={item.id} />)}
              </section>
            )}

            {view === "create" && (
              <section className={styles.create} aria-label="Create with Tessa">
                <div className={styles.createInner}>
                  <ChoiceRow label="Mood" value={choices.mood} options={OPTIONS.mood} onChange={(value) => setChoice("mood", value)} />
                  <ChoiceRow label="Setting" value={choices.setting} options={OPTIONS.setting} onChange={(value) => setChoice("setting", value)} />
                  <ChoiceRow label="Pose" value={choices.pose} options={OPTIONS.pose} onChange={(value) => setChoice("pose", value)} />
                  <ChoiceRow label="Frame" value={choices.frame} options={OPTIONS.frame} onChange={(value) => setChoice("frame", value)} />
                  <button className={styles.generate} type="button" disabled={!tessaReady || generating} onClick={() => void generateTessa()}>{generating ? "Creating…" : "Generate"}</button>
                  {!tessaReady && <p className={styles.connectionNote}>Tessa waits for her LoRA.</p>}
                  {note && <p className={styles.connectionNote}>{note}</p>}
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
          </>
        )}

        {view !== "create" && note && <p className={styles.connectionNote}>{note}</p>}
      </section>

      {current?.src && (
        <div className={styles.lightbox} role="dialog" aria-modal="true" aria-label="Gallery viewer">
          <button className={styles.close} type="button" onClick={() => setActiveIndex(null)} aria-label="Close">×</button>
          {visibleIndices.length > 1 && <button className={styles.prev} type="button" onClick={() => moveViewer(-1)} aria-label="Previous">‹</button>}
          <img className={styles.lightboxImage} src={current.src} alt={current.alt} />
          {visibleIndices.length > 1 && <button className={styles.next} type="button" onClick={() => moveViewer(1)} aria-label="Next">›</button>}
          <div className={styles.viewerActions}>
            {current.private ? (
              <button type="button" onClick={() => void toggleFavorite()}>{current.favorite ? "Favorited" : "Favorite"}</button>
            ) : <button type="button" disabled>Canon</button>}
            <button type="button" onClick={beginRemix}>Remix</button>
            <button type="button" onClick={() => void deleteCurrent()} disabled={!current.private || current.canonical}>Delete</button>
          </div>
        </div>
      )}
    </main>
  );
}
