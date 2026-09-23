"use client";

import { useEffect, useRef, useState } from "react";
import styles from "./grotto.module.css";

const MUSES = ["novy", "aurelia", "callista", "cleo", "lyra", "melina", "seraphine", "tessa", "thalia"] as const;
type MuseId = typeof MUSES[number];
type Space = "studio" | "favorites" | MuseId;
type ReferenceRole = "primary" | "pose" | "style" | "environment";
type StudioFormat = "Portrait" | "Square" | "Landscape";
type EnvironmentId = "pony-v6" | "pony-realism";
type LoraSelection = { id: string; weight: number };
type StudioInput = { environmentId: EnvironmentId; prompt: string; negativePrompt: string; format: StudioFormat; quantity: 1 | 4; referenceId?: string; strength?: number; loras?: LoraSelection[]; embeddings?: string[] };
type GalleryItem = { id: string; museId?: string; src: string; alt: string; canonical?: boolean; favorite?: boolean; private?: boolean; prompt?: string; studioInput?: StudioInput | null };
type TrayItem = GalleryItem & { role: ReferenceRole };
type StudioEnvironment = { id: EnvironmentId; label: string; family: string; configured: boolean };
type StudioLora = { id: string; label: string; compatibility: EnvironmentId | "both"; category: string; defaultWeight: number; minWeight: number; maxWeight: number; triggerWords: string[]; configured: boolean };
type StudioEmbedding = { id: string; label: string; compatibility: EnvironmentId | "both"; triggerWord: string; configured: boolean };
type GrottoStatus = { authenticated: boolean; storage: { provider: "vercel-blob"; configured: boolean }; studio: { configured: boolean; checkpointLabel: string; defaultEnvironmentId: EnvironmentId; defaultPrompts: Partial<Record<EnvironmentId, string>>; defaultNegativePrompts: Partial<Record<EnvironmentId, string>>; environments: StudioEnvironment[]; loras: StudioLora[]; embeddings: StudioEmbedding[]; maxLoras: number; defaultNegative: string; maxImages: number } };

const MUSE_NAMES: Record<MuseId, string> = { novy: "Novy", aurelia: "Aurelia", callista: "Callista", cleo: "Cleo", lyra: "Lyra", melina: "Melina", seraphine: "Seraphine", tessa: "Tessa", thalia: "Thalia" };
const ROLE_LABELS: Record<ReferenceRole, string> = { primary: "Primary", pose: "Pose", style: "Style", environment: "Environment" };
const GENERATOR_CATALOG: Array<Pick<StudioEnvironment, "id" | "label" | "family">> = [
  { id: "pony-realism", label: "Pony Realism", family: "pony-sdxl" },
  { id: "pony-v6", label: "Pony Diffusion V6 XL", family: "pony-sdxl" },
];
const ROLES = Object.keys(ROLE_LABELS) as ReferenceRole[];
function canonicalItem(museId: MuseId): GalleryItem { return { id: `canon-${museId}`, museId, src: `/museum/${museId}.webp`, alt: `${MUSE_NAMES[museId]} canonical portrait`, canonical: true, favorite: true }; }
async function readJson(response: Response) { const payload = await response.json().catch(() => ({})); if (!response.ok) throw new Error(typeof payload.error === "string" ? payload.error : "The Grotto request failed."); return payload; }
function sleep(ms: number) { return new Promise((resolve) => window.setTimeout(resolve, ms)); }
function ChoiceRow({ label, value, options, onChange }: { label: string; value: string; options: string[]; onChange: (value: string) => void }) { return <div className={styles.choiceGroup}><span>{label}</span><div className={styles.choices}>{options.map((option) => <button type="button" key={option} className={value === option ? styles.selected : ""} onClick={() => onChange(option)}>{option}</button>)}</div></div>; }
function loraFitsEnvironment(lora: StudioLora, environmentId: EnvironmentId) { return lora.compatibility === "both" || lora.compatibility === environmentId; }
function embeddingFitsEnvironment(embedding: StudioEmbedding, environmentId: EnvironmentId) { return embedding.compatibility === "both" || embedding.compatibility === environmentId; }
function preferredEnvironment(studio: GrottoStatus["studio"]): EnvironmentId { return studio.environments.find((environment) => environment.id === "pony-realism" && environment.configured)?.id ?? studio.defaultEnvironmentId ?? "pony-v6"; }
function itemMuseId(item: GalleryItem | null | undefined): MuseId | null { const museId = item?.museId; return museId && MUSES.includes(museId as MuseId) ? museId as MuseId : null; }
function itemOriginLabel(item: GalleryItem) { const museId = itemMuseId(item); return museId ? MUSE_NAMES[museId] : "Atelier"; }

