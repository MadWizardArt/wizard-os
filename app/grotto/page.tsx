"use client";

import { useEffect, useRef, useState } from "react";
import styles from "./grotto.module.css";

const MUSES = ["novy", "aurelia", "callista", "cleo", "lyra", "melina", "seraphine", "tessa", "thalia"] as const;
type MuseId = typeof MUSES[number];
type Space = "studio" | MuseId;
type ReferenceRole = "primary" | "pose" | "style" | "environment";
type StudioFormat = "Portrait" | "Square" | "Landscape";
type StudioInput = { prompt: string; negativePrompt: string; format: StudioFormat; quantity: 1 | 4; referenceId?: string; strength?: number };
type GalleryItem = { id: string; museId?: string; src: string; alt: string; canonical?: boolean; favorite?: boolean; private?: boolean; prompt?: string; studioInput?: StudioInput | null };
type TrayItem = GalleryItem & { role: ReferenceRole };
type GrottoStatus = { authenticated: boolean; studio: { configured: boolean; checkpointLabel: string; defaultNegative: string; maxImages: number } };

const MUSE_NAMES: Record<MuseId, string> = {
  novy: "Novy", aurelia: "Aurelia", callista: "Callista", cleo: "Cleo", lyra: "Lyra",
  melina: "Melina", seraphine: "Seraphine", tessa: "Tessa", thalia: "Thalia",
};
const ROLE_LABELS: Record<ReferenceRole, string> = { primary: "Primary", pose: "Pose", style: "Style", environment: "Environment" };
const ROLES = Object.keys(ROLE_LABELS) as ReferenceRole[];

function canonicalItem(museId: MuseId): GalleryItem {
  return { id: `canon-${museId}`, museId, src: `/museum/${museId}.webp`, alt: `${MUSE_NAMES[museId]} canonical portrait`, canonical: true, favorite: true };
}
async function readJson(response: Response) {
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(typeof payload.error === "string" ? payload.error : "The Grotto request failed.");
  return payload;
}
function sleep(ms: number) { return new Promise((resolve) => window.setTimeout(resolve, ms)); }
function ChoiceRow({ label, value, options, onChange }: { label: string; value: string; options: string[]; onChange: (value: string) => void }) {
  return <div className={styles.choiceGroup}><span>{label}</span><div className={styles.choices}>{options.map((option) => <button type="button" key={option} className={value === option ? styles.selected : ""} onClick={() => onChange(option)}>{option}</button>)}</div></div>;
}

