"use client";

import { useEffect, useMemo, useRef, useState } from "react";
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
  referenceId?: string;
  strength?: number;
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
  const galleryRequest = useRef(0);
  const viewer = useRef<HTMLDivElement>(null);
  const [space, setSpace] = useState<Space>("studio");
  const [view, setView] = useState<View>("create");
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
  const [reference, setReference] = useState<{ id: string; src: string } | null>(null);
  const [strength, setStrength] = useState(0.35);
  const [uploading, setUploading] = useState(false);
  const [galleryPage, setGalleryPage] = useState(0);
  const [hasNext, setHasNext] = useState(false);
  const [accessKey, setAccessKey] = useState("");
  const [studioPrompt, setStudioPrompt] = useState("");
  const [studioNegative, setStudioNegative] = useState("");
  const [studioFormat, setStudioFormat] = useState<StudioFormat>("Portrait");
  const [studioQuantity, setStudioQuantity] = useState<1 | 4>(1);

  const gallery = useMemo<GalleryItem[]>(() => {
    const stored = privateGallery.slice(0, space === "tessa" ? 15 : 16).map((item) => ({
      ...item,
      alt: space === "tessa" ? "Tessa" : "Atelier image",
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

  const loadGallery = async (target: Space, page = 0) => {
    const requestId = ++galleryRequest.current;
    const limit = target === "tessa" ? 15 : 16;
    const payload = await readJson(await fetch(`/api/grotto/images?museId=${target}&limit=${limit + 1}&offset=${page * limit}`, { cache: "no-store" }));
    if (requestId !== galleryRequest.current) return;
    setPrivateGallery(Array.isArray(payload) ? payload.slice(0, limit) : []);
    setHasNext(Array.isArray(payload) && payload.length > limit);
    setGalleryPage(page);
  };

  useEffect(() => {
    let live = true;
    void (async () => {
      try {
        const payload = await readJson(await fetch("/api/grotto/status", { cache: "no-store" })) as GrottoStatus;
        if (!live) return;
        setStatus(payload);
        setStudioNegative((currentValue) => currentValue || payload.studio.defaultNegative || "");

        const initialSpace: Space = "studio";
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
    if (generating || uploading) return;
    setPrivateGallery([]);
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
    const previousFocus = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    viewer.current?.querySelector<HTMLButtonElement>("button")?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Tab") {
        const elements = viewer.current?.querySelectorAll<HTMLElement>("button:not(:disabled), a[href]");
        if (elements?.length) {
          const first = elements[0], last = elements[elements.length - 1];
          if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
          else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
        }
      }
      if (event.key === "Escape") setActiveIndex(null);
      if (event.key === "ArrowLeft") moveViewer(-1);
      if (event.key === "ArrowRight") moveViewer(1);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => { window.removeEventListener("keydown", onKeyDown); document.body.style.overflow = previousOverflow; previousFocus?.focus(); };
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

  const beginRemix = (useImage = true) => {
    if (!current || generating) return;
    if (useImage && current.private && current.src) setReference({ id: current.id, src: current.src });
    else setReference(null);
    if (space !== "studio") { setPrivateGallery([]); void loadGallery("studio").catch(() => setNote("Gallery could not be loaded.")); }
    setSpace("studio");
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
    setNote("");
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
    ...(reference ? { referenceId: reference.id, strength } : {}),
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
      if (!window.confirm(cost === null ? `Generate ${label} with Pony?${reference ? " Your reference will be sent to Civitai." : ""}` : `Generate ${label} for about ${cost} Buzz?${reference ? " Your reference will be sent to Civitai." : ""}`)) return;

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
          setNote("Saved to your gallery.");
          return;
        }
      }
      throw new Error("Generation is still running. Keep the workflow ID for recovery: " + submitted.workflowId);
    } catch (error) {
      setNote(error instanceof Error ? error.message : "Atelier generation failed.");
    } finally {
      setGenerating(false);
    }
  };

  const uploadReference = async (file?: File) => {
    if (!file || generating) return;
    setUploading(true); setNote("");
    try {
      if (file.size > 3 * 1024 * 1024) throw new Error("Choose a JPG, PNG, or WebP under 3 MB.");
      const form = new FormData(); form.append("image", file);
      const saved = await readJson(await fetch("/api/grotto/images", { method: "POST", body: form }));
      setReference({ id: saved.id, src: saved.src });
      await loadGallery("studio");
    } catch (error) { setNote(error instanceof Error ? error.message : "Upload failed."); }
    finally { setUploading(false); }
  };
  const changePage = async (page: number) => {
    try { await loadGallery(space, page); }
    catch (error) { setNote(error instanceof Error ? error.message : "Gallery could not be loaded."); }
  };
  const unlock = async (event: React.FormEvent) => {
    event.preventDefault();
    try {
      await readJson(await fetch("/api/museum/artist-session", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ accessKey }) }));
      setAccessKey("");
      const nextStatus = await readJson(await fetch("/api/grotto/status", { cache: "no-store" }));
      setStatus(nextStatus); setNote(""); await loadGallery(space);
    } catch (error) { setNote(error instanceof Error ? error.message : "Unable to unlock."); }
  };

  const locked = !statusLoading && status && !status.authenticated;
  const tessaReady = Boolean(status?.generation.configured);
  const studioReady = Boolean(status?.studio.configured);
  const studioCountOptions = status?.studio.maxImages && status.studio.maxImages < 4 ? ["1"] : ["1", "4"];

  return (
    <main className={styles.page} aria-busy={statusLoading}>
      <section className={styles.shell}>
        <header className={styles.topbar}>
          <a className={styles.back} href="/museum">← Museum</a>
          <span className={styles.mark} aria-hidden="true">◇</span>
          <div className={styles.spaceSwitch} aria-label="Grotto spaces">
            <button disabled={generating || uploading} type="button" className={space === "tessa" ? styles.spaceActive : ""} onClick={() => void selectSpace("tessa")}>Tessa</button>
            <button disabled={generating || uploading} type="button" className={space === "studio" ? styles.spaceActive : ""} onClick={() => void selectSpace("studio")}>The Atelier</button>
          </div>
        </header>

        <section className={`${styles.hero} ${space === "studio" ? styles.studioHero : ""}`} aria-label={space === "studio" ? "The Atelier" : "Tessa's Grotto chamber"}>
          {space === "tessa" && <img className={styles.heroImage} src="/museum/tessa.webp" alt="" />}
          <div className={styles.heroVeil} />
          <div className={styles.heroCopy}>
            <small>The Grotto</small>
            <h1>{space === "studio" ? "The Atelier" : "Tessa"}</h1>

          </div>
        </section>

        {statusLoading ? <p className={styles.connectionNote}>Opening the Grotto…</p> : locked ? (
          <section className={styles.create}>
            <div className={styles.createInner}>
              <form onSubmit={unlock} className={styles.unlock}>
                <label className={styles.studioField}><span>Artist key</span><input type="password" autoComplete="current-password" value={accessKey} onChange={(event) => setAccessKey(event.target.value)} required /></label>
                <button className={styles.generate}>Unlock the Grotto</button>
                <p role="status" className={styles.connectionNote}>{note}</p>
              </form>
            </div>
          </section>
        ) : space === "studio" ? (
          <>
            <div className={styles.atelierLayout}>
              <section className={styles.composer} aria-label="Create in The Atelier">
                <div className={styles.createInner}>
                  <div className={styles.sectionHeading}><h2>Create</h2><span>Pony Realism</span></div>
                  <fieldset disabled={generating || uploading} className={styles.controls}>
                  <div className={styles.reference}>
                    {reference ? <>
                      <img src={reference.src} alt="Selected remix reference" />
                      <button type="button" onClick={() => setReference(null)}>Remove reference</button>
                      <label className={styles.strength}>Variation · {Math.round(strength * 100)}%<input type="range" min="0.05" max="0.9" step="0.05" value={strength} onChange={(event) => setStrength(Number(event.target.value))} /></label>
                      <small>Lower keeps more of the original.</small>
                    </> : <label className={styles.upload}>+ Add reference<input type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => { void uploadReference(event.target.files?.[0]); event.target.value = ""; }} /><small>One JPG, PNG or WebP · up to 3 MB</small></label>}
                  </div>
                  <label className={styles.studioField}>
                    <span>Prompt</span>
                    <textarea
                      value={studioPrompt}
                      onChange={(event) => setStudioPrompt(event.target.value)}
                      placeholder={reference ? "Describe the image you want to create…" : "Describe a scene, or enter your Pony tags…"}
                    />
                  </label>
                  <details className={styles.advanced}><summary>Negative prompt</summary>
                  <label className={`${styles.studioField} ${styles.studioFieldSecondary}`}>
                    <span>Negative</span>
                    <textarea value={studioNegative} onChange={(event) => setStudioNegative(event.target.value)} />
                  </label>
                  </details>
                  <ChoiceRow label="Format" value={studioFormat} options={["Portrait", "Square", "Landscape"]} onChange={(value) => setStudioFormat(value as StudioFormat)} />
                  <ChoiceRow label="Count" value={String(studioQuantity)} options={studioCountOptions} onChange={(value) => setStudioQuantity(value === "4" ? 4 : 1)} />
                  <button className={styles.generate} type="button" disabled={!studioReady || generating || uploading || !studioPrompt.trim()} onClick={() => void generateStudio()}>
                    {generating ? "Creating…" : uploading ? "Uploading…" : `${reference ? "Remix" : "Generate"} ${studioQuantity}`}
                  </button>
                  </fieldset>
                  {!studioReady && <p className={styles.connectionNote}>The Atelier is not connected yet.</p>}
                  {note && <p role="status" className={styles.connectionNote}>{note}</p>}
                </div>
              </section>
              <section className={styles.collection} aria-label="Atelier gallery">
                <div className={styles.sectionHeading}><h2>Your collection</h2><span>Page {galleryPage + 1}</span></div>
                <div className={styles.gallery}>
                {gallery.filter((item) => item.src).map((item) => (
                  <button className={styles.tile} type="button" key={item.id} onClick={() => setActiveIndex(gallery.findIndex((entry) => entry.id === item.id))}>
                    <img src={item.src!} alt={item.alt} loading="lazy" />
                    {item.favorite && <span className={styles.canon}>♥</span>}
                  </button>
                ))}
                </div>
                {!visibleIndices.length && <div className={styles.emptyCollection}><span>◇</span><p>Your next image begins here.</p><small>Generate a scene or add a reference.</small></div>}
                <div className={styles.pagination}>
                  <button type="button" disabled={galleryPage === 0 || generating || uploading} onClick={() => void changePage(galleryPage - 1)}>← Previous</button>
                  <button type="button" disabled={!hasNext || generating || uploading} onClick={() => void changePage(galleryPage + 1)}>Next →</button>
                </div>
              </section>
            </div>
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
                  {note && <p role="status" className={styles.connectionNote}>{note}</p>}
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
        <div ref={viewer} className={styles.lightbox} role="dialog" aria-modal="true" aria-label="Gallery viewer">
          <button className={styles.close} type="button" onClick={() => setActiveIndex(null)} aria-label="Close">×</button>
          {visibleIndices.length > 1 && <button className={styles.prev} type="button" onClick={() => moveViewer(-1)} aria-label="Previous">‹</button>}
          <img className={styles.lightboxImage} src={current.src} alt={current.alt} />
          {visibleIndices.length > 1 && <button className={styles.next} type="button" onClick={() => moveViewer(1)} aria-label="Next">›</button>}
          <div className={styles.viewerActions}>
            {current.private ? (
              <button type="button" onClick={() => void toggleFavorite()}>{current.favorite ? "Favorited" : "Favorite"}</button>
            ) : <button type="button" disabled>Canon</button>}
            {current.private && <button type="button" disabled={generating} onClick={() => beginRemix(true)}>Remix image</button>}
            {current.prompt && <button type="button" disabled={generating} onClick={() => beginRemix(false)}>Reuse prompt</button>}
            <a href={current.src} download={`atelier-${current.id}`}>Download</a>
            <button type="button" onClick={() => void deleteCurrent()} disabled={generating || !current.private || current.canonical}>Delete</button>
          </div>
        </div>
      )}
    </main>
  );
}