export default function GrottoPage() {
  const viewer = useRef<HTMLDivElement>(null); const galleryRequest = useRef(0); const loadMoreSentinel = useRef<HTMLDivElement>(null); const loadMoreBusy = useRef(false); const swipeStart = useRef<number | null>(null);
  const [space, setSpace] = useState<Space>("studio"); const [items, setItems] = useState<GalleryItem[]>([]); const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const [status, setStatus] = useState<GrottoStatus | null>(null); const [statusLoading, setStatusLoading] = useState(true); const [note, setNote] = useState(""); const [accessKey, setAccessKey] = useState("");
  const [tray, setTray] = useState<TrayItem[]>([]); const [generating, setGenerating] = useState(false); const [uploading, setUploading] = useState(false); const [galleryPage, setGalleryPage] = useState(0); const [hasNext, setHasNext] = useState(false); const [loadingMore, setLoadingMore] = useState(false);
  const [migratingStorage, setMigratingStorage] = useState(false);
  const [headerSrc, setHeaderSrc] = useState<string | null>(null); const [selecting, setSelecting] = useState(false); const [selectedIds, setSelectedIds] = useState<string[]>([]); const [moveTarget, setMoveTarget] = useState<"studio" | MuseId | "">(""); const [viewerTarget, setViewerTarget] = useState<"studio" | MuseId | "">(""); const [managing, setManaging] = useState(false); const [recentlyDeleted, setRecentlyDeleted] = useState<string[]>([]);
  const [studioEnvironment, setStudioEnvironment] = useState<EnvironmentId>("pony-realism"); const [studioPrompt, setStudioPrompt] = useState(""); const [studioNegative, setStudioNegative] = useState(""); const [studioFormat, setStudioFormat] = useState<StudioFormat>("Portrait"); const [studioQuantity, setStudioQuantity] = useState<1 | 4>(1); const [strength, setStrength] = useState(0.35); const [studioLoras, setStudioLoras] = useState<LoraSelection[]>([]); const [studioEmbeddings, setStudioEmbeddings] = useState<string[]>([]);
  const current = activeIndex === null ? null : items[activeIndex]; const primary = tray.find((item) => item.role === "primary") ?? null; const isMuse = MUSES.includes(space as MuseId); const isFavorites = space === "favorites";
  const availableEnvironments: StudioEnvironment[] = GENERATOR_CATALOG.map((generator) => ({ ...generator, configured: status?.studio.environments.find((environment) => environment.id === generator.id)?.configured ?? false }));
  const selectedEnvironment = availableEnvironments.find((environment) => environment.id === studioEnvironment);
  const compatibleLoras = (status?.studio.loras ?? []).filter((lora) => lora.configured && loraFitsEnvironment(lora, studioEnvironment));
  const compatibleEmbeddings = (status?.studio.embeddings ?? []).filter((embedding) => embedding.configured && embeddingFitsEnvironment(embedding, studioEnvironment));
  const maxLoras = status?.studio.maxLoras ?? 8;
  const selectEnvironment = (environmentId: EnvironmentId) => { const previousDefault = status?.studio.defaultPrompts?.[studioEnvironment] ?? ""; const nextDefault = status?.studio.defaultPrompts?.[environmentId] ?? ""; const previousNegativeDefault = status?.studio.defaultNegativePrompts?.[studioEnvironment] ?? status?.studio.defaultNegative ?? ""; const nextNegativeDefault = status?.studio.defaultNegativePrompts?.[environmentId] ?? status?.studio.defaultNegative ?? ""; setStudioEnvironment(environmentId); setStudioPrompt((current) => !current.trim() || current === previousDefault ? nextDefault : current); setStudioNegative((current) => !current.trim() || current === previousNegativeDefault ? nextNegativeDefault : current); setStudioLoras((current) => current.filter((selection) => { const lora = status?.studio.loras.find((item) => item.id === selection.id); return Boolean(lora && lora.configured && loraFitsEnvironment(lora, environmentId)); })); setStudioEmbeddings((current) => current.filter((id) => { const embedding = status?.studio.embeddings.find((item) => item.id === id); return Boolean(embedding && embedding.configured && embeddingFitsEnvironment(embedding, environmentId)); })); };
  const toggleLora = (lora: StudioLora) => { setStudioLoras((current) => { const exists = current.some((selection) => selection.id === lora.id); if (exists) return current.filter((selection) => selection.id !== lora.id); if (current.length >= maxLoras) { setNote(`The Atelier supports at most ${maxLoras} active LoRAs.`); return current; } setNote(""); return [...current, { id: lora.id, weight: lora.defaultWeight }]; }); };
  const setLoraWeight = (id: string, weight: number) => { setStudioLoras((current) => current.map((selection) => selection.id === id ? { ...selection, weight } : selection)); };
  const toggleEmbedding = (id: string) => setStudioEmbeddings((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);

  const loadGallery = async (target: Space, page = 0, append = false) => {
    if (append && loadMoreBusy.current) return 0;
    if (append) { loadMoreBusy.current = true; setLoadingMore(true); }
    const requestId = ++galleryRequest.current;
    const limit = target === "studio" || target === "favorites" ? 16 : 15;
    try {
      const payload = await readJson(await fetch(`/api/grotto/images?museId=${target}&limit=${limit + 1}&offset=${page * limit}`, { cache: "no-store" }));
      if (requestId !== galleryRequest.current) return 0;
      const stored: GalleryItem[] = (Array.isArray(payload) ? payload.slice(0, limit) : []).map((item) => ({ ...item, alt: item.museId && MUSES.includes(item.museId as MuseId) ? `${MUSE_NAMES[item.museId as MuseId]} gallery image` : "Atelier image", private: true }));
      setItems((currentItems) => {
        if (!append) return target === "studio" || target === "favorites" ? stored : [canonicalItem(target), ...stored];
        const existing = new Set(currentItems.map((item) => item.id));
        return [...currentItems, ...stored.filter((item) => !existing.has(item.id))];
      });
      setHasNext(Array.isArray(payload) && payload.length > limit);
      setGalleryPage(page);
      return stored.length;
    } finally {
      if (append) { loadMoreBusy.current = false; setLoadingMore(false); }
    }
  };

  useEffect(() => { let live = true; void (async () => { try { const payload = await readJson(await fetch("/api/grotto/status", { cache: "no-store" })) as GrottoStatus; if (!live) return; const requested = new URLSearchParams(window.location.search).get("muse"); const initialSpace: Space = requested === "favorites" ? "favorites" : requested && MUSES.includes(requested as MuseId) ? requested as MuseId : "studio"; const environmentId = preferredEnvironment(payload.studio); setSpace(initialSpace); setStatus(payload); setStudioNegative(payload.studio.defaultNegativePrompts?.[environmentId] ?? payload.studio.defaultNegative ?? ""); setStudioEnvironment(environmentId); setStudioPrompt(payload.studio.defaultPrompts?.[environmentId] ?? ""); if (payload.authenticated) { await loadGallery(initialSpace); if (MUSES.includes(initialSpace as MuseId)) { const header = await readJson(await fetch(`/api/grotto/headers/${initialSpace}`, { cache: "no-store" })); if (live) setHeaderSrc(header?.src ?? null); } } } catch (error) { if (live) setNote(error instanceof Error ? error.message : "The Grotto could not be opened."); } finally { if (live) setStatusLoading(false); } })(); return () => { live = false; }; }, []);
  const loadHeader = async (museId: MuseId) => { const payload = await readJson(await fetch(`/api/grotto/headers/${museId}`, { cache: "no-store" })); setHeaderSrc(payload?.src ?? null); };
  const selectSpace = async (next: Space) => { if (generating || uploading || managing) return; loadMoreBusy.current = false; setLoadingMore(false); setSpace(next); setItems([]); setActiveIndex(null); setSelecting(false); setSelectedIds([]); setMoveTarget(""); setViewerTarget(""); setHeaderSrc(null); setNote(""); if (status?.authenticated) try { await Promise.all([loadGallery(next), ...(MUSES.includes(next as MuseId) ? [loadHeader(next as MuseId)] : [])]); } catch (error) { setNote(error instanceof Error ? error.message : "Gallery could not be opened."); } };
  useEffect(() => {
    const sentinel = loadMoreSentinel.current;
    if (!sentinel || !status?.authenticated || !hasNext || loadingMore || generating || uploading) return;
    const observer = new IntersectionObserver((entries) => {
      if (!entries[0]?.isIntersecting || loadMoreBusy.current) return;
      void loadGallery(space, galleryPage + 1, true).catch((error) => setNote(error instanceof Error ? error.message : "More images could not be loaded."));
    }, { rootMargin: "600px 0px" });
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [space, galleryPage, hasNext, loadingMore, generating, uploading, status?.authenticated]);

  const browseViewer = async (direction: -1 | 1) => {
    if (activeIndex === null) return;
    const targetIndex = activeIndex + direction;
    if (targetIndex >= 0 && targetIndex < items.length) {
      setActiveIndex(targetIndex);
      return;
    }
    if (direction === 1 && hasNext && !loadMoreBusy.current) {
      const previousLength = items.length;
      try {
        const loaded = await loadGallery(space, galleryPage + 1, true);
        if (loaded && loaded > 0) setActiveIndex(previousLength);
      } catch (error) {
        setNote(error instanceof Error ? error.message : "More images could not be loaded.");
      }
    }
  };

  useEffect(() => {
    if (activeIndex === null) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "ArrowLeft") { event.preventDefault(); void browseViewer(-1); }
      if (event.key === "ArrowRight") { event.preventDefault(); void browseViewer(1); }
      if (event.key === "Escape") { event.preventDefault(); setActiveIndex(null); }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [activeIndex, items.length, hasNext, galleryPage, space]);

  const putInTray = (item: GalleryItem, role: ReferenceRole, openAtelier: boolean) => { setTray((currentTray) => [...currentTray.filter((entry) => entry.id !== item.id && entry.role !== role), { ...item, role }].sort((a, b) => ROLES.indexOf(a.role) - ROLES.indexOf(b.role))); if (item.studioInput) { setStudioEnvironment(item.studioInput.environmentId || "pony-v6"); setStudioPrompt(item.studioInput.prompt || item.prompt || ""); setStudioNegative(item.studioInput.negativePrompt || status?.studio.defaultNegative || ""); setStudioFormat(item.studioInput.format || "Portrait"); setStudioQuantity(item.studioInput.quantity === 4 ? 4 : 1); setStudioLoras(Array.isArray(item.studioInput.loras) ? item.studioInput.loras : []); setStudioEmbeddings(Array.isArray(item.studioInput.embeddings) ? item.studioInput.embeddings : []); } else if (item.prompt) setStudioPrompt(item.prompt); setActiveIndex(null); if (openAtelier) { setSpace("studio"); void loadGallery("studio"); } };
  const uploadImage = async (file?: File) => { if (!file || generating || uploading || isFavorites) return; setUploading(true); setNote(""); try { if (file.size > 3 * 1024 * 1024) throw new Error("Choose a JPG, PNG, or WebP under 3 MB."); const form = new FormData(); form.append("image", file); form.append("museId", space); const saved = await readJson(await fetch("/api/grotto/images", { method: "POST", body: form })); await loadGallery(space); if (space === "studio") setTray((currentTray) => [...currentTray.filter((entry) => entry.role !== "primary"), { ...saved, alt: "Uploaded reference", private: true, role: "primary" }]); setNote(space === "studio" ? "Reference added to Primary." : `Added to ${MUSE_NAMES[space]}’s gallery.`); } catch (error) { setNote(error instanceof Error ? error.message : "Upload failed."); } finally { setUploading(false); } };
  const toggleFavorite = async () => {
    if (!current?.private || managing) return;
    const image = current;
    try {
      const payload = await readJson(await fetch(`/api/grotto/images/${image.id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ favorite: !image.favorite }) }));
      setItems((existing) => existing.map((item) => item.id === image.id ? { ...item, favorite: Boolean(payload.favorite) } : item));
      if (isFavorites && !payload.favorite) { setActiveIndex(null); await loadGallery(space); }
    } catch (error) { setNote(error instanceof Error ? error.message : "Favorite could not be changed."); }
  };
  const uploadHeader = async (file?: File) => { if (!file || !isMuse || uploading) return; setUploading(true); setNote(""); try { const form = new FormData(); form.append("header", file); const saved = await readJson(await fetch(`/api/grotto/headers/${space}`, { method: "POST", body: form })); setHeaderSrc(saved.src); setNote(`Updated ${MUSE_NAMES[space as MuseId]}’s header.`); } catch (error) { setNote(error instanceof Error ? error.message : "Header upload failed."); } finally { setUploading(false); } };
  const toggleSelected = (id: string) => { if (!selectedIds.includes(id) && selectedIds.length >= 200) { setNote("Select up to 200 images per batch."); return; } setSelectedIds((ids) => ids.includes(id) ? ids.filter((item) => item !== id) : [...ids, id]); };
  const deleteImages = async (ids: string[]) => {
    if (managing || !ids.length || !window.confirm(`Remove ${ids.length} image${ids.length === 1 ? "" : "s"} from the Grotto? You can undo this removal.`)) return;
    setManaging(true); setNote("");
    try {
      const payload = await readJson(await fetch("/api/grotto/images/bulk-delete", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ids }) }));
      setTray((existing) => existing.filter((item) => !ids.includes(item.id)));
      setActiveIndex(null); setSelectedIds([]); setSelecting(false); setMoveTarget("");
      setRecentlyDeleted(ids);
      await loadGallery(space);
      setNote(`Removed ${payload.deleted} image${payload.deleted === 1 ? "" : "s"}. Undo is available below.`);
    } catch (error) { setNote(error instanceof Error ? error.message : "Selected images could not be removed."); }
    finally { setManaging(false); }
  };
  const deleteCurrent = async () => { if (current?.private && !current.canonical) await deleteImages([current.id]); };
  const deleteSelected = async () => { await deleteImages(selectedIds); };
  const undoDelete = async () => {
    if (!recentlyDeleted.length || managing) return;
    setManaging(true);
    try {
      const payload = await readJson(await fetch("/api/grotto/images/bulk-restore", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ids: recentlyDeleted }) }));
      setRecentlyDeleted([]); await loadGallery(space);
      setNote(`Restored ${payload.restored} image${payload.restored === 1 ? "" : "s"}.`);
    } catch (error) { setNote(error instanceof Error ? error.message : "Images could not be restored."); }
    finally { setManaging(false); }
  };
  const moveImages = async (ids: string[], destination: "studio" | MuseId | "") => {
    if (managing || !ids.length || !destination) return;
    setManaging(true); setNote("");
    try {
      const payload = await readJson(await fetch("/api/grotto/images/bulk-move", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ids, destination }) }));
      setTray((existing) => existing.map((item) => ids.includes(item.id) ? { ...item, museId: destination } : item));
      setActiveIndex(null); setSelectedIds([]); setSelecting(false); setMoveTarget(""); setViewerTarget("");
      await loadGallery(space);
      setNote(`Moved ${payload.moved} image${payload.moved === 1 ? "" : "s"} to ${destination === "studio" ? "the Atelier" : MUSE_NAMES[destination]}.`);
    } catch (error) { setNote(error instanceof Error ? error.message : "Images could not be moved."); }
    finally { setManaging(false); }
  };
  const copyPrompt = async () => { if (!current?.prompt) return; try { await navigator.clipboard.writeText(current.prompt); setNote("Prompt copied."); } catch { setNote("Prompt could not be copied."); } };
  const migrateStorage = async () => { if (!status?.storage.configured || migratingStorage) return; setMigratingStorage(true); setNote("Verifying Blob copies and releasing legacy Neon storage…"); try { let statusPayload = await readJson(await fetch("/api/grotto/storage/migrate", { cache: "no-store" })); let migrated = 0; while (Number(statusPayload.pending) > 0) { const payload = await readJson(await fetch("/api/grotto/storage/migrate", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "migrate" }) })); migrated += Number(payload.migrated) || 0; statusPayload = payload; setNote(`Copied and verified ${migrated} images · ${Number(payload.pending) || 0} remaining…`); } let cleaned = 0; let releasedBytes = 0; while (Number(statusPayload.activeLegacy) > 0) { const payload = await readJson(await fetch("/api/grotto/storage/migrate", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "cleanup" }) })); cleaned += Number(payload.cleaned) || 0; releasedBytes += Number(payload.releasedBytes) || 0; statusPayload = payload; setNote(`Verified and released ${cleaned} Neon duplicates…`); } const purged = await readJson(await fetch("/api/grotto/storage/migrate", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "purge-deleted" }) })); setNote(`Blob cleanup complete · ${cleaned} binaries verified · ${(releasedBytes / 1024 / 1024).toFixed(1)} MB released · ${Number(purged.purged) || 0} deleted records purged.`); } catch (error) { setNote(error instanceof Error ? error.message : "Storage cleanup stopped safely; it can be resumed."); } finally { setMigratingStorage(false); } };

  const generateStudio = async () => { if (!status?.studio.configured || !selectedEnvironment?.configured || generating || !studioPrompt.trim()) return; const input: StudioInput = { environmentId: studioEnvironment, prompt: studioPrompt.trim(), negativePrompt: studioNegative.trim(), format: studioFormat, quantity: studioQuantity, ...(studioLoras.length ? { loras: studioLoras } : {}), ...(studioEmbeddings.length ? { embeddings: studioEmbeddings } : {}), ...(primary ? { referenceId: primary.id, strength } : {}) }; setGenerating(true); setNote(""); try { const estimate = await readJson(await fetch("/api/grotto/studio/generate", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ input, estimate: true }) })); const cost = typeof estimate.costBuzz === "number" ? estimate.costBuzz : null; const modelName = selectedEnvironment?.label || "Pony"; if (!window.confirm(cost === null ? `Generate ${input.quantity} image${input.quantity === 4 ? "s" : ""} with ${modelName}?` : `Generate ${input.quantity} image${input.quantity === 4 ? "s" : ""} with ${modelName} for about ${cost} Buzz?`)) return; const submitted = await readJson(await fetch("/api/grotto/studio/generate", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ input }) })); if (typeof submitted.workflowId !== "string") throw new Error("Civitai did not return a workflow."); setNote(`Creating with ${modelName}…`); for (let attempt = 0; attempt < 120; attempt += 1) { await sleep(attempt === 0 ? 900 : 2500); const result = await readJson(await fetch("/api/grotto/studio/generate", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ workflowId: submitted.workflowId, input }) })); if (String(result.status).toLowerCase() === "succeeded" && Array.isArray(result.images) && result.images.length) { await loadGallery("studio"); setNote(`Saved to your Atelier collection · ${modelName}.`); return; } } throw new Error("Generation is still running. Keep the workflow ID for recovery: " + submitted.workflowId); } catch (error) { setNote(error instanceof Error ? error.message : "Atelier generation failed."); } finally { setGenerating(false); } };
  const unlock = async (event: React.FormEvent) => { event.preventDefault(); try { await readJson(await fetch("/api/museum/artist-session", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ accessKey }) })); setAccessKey(""); const nextStatus = await readJson(await fetch("/api/grotto/status", { cache: "no-store" })) as GrottoStatus; const environmentId = preferredEnvironment(nextStatus.studio); setStatus(nextStatus); setStudioEnvironment(environmentId); setStudioPrompt(nextStatus.studio.defaultPrompts?.[environmentId] ?? ""); setStudioNegative(nextStatus.studio.defaultNegativePrompts?.[environmentId] ?? nextStatus.studio.defaultNegative ?? ""); setNote(""); await loadGallery(space); } catch (error) { setNote(error instanceof Error ? error.message : "Unable to unlock."); } };

  const locked = !statusLoading && status && !status.authenticated; const studioCountOptions = status?.studio.maxImages && status.studio.maxImages < 4 ? ["1"] : ["1", "4"]; const title = isMuse ? MUSE_NAMES[space as MuseId] : isFavorites ? "Favorites" : "The Atelier";
  const selectionEligible = items.filter((item) => item.private && !item.canonical);
  const galleryToolbar = <div className={styles.galleryToolbar}><div className={styles.galleryActions}>
    {isMuse && <label className={styles.galleryUpload}>+ Add image<input type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => { void uploadImage(event.target.files?.[0]); event.target.value = ""; }}/></label>}
    <button type="button" disabled={managing || !selectionEligible.length} onClick={() => { setSelecting((value) => !value); setSelectedIds([]); setMoveTarget(""); }}>{selecting ? "Cancel selection" : "Select images"}</button>
    {selecting && <><span className={styles.selectionCount}>{selectedIds.length} selected</span><button type="button" disabled={managing || !selectionEligible.length} onClick={() => setSelectedIds(selectionEligible.slice(0, 200).map((item) => item.id))}>Select loaded</button><button type="button" disabled={managing || !selectedIds.length} onClick={() => setSelectedIds([])}>Clear</button>
      <select aria-label="Destination gallery" value={moveTarget} disabled={managing} onChange={(event) => setMoveTarget(event.target.value as "studio" | MuseId | "")}><option value="">Move to…</option><option value="studio">Atelier</option>{MUSES.map((muse) => <option key={muse} value={muse}>{MUSE_NAMES[muse]}</option>)}</select>
      <button type="button" disabled={managing || !selectedIds.length || !moveTarget} onClick={() => void moveImages(selectedIds, moveTarget)}>Move selected</button>
      <button type="button" className={styles.deleteSelection} disabled={managing || !selectedIds.length} onClick={() => void deleteSelected()}>Delete selected ({selectedIds.length})</button></>}
    {recentlyDeleted.length > 0 && <button type="button" disabled={managing} onClick={() => void undoDelete()}>Undo delete ({recentlyDeleted.length})</button>}
  </div></div>;
  const galleryTiles = <div className={styles.gallery}>{items.map((item, index) => <button
    className={`${styles.tile} ${selectedIds.includes(item.id) ? styles.tileSelected : ""}`}
    type="button" key={item.id} disabled={managing || (selecting && (!item.private || item.canonical))}
    aria-pressed={selecting ? selectedIds.includes(item.id) : undefined}
    aria-label={selecting ? `Select ${item.alt}` : `View ${item.alt}`}
    onClick={() => selecting ? toggleSelected(item.id) : setActiveIndex(index)}>
    <img src={item.src} alt={item.alt} loading="lazy"/>
    {selecting && item.private && !item.canonical && <span className={styles.selectMark}>{selectedIds.includes(item.id) ? "✓" : ""}</span>}
    {item.canonical && <span className={styles.canon}>Canon</span>}
    {item.favorite && !item.canonical && <span className={styles.canon}>♥</span>}
    {isFavorites && <span className={styles.tileOrigin}>{itemOriginLabel(item)}</span>}
  </button>)}</div>;
  return <main className={styles.page} aria-busy={statusLoading}><section className={styles.shell}>
    <header className={styles.topbar}><a className={styles.back} href="/museum">← Museum</a><span className={styles.mark}>◇</span><button className={styles.galleryMenuButton} type="button" onClick={() => void selectSpace(isMuse ? "studio" : "novy")}>{isMuse ? "The Atelier" : "Muse Galleries"}</button></header>
    <section className={`${styles.hero} ${!isMuse ? styles.studioHero : ""}`} aria-label={`${title} in the Grotto`}>{isMuse && <img className={styles.heroImage} src={headerSrc || `/museum/${space}.webp`} alt=""/>}<div className={styles.heroVeil}/><div className={styles.heroCopy}><small>{isMuse ? `${title} Gallery` : "The Grotto"}</small><h1>{title}</h1>{isMuse && <p>Approved references and visual studies. The gallery supports the Muse’s canon; it does not replace it.</p>}</div>{isMuse && <label className={styles.headerUpload}>Change header photo or GIF<input type="file" accept="image/png,image/jpeg,image/webp,image/gif" onChange={(event) => { void uploadHeader(event.target.files?.[0]); event.target.value = ""; }}/></label>}</section>
    {statusLoading ? <p className={styles.connectionNote}>Opening the Grotto…</p> : locked ? <section className={styles.create}><div className={styles.createInner}><form onSubmit={unlock} className={styles.unlock}><label className={styles.studioField}><span>Artist key</span><input type="password" autoComplete="current-password" value={accessKey} onChange={(event) => setAccessKey(event.target.value)} required/></label><button className={styles.generate}>Unlock the Grotto</button><p className={styles.connectionNote}>{note}</p></form></div></section> : <>
      <nav className={styles.galleryRail} aria-label="Grotto spaces"><button type="button" className={space === "studio" ? styles.galleryRailActive : ""} onClick={() => void selectSpace("studio")}>Atelier</button><button type="button" className={isFavorites ? styles.galleryRailActive : ""} onClick={() => void selectSpace("favorites")}>♥ Favorites</button>{MUSES.map((muse) => <button type="button" key={muse} className={space === muse ? styles.galleryRailActive : ""} onClick={() => void selectSpace(muse)}><img src={`/museum/${muse}.webp`} alt=""/><span>{MUSE_NAMES[muse]}</span></button>)}</nav>
      {space === "studio" ? <div className={styles.atelierLayout}><section className={styles.composer}><div className={styles.createInner}><div className={styles.sectionHeading}><h2>Create</h2><span>{selectedEnvironment?.label || status?.studio.checkpointLabel || "Pony checkpoint"}</span></div>{status?.storage.configured && <button className={styles.storageMigration} type="button" disabled={migratingStorage} onClick={() => void migrateStorage()}>{migratingStorage ? "Verifying gallery storage…" : "Finish legacy storage cleanup"}</button>}<fieldset disabled={generating || uploading || migratingStorage} className={styles.controls}>
        <div className={styles.choiceGroup}><span>Generator</span><div className={styles.choices}>{availableEnvironments.map((environment) => <button type="button" key={environment.id} disabled={!environment.configured} title={environment.configured ? `Use ${environment.label}` : `${environment.label} is not configured in this preview`} className={studioEnvironment === environment.id ? styles.selected : ""} onClick={() => selectEnvironment(environment.id)}>{environment.label}{environment.configured ? "" : " · unavailable"}</button>)}</div></div>
        <div className={styles.loraPanel}><div className={styles.loraHeading}><span>LoRAs</span><small>{studioLoras.length}/{maxLoras} active</small></div>{compatibleLoras.length ? <div className={styles.loraList}>{compatibleLoras.map((lora) => { const active = studioLoras.find((selection) => selection.id === lora.id); return <div className={`${styles.loraRow} ${active ? styles.loraRowActive : ""}`} key={lora.id}><button type="button" className={styles.loraToggle} onClick={() => toggleLora(lora)}><span>{active ? "✓" : "+"}</span><strong>{lora.label}</strong><small>{lora.category}</small></button>{active && <label className={styles.loraWeight}><span>{active.weight.toFixed(2)}</span><input type="range" min={lora.minWeight} max={lora.maxWeight} step="0.05" value={active.weight} onChange={(event) => setLoraWeight(lora.id, Number(event.target.value))}/></label>}</div>; })}</div> : <p className={styles.loraEmpty}>LoRA library ready. No compatible LoRAs are installed yet.</p>}</div>
        <div className={styles.loraPanel}><div className={styles.loraHeading}><span>Embeddings</span><small>separate from LoRA slots</small></div>{compatibleEmbeddings.map((embedding) => { const active = studioEmbeddings.includes(embedding.id); return <div className={`${styles.loraRow} ${active ? styles.loraRowActive : ""}`} key={embedding.id}><button type="button" className={styles.loraToggle} onClick={() => toggleEmbedding(embedding.id)}><span>{active ? "✓" : "+"}</span><strong>{embedding.label}</strong><small>{embedding.triggerWord}</small></button></div>; })}</div>
        <div className={styles.referenceTray}><div className={styles.trayHeading}><span>Reference tray</span><small>Primary guides the current remix.</small></div><div className={styles.traySlots}>{ROLES.map((role) => { const item = tray.find((entry) => entry.role === role); return <div className={`${styles.traySlot} ${item ? styles.traySlotFilled : ""}`} key={role}><span>{ROLE_LABELS[role]}</span>{item ? <><img src={item.src} alt={item.alt}/><small>{itemOriginLabel(item)}</small><button type="button" aria-label={`Remove ${ROLE_LABELS[role]} reference`} onClick={() => setTray((t) => t.filter((entry) => entry.role !== role))}>×</button></> : <em>Empty</em>}</div>; })}</div><label className={styles.trayUpload}>+ Upload to Primary<input type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => { void uploadImage(event.target.files?.[0]); event.target.value = ""; }}/></label>{primary && <label className={styles.strength}>Variation · {Math.round(strength * 100)}%<input type="range" min="0.05" max="0.9" step="0.05" value={strength} onChange={(event) => setStrength(Number(event.target.value))}/><small>Lower keeps more of the Primary image.</small></label>}</div>
        <label className={styles.studioField}><span>Prompt</span><textarea value={studioPrompt} onChange={(event) => setStudioPrompt(event.target.value)} placeholder={primary ? "Describe how you want to reinterpret the primary reference…" : "Describe a scene, or enter your Pony tags…"}/></label><details className={styles.advanced}><summary>Negative prompt</summary><label className={`${styles.studioField} ${styles.studioFieldSecondary}`}><span>Negative</span><textarea value={studioNegative} onChange={(event) => setStudioNegative(event.target.value)}/></label></details>
        <ChoiceRow label="Format" value={studioFormat} options={["Portrait", "Square", "Landscape"]} onChange={(value) => setStudioFormat(value as StudioFormat)}/><ChoiceRow label="Count" value={String(studioQuantity)} options={studioCountOptions} onChange={(value) => setStudioQuantity(value === "4" ? 4 : 1)}/><button className={styles.generate} type="button" disabled={!status?.studio.configured || !selectedEnvironment?.configured || generating || uploading || !studioPrompt.trim()} onClick={() => void generateStudio()}>{generating ? "Creating…" : uploading ? "Uploading…" : `${primary ? "Remix" : "Generate"} ${studioQuantity}`}</button>
      </fieldset>{selectedEnvironment && !selectedEnvironment.configured && <p className={styles.connectionNote}>{selectedEnvironment.label} is not configured.</p>}{!status?.studio.configured && <p className={styles.connectionNote}>The Atelier is not connected yet.</p>}{note && <p className={styles.connectionNote}>{note}</p>}</div></section>
      <section className={styles.collection}><div className={styles.sectionHeading}><h2>Your collection</h2><span>{items.length} loaded</span></div>{galleryToolbar}{galleryTiles}{!items.length && <div className={styles.emptyCollection}><span>◇</span><p>Your next image begins here.</p><small>Generate a scene or choose a Muse reference.</small></div>}<div ref={loadMoreSentinel} className={styles.scrollSentinel} aria-hidden="true"/>{loadingMore && <p className={styles.scrollStatus}>Loading more…</p>}{note && <p className={styles.connectionNote} role="status">{note}</p>}</section></div>
      : <section className={styles.museGallerySection}><p className={styles.galleryIntro}>{isFavorites ? "Your favorite images across the Atelier and every Muse gallery, newest first." : "Choose an image for the Atelier or add an approved reference."}</p>{galleryToolbar}{galleryTiles}{!items.length && <p className={styles.galleryIntro}>{isFavorites ? "Favorite an image from any gallery to see it here." : "No images yet. Add an approved reference above."}</p>}<div ref={loadMoreSentinel} className={styles.scrollSentinel} aria-hidden="true"/>{loadingMore && <p className={styles.scrollStatus}>Loading more…</p>}{note && <p className={styles.connectionNote} role="status">{note}</p>}</section>}
    </>}
  </section>{current && <div ref={viewer} className={styles.lightbox} role="dialog" aria-modal="true" aria-label="Gallery viewer" onTouchStart={(event) => { swipeStart.current = event.touches[0]?.clientX ?? null; }} onTouchEnd={(event) => { if (swipeStart.current === null) return; const distance = (event.changedTouches[0]?.clientX ?? swipeStart.current) - swipeStart.current; swipeStart.current = null; if (Math.abs(distance) >= 48) void browseViewer(distance > 0 ? -1 : 1); }}><button className={styles.close} type="button" onClick={() => setActiveIndex(null)} aria-label="Close">×</button><button className={styles.prev} type="button" disabled={activeIndex === 0} onClick={() => void browseViewer(-1)} aria-label="Previous image">‹</button><img className={styles.lightboxImage} src={current.src} alt={current.alt}/><button className={styles.next} type="button" disabled={activeIndex === items.length - 1 && !hasNext} onClick={() => void browseViewer(1)} aria-label="Next image">›</button>{itemMuseId(current) && <div className={styles.viewerProvenance}>{MUSE_NAMES[itemMuseId(current)!]} Gallery{current.canonical ? " · Canonical reference" : ""}</div>}<div className={styles.viewerActions}>{current.private && <button type="button" onClick={() => void toggleFavorite()}>{current.favorite ? "Favorited" : "Favorite"}</button>}{current.prompt && <button type="button" onClick={() => void copyPrompt()}>Copy prompt</button>}{ROLES.map((role) => <button type="button" key={role} onClick={() => putInTray(current, role, role === "primary")}>{role === "primary" ? "Remix in Atelier" : `Use as ${ROLE_LABELS[role]}`}</button>)}<a href={current.src} download={`grotto-${current.id}`}>Download</a>{current.private && !current.canonical && <><select aria-label="Move image to gallery" value={viewerTarget} disabled={managing} onChange={(event) => setViewerTarget(event.target.value as "studio" | MuseId | "")}><option value="">Move to…</option><option value="studio">Atelier</option>{MUSES.map((muse) => <option key={muse} value={muse}>{MUSE_NAMES[muse]}</option>)}</select><button type="button" disabled={managing || !viewerTarget} onClick={() => void moveImages([current.id], viewerTarget)}>Move</button><button type="button" disabled={managing} onClick={() => void deleteCurrent()}>Delete</button></>}</div></div>}</main>;
}