export default function GrottoPage() {
  const viewer = useRef<HTMLDivElement>(null);
  const galleryRequest = useRef(0);
  const [space, setSpace] = useState<Space>("studio");
  const [items, setItems] = useState<GalleryItem[]>([]);
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const [status, setStatus] = useState<GrottoStatus | null>(null);
  const [statusLoading, setStatusLoading] = useState(true);
  const [note, setNote] = useState("");
  const [accessKey, setAccessKey] = useState("");
  const [tray, setTray] = useState<TrayItem[]>([]);
  const [generating, setGenerating] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [galleryPage, setGalleryPage] = useState(0);
  const [hasNext, setHasNext] = useState(false);
  const [studioPrompt, setStudioPrompt] = useState("");
  const [studioNegative, setStudioNegative] = useState("");
  const [studioFormat, setStudioFormat] = useState<StudioFormat>("Portrait");
  const [studioQuantity, setStudioQuantity] = useState<1 | 4>(1);
  const [strength, setStrength] = useState(0.35);

  const current = activeIndex === null ? null : items[activeIndex];
  const primary = tray.find((item) => item.role === "primary") ?? null;
  const isMuse = space !== "studio";

  const loadGallery = async (target: Space, page = 0) => {
    const requestId = ++galleryRequest.current;
    const limit = target === "studio" ? 16 : 15;
    const payload = await readJson(await fetch(`/api/grotto/images?museId=${target}&limit=${limit + 1}&offset=${page * limit}`, { cache: "no-store" }));
    if (requestId !== galleryRequest.current) return;
    const stored: GalleryItem[] = (Array.isArray(payload) ? payload.slice(0, limit) : []).map((item) => ({ ...item, alt: target === "studio" ? "Atelier image" : `${MUSE_NAMES[target]} gallery image`, private: true }));
    setItems(target === "studio" ? stored : [canonicalItem(target), ...stored]);
    setHasNext(Array.isArray(payload) && payload.length > limit);
    setGalleryPage(page);
  };

  useEffect(() => {
    let live = true;
    void (async () => {
      try {
        const payload = await readJson(await fetch("/api/grotto/status", { cache: "no-store" })) as GrottoStatus;
        if (!live) return;
        setStatus(payload); setStudioNegative(payload.studio.defaultNegative || "");
        if (payload.authenticated) await loadGallery("studio");
      } catch (error) { if (live) setNote(error instanceof Error ? error.message : "The Grotto could not be opened."); }
      finally { if (live) setStatusLoading(false); }
    })();
    return () => { live = false; };
  }, []);

  const selectSpace = async (next: Space) => {
    if (generating || uploading) return;
    setSpace(next); setItems([]); setActiveIndex(null); setNote("");
    if (status?.authenticated) try { await loadGallery(next); } catch (error) { setNote(error instanceof Error ? error.message : "Gallery could not be opened."); }
  };

  const putInTray = (item: GalleryItem, role: ReferenceRole, openAtelier: boolean) => {
    setTray((currentTray) => [...currentTray.filter((entry) => entry.id !== item.id && entry.role !== role), { ...item, role }].sort((a, b) => ROLES.indexOf(a.role) - ROLES.indexOf(b.role)));
    if (item.studioInput) {
      setStudioPrompt(item.studioInput.prompt || item.prompt || ""); setStudioNegative(item.studioInput.negativePrompt || status?.studio.defaultNegative || "");
      setStudioFormat(item.studioInput.format || "Portrait"); setStudioQuantity(item.studioInput.quantity === 4 ? 4 : 1);
    } else if (item.prompt) setStudioPrompt(item.prompt);
    setActiveIndex(null);
    if (openAtelier) { setSpace("studio"); void loadGallery("studio"); }
  };

  const uploadImage = async (file?: File) => {
    if (!file || generating || uploading) return;
    setUploading(true); setNote("");
    try {
      if (file.size > 3 * 1024 * 1024) throw new Error("Choose a JPG, PNG, or WebP under 3 MB.");
      const form = new FormData(); form.append("image", file); form.append("museId", space);
      const saved = await readJson(await fetch("/api/grotto/images", { method: "POST", body: form }));
      await loadGallery(space);
      if (space === "studio") setTray((currentTray) => [...currentTray.filter((entry) => entry.role !== "primary"), { ...saved, alt: "Uploaded reference", private: true, role: "primary" }]);
      setNote(space === "studio" ? "Reference added to Primary." : `Added to ${MUSE_NAMES[space]}’s gallery.`);
    } catch (error) { setNote(error instanceof Error ? error.message : "Upload failed."); }
    finally { setUploading(false); }
  };

  const toggleFavorite = async () => {
    if (!current?.private) return;
    try {
      const payload = await readJson(await fetch(`/api/grotto/images/${current.id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ favorite: !current.favorite }) }));
      setItems((currentItems) => currentItems.map((item) => item.id === current.id ? { ...item, favorite: Boolean(payload.favorite) } : item));
    } catch (error) { setNote(error instanceof Error ? error.message : "Favorite could not be changed."); }
  };
  const deleteCurrent = async () => {
    if (!current?.private || current.canonical || !window.confirm("Remove this image from the Grotto?")) return;
    try { await readJson(await fetch(`/api/grotto/images/${current.id}`, { method: "DELETE" })); setTray((t) => t.filter((item) => item.id !== current.id)); setActiveIndex(null); await loadGallery(space); }
    catch (error) { setNote(error instanceof Error ? error.message : "Image could not be removed."); }
  };

  const generateStudio = async () => {
    if (!status?.studio.configured || generating || !studioPrompt.trim()) return;
    const input: StudioInput = { prompt: studioPrompt.trim(), negativePrompt: studioNegative.trim(), format: studioFormat, quantity: studioQuantity, ...(primary ? { referenceId: primary.id, strength } : {}) };
    setGenerating(true); setNote("");
    try {
      const estimate = await readJson(await fetch("/api/grotto/studio/generate", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ input, estimate: true }) }));
      const cost = typeof estimate.costBuzz === "number" ? estimate.costBuzz : null;
      if (!window.confirm(cost === null ? `Generate ${input.quantity} image${input.quantity === 4 ? "s" : ""} with Pony?` : `Generate ${input.quantity} image${input.quantity === 4 ? "s" : ""} for about ${cost} Buzz?`)) return;
      const submitted = await readJson(await fetch("/api/grotto/studio/generate", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ input }) }));
      if (typeof submitted.workflowId !== "string") throw new Error("Civitai did not return a workflow.");
      setNote("Creating…");
      for (let attempt = 0; attempt < 120; attempt += 1) {
        await sleep(attempt === 0 ? 900 : 2500);
        const result = await readJson(await fetch("/api/grotto/studio/generate", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ workflowId: submitted.workflowId, input }) }));
        if (String(result.status).toLowerCase() === "succeeded" && Array.isArray(result.images) && result.images.length) { await loadGallery("studio"); setNote("Saved to your Atelier collection."); return; }
      }
      throw new Error("Generation is still running. Keep the workflow ID for recovery: " + submitted.workflowId);
    } catch (error) { setNote(error instanceof Error ? error.message : "Atelier generation failed."); }
    finally { setGenerating(false); }
  };

  const unlock = async (event: React.FormEvent) => {
    event.preventDefault();
    try { await readJson(await fetch("/api/museum/artist-session", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ accessKey }) })); setAccessKey(""); const nextStatus = await readJson(await fetch("/api/grotto/status", { cache: "no-store" })); setStatus(nextStatus); setNote(""); await loadGallery(space); }
    catch (error) { setNote(error instanceof Error ? error.message : "Unable to unlock."); }
  };

  const locked = !statusLoading && status && !status.authenticated;
  const studioCountOptions = status?.studio.maxImages && status.studio.maxImages < 4 ? ["1"] : ["1", "4"];
  const title = isMuse ? MUSE_NAMES[space] : "The Atelier";

  return <main className={styles.page} aria-busy={statusLoading}><section className={styles.shell}>
    <header className={styles.topbar}><a className={styles.back} href="/museum">← Museum</a><span className={styles.mark}>◇</span><button className={styles.galleryMenuButton} type="button" onClick={() => void selectSpace(isMuse ? "studio" : "novy")}>{isMuse ? "The Atelier" : "Muse Galleries"}</button></header>
    <section className={`${styles.hero} ${!isMuse ? styles.studioHero : ""}`} aria-label={`${title} in the Grotto`}>
      {isMuse && <img className={styles.heroImage} src={`/museum/${space}.webp`} alt=""/>}<div className={styles.heroVeil}/><div className={styles.heroCopy}><small>The Grotto</small><h1>{title}</h1>{isMuse && <p>Approved references and visual studies. The gallery supports the Muse’s canon; it does not replace it.</p>}</div>
    </section>

    {statusLoading ? <p className={styles.connectionNote}>Opening the Grotto…</p> : locked ? <section className={styles.create}><div className={styles.createInner}><form onSubmit={unlock} className={styles.unlock}><label className={styles.studioField}><span>Artist key</span><input type="password" autoComplete="current-password" value={accessKey} onChange={(event) => setAccessKey(event.target.value)} required/></label><button className={styles.generate}>Unlock the Grotto</button><p className={styles.connectionNote}>{note}</p></form></div></section> : <>
      <nav className={styles.galleryRail} aria-label="Grotto spaces"><button type="button" className={!isMuse ? styles.galleryRailActive : ""} onClick={() => void selectSpace("studio")}>Atelier</button>{MUSES.map((muse) => <button type="button" key={muse} className={space === muse ? styles.galleryRailActive : ""} onClick={() => void selectSpace(muse)}><img src={`/museum/${muse}.webp`} alt=""/><span>{MUSE_NAMES[muse]}</span></button>)}</nav>

      {!isMuse ? <div className={styles.atelierLayout}>
        <section className={styles.composer}><div className={styles.createInner}><div className={styles.sectionHeading}><h2>Create</h2><span>{status?.studio.checkpointLabel || "Pony checkpoint"}</span></div><fieldset disabled={generating || uploading} className={styles.controls}>
          <div className={styles.referenceTray}><div className={styles.trayHeading}><span>Reference tray</span><small>Primary guides the current remix.</small></div><div className={styles.traySlots}>{ROLES.map((role) => { const item = tray.find((entry) => entry.role === role); return <div className={`${styles.traySlot} ${item ? styles.traySlotFilled : ""}`} key={role}><span>{ROLE_LABELS[role]}</span>{item ? <><img src={item.src} alt={item.alt}/><small>{item.museId ? MUSE_NAMES[item.museId as MuseId] : "Atelier"}</small><button type="button" aria-label={`Remove ${ROLE_LABELS[role]} reference`} onClick={() => setTray((t) => t.filter((entry) => entry.role !== role))}>×</button></> : <em>Empty</em>}</div>; })}</div>
            <label className={styles.trayUpload}>+ Upload to Primary<input type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => { void uploadImage(event.target.files?.[0]); event.target.value = ""; }}/></label>{primary && <label className={styles.strength}>Variation · {Math.round(strength * 100)}%<input type="range" min="0.05" max="0.9" step="0.05" value={strength} onChange={(event) => setStrength(Number(event.target.value))}/><small>Lower keeps more of the Primary image.</small></label>}
          </div>
          <label className={styles.studioField}><span>Prompt</span><textarea value={studioPrompt} onChange={(event) => setStudioPrompt(event.target.value)} placeholder={primary ? "Describe how you want to reinterpret the primary reference…" : "Describe a scene, or enter your Pony tags…"}/></label>
          <details className={styles.advanced}><summary>Negative prompt</summary><label className={`${styles.studioField} ${styles.studioFieldSecondary}`}><span>Negative</span><textarea value={studioNegative} onChange={(event) => setStudioNegative(event.target.value)}/></label></details>
          <ChoiceRow label="Format" value={studioFormat} options={["Portrait", "Square", "Landscape"]} onChange={(value) => setStudioFormat(value as StudioFormat)}/><ChoiceRow label="Count" value={String(studioQuantity)} options={studioCountOptions} onChange={(value) => setStudioQuantity(value === "4" ? 4 : 1)}/>
          <button className={styles.generate} type="button" disabled={!status?.studio.configured || generating || uploading || !studioPrompt.trim()} onClick={() => void generateStudio()}>{generating ? "Creating…" : uploading ? "Uploading…" : `${primary ? "Remix" : "Generate"} ${studioQuantity}`}</button>
        </fieldset>{!status?.studio.configured && <p className={styles.connectionNote}>The Atelier is not connected yet.</p>}{note && <p className={styles.connectionNote}>{note}</p>}</div></section>
        <section className={styles.collection}><div className={styles.sectionHeading}><h2>Your collection</h2><span>Page {galleryPage + 1}</span></div><div className={styles.gallery}>{items.map((item, index) => <button className={styles.tile} type="button" key={item.id} onClick={() => setActiveIndex(index)}><img src={item.src} alt={item.alt} loading="lazy"/>{item.favorite && <span className={styles.canon}>♥</span>}</button>)}</div>{!items.length && <div className={styles.emptyCollection}><span>◇</span><p>Your next image begins here.</p><small>Generate a scene or choose a Muse reference.</small></div>}<div className={styles.pagination}><button type="button" disabled={galleryPage === 0} onClick={() => void loadGallery(space, galleryPage - 1)}>← Previous</button><button type="button" disabled={!hasNext} onClick={() => void loadGallery(space, galleryPage + 1)}>Next →</button></div></section>
      </div> : <section className={styles.museGallerySection}><div className={styles.galleryToolbar}><div><h2>{MUSE_NAMES[space]} Gallery</h2><p>Choose an image for the Atelier or add an approved reference.</p></div><label className={styles.galleryUpload}>+ Add image<input type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => { void uploadImage(event.target.files?.[0]); event.target.value = ""; }}/></label></div><div className={styles.gallery}>{items.map((item, index) => <button className={styles.tile} type="button" key={item.id} onClick={() => setActiveIndex(index)}><img src={item.src} alt={item.alt} loading="lazy"/>{item.canonical && <span className={styles.canon}>Canon</span>}{item.favorite && !item.canonical && <span className={styles.canon}>♥</span>}</button>)}</div>{note && <p className={styles.connectionNote}>{note}</p>}</section>}
    </>}
  </section>
  {current && <div ref={viewer} className={styles.lightbox} role="dialog" aria-modal="true" aria-label="Gallery viewer"><button className={styles.close} type="button" onClick={() => setActiveIndex(null)} aria-label="Close">×</button><img className={styles.lightboxImage} src={current.src} alt={current.alt}/><div className={styles.viewerProvenance}>{current.museId ? `${MUSE_NAMES[current.museId as MuseId]} Gallery` : "Atelier Collection"}{current.canonical ? " · Canonical reference" : ""}</div><div className={styles.viewerActions}>{current.private && <button type="button" onClick={() => void toggleFavorite()}>{current.favorite ? "Favorited" : "Favorite"}</button>}{ROLES.map((role) => <button type="button" key={role} onClick={() => putInTray(current, role, role === "primary")}>{role === "primary" ? "Remix in Atelier" : `Use as ${ROLE_LABELS[role]}`}</button>)}<a href={current.src} download={`grotto-${current.id}`}>Download</a>{current.private && <button type="button" onClick={() => void deleteCurrent()}>Delete</button>}</div></div>}
  </main>;
}
