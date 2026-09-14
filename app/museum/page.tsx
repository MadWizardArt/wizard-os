"use client";

import { useEffect, useMemo, useState } from "react";
import { MUSE_BY_ID, MUSE_DIRECTORY } from "../../lib/museum-directory";
import type { MuseId } from "../../lib/museum";
import styles from "./museum.module.css";
import polish from "./MuseumPolish.module.css";
import transitions from "./MuseumTransitions.module.css";
import MuseRoom from "./MuseRoom";
import CouncilChamber from "./CouncilChamber";

type SharedProject = {
  id: string;
  title: string;
  kind?: string;
  type?: string;
  next?: string;
  nextAction?: string | null;
};

type MuseFocus = {
  museId: MuseId;
  title: string;
  nextAction: string;
  linkedProjectId: string | null;
};

type MuseumMode = "hall" | "chamber" | "council";

type FocusDraft = {
  title: string;
  nextAction: string;
  linkedProjectId: string;
};

function emptyFocus(): FocusDraft {
  return { title: "", nextAction: "", linkedProjectId: "" };
}

export default function MuseumPage() {
  const [mode, setMode] = useState<MuseumMode>("hall");
  const [selectedId, setSelectedId] = useState<MuseId>("novy");
  const [focuses, setFocuses] = useState<MuseFocus[]>([]);
  const [projects, setProjects] = useState<SharedProject[]>([]);
  const [focusDraft, setFocusDraft] = useState<FocusDraft>(emptyFocus());
  const [consultQuestion, setConsultQuestion] = useState("");
  const [councilIds, setCouncilIds] = useState<MuseId[]>([]);
  const [councilQuestion, setCouncilQuestion] = useState("");
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [saving, setSaving] = useState(false);

  const selected = MUSE_BY_ID[selectedId];
  const focusByMuse = useMemo(() => new Map(focuses.map((focus) => [focus.museId, focus])), [focuses]);
  const selectedFocus = focusByMuse.get(selectedId) ?? null;
  const viewClass = mode === "hall"
    ? transitions.hallView
    : mode === "chamber"
      ? transitions.chamberView
      : transitions.councilView;
  const viewKey = mode === "chamber" ? `${mode}-${selectedId}` : mode;

  const loadMuseum = async () => {
    setLoading(true);
    setLoadFailed(false);
    try {
      const [focusResponse, projectResponse] = await Promise.all([
        fetch("/api/museum/focus", { cache: "no-store" }),
        fetch("/api/projects", { cache: "no-store" }),
      ]);
      if (!focusResponse.ok || !projectResponse.ok) throw new Error("Museum state could not be read.");
      const [focusData, projectData] = await Promise.all([focusResponse.json(), projectResponse.json()]);
      setFocuses(Array.isArray(focusData) ? focusData : []);
      setProjects(Array.isArray(projectData) ? projectData : []);
    } catch (error) {
      setLoadFailed(true);
      setNotice(error instanceof Error ? error.message : "Museum state could not be read.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const savedMuse = localStorage.getItem("wizard-os-museum-selected-muse") as MuseId | null;
    if (savedMuse && MUSE_BY_ID[savedMuse]) setSelectedId(savedMuse);
    void loadMuseum();
  }, []);

  useEffect(() => {
    const focus = focusByMuse.get(selectedId);
    setFocusDraft(focus
      ? { title: focus.title, nextAction: focus.nextAction, linkedProjectId: focus.linkedProjectId ?? "" }
      : emptyFocus());
  }, [selectedId, focusByMuse]);

  const chooseMuse = (id: MuseId) => {
    setSelectedId(id);
    localStorage.setItem("wizard-os-museum-selected-muse", id);
  };

  const enterChamber = (id: MuseId) => {
    chooseMuse(id);
    setMode("chamber");
    setConsultQuestion("");
  };

  const copyText = async (text: string, success: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setNotice(success);
    } catch {
      setNotice("Clipboard access was unavailable. Select and copy the text manually.");
    }
  };

  const saveFocus = async () => {
    if (!focusDraft.title.trim()) {
      setNotice("Give the Current Focus a title first.");
      return;
    }
    setSaving(true);
    try {
      const response = await fetch("/api/museum/focus", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          museId: selectedId,
          title: focusDraft.title,
          nextAction: focusDraft.nextAction,
          linkedProjectId: focusDraft.linkedProjectId || null,
        }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Current Focus could not be saved.");
      setFocuses((current) => [...current.filter((focus) => focus.museId !== selectedId), payload]);
      setNotice(`${selected.name}'s Current Focus saved.`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Current Focus could not be saved.");
    } finally {
      setSaving(false);
    }
  };

  const clearFocus = async () => {
    if (!selectedFocus) return;
    setSaving(true);
    try {
      const response = await fetch("/api/museum/focus", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ museId: selectedId, clear: true }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Current Focus could not be cleared.");
      setFocuses((current) => current.filter((focus) => focus.museId !== selectedId));
      setFocusDraft(emptyFocus());
      setNotice(`${selected.name}'s Current Focus cleared.`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Current Focus could not be cleared.");
    } finally {
      setSaving(false);
    }
  };

  const copyConsultPacket = async () => {
    const packet = [
      `${selected.name.toUpperCase()} CONSULT`,
      `Role: ${selected.role}`,
      `Current Focus: ${selectedFocus?.title || "None"}`,
      `Next Step: ${selectedFocus?.nextAction || "None recorded"}`,
      `Question: ${consultQuestion.trim() || "[add question]"}`,
      "",
      `Respond as ${selected.name} using the adopted Nine Muses Character & Operator 2.0 canon.`,
    ].join("\n");
    await copyText(packet, `Copied for ${selected.name}. Paste it into her Nine Muses project thread.`);
  };

  const toggleCouncilMuse = (id: MuseId) => {
    setCouncilIds((current) => {
      if (current.includes(id)) return current.filter((item) => item !== id);
      if (current.length >= 3) return current;
      return [...current, id];
    });
  };

  const copyCouncilPacket = async () => {
    if (councilIds.length < 2) {
      setNotice("Choose two or three Muses for the Council discussion.");
      return;
    }
    const members = councilIds.map((id) => MUSE_BY_ID[id]);
    const packet = [
      "COUNCIL DISCUSSION",
      `Muses: ${members.map((muse) => muse.name).join(", ")}`,
      ...members.map((muse) => `- ${muse.name} · ${muse.role} · ${muse.coreQuestion}`),
      `Question: ${councilQuestion.trim() || "[add discussion question]"}`,
      "",
      "Use the adopted Nine Muses Character & Operator 2.0 canon. Keep one accountable lead and include another Muse only where her perspective changes the outcome.",
    ].join("\n");
    await copyText(packet, "Council discussion copied. Paste it into the Nine Muses project.");
  };

  return (
    <main className={`${styles.page} ${transitions.page}`} data-palette={selected.palette}>
      <div className={styles.atmosphere} />
      <section className={`${styles.shell} ${polish.shell}`}>
        <header className={`${styles.topbar} ${polish.topbar}`}>
          <a className={styles.backLink} href="/">← Wizard OS</a>
          <div className={`${styles.titleBlock} ${polish.titleBlock}`}>
            <p className={styles.kicker}>NINE MUSES · ONE SHARED WORLD</p>
            <h1>The Museum</h1>
            <p>A living council of nine rooms. Enter quietly; someone is usually working.</p>
          </div>
          <div className={styles.gatewayStatus}><span />AI Gateway · Off</div>
        </header>

        <nav className={`${styles.museumNav} ${polish.museumNav}`} aria-label="Museum rooms">
          <button className={mode === "hall" ? styles.navActive : ""} onClick={() => setMode("hall")}>Council Chamber</button>
          <button className={mode === "chamber" ? styles.navActive : ""} onClick={() => setMode("chamber")}>{selected.name}&apos;s Room</button>
          <button className={mode === "council" ? styles.navActive : ""} onClick={() => setMode("council")}>Council Table</button>
        </nav>

        {notice && <button className={styles.notice} onClick={() => setNotice("")}>{notice}<span>×</span></button>}

        <div key={viewKey} className={`${transitions.view} ${viewClass}`}>
          {mode === "hall" && (
            <CouncilChamber focusByMuse={focusByMuse} loading={loading} loadFailed={loadFailed} onEnter={enterChamber} />
          )}

          {mode === "chamber" && (
            <>
              <nav className={`${styles.roomSwitcher} ${transitions.roomSwitcher}`} aria-label="Visit another Muse">
                {MUSE_DIRECTORY.map((muse) => <button key={muse.id} aria-pressed={selectedId === muse.id} onClick={() => enterChamber(muse.id)}>{muse.name}</button>)}
              </nav>
              <MuseRoom muse={selected}
                assignment={loading ? "Reading focus…" : loadFailed ? "Focus unavailable" : selectedFocus?.title || "No current focus recorded"}
                onChat={() => { document.getElementById("room-consultation")?.scrollIntoView({ block: "center" }); document.getElementById("consult-question")?.focus({ preventScroll: true }); }}
                onFocus={() => { document.getElementById("room-focus")?.scrollIntoView({ block: "start" }); document.getElementById("focus-title")?.focus({ preventScroll: true }); }}
                onCouncil={() => setMode("council")}
              />

              <section className={`${styles.chamberGrid} ${transitions.secondaryGrid}`}>
                <article id="room-focus" className={styles.panel}>
                  <p className={styles.kicker}>CURRENT FOCUS</p>
                  <h3>{loading ? "Reading focus…" : loadFailed ? "Focus unavailable" : selectedFocus ? selectedFocus.title : `${selected.name} is open.`}</h3>
                  <p className={styles.panelCopy}>This remains intentionally small: what has her attention, the related Wizard OS project if any, and one next step.</p>
                  <label className={styles.field}><span>Focus</span><input id="focus-title" value={focusDraft.title} onChange={(event) => setFocusDraft({ ...focusDraft, title: event.target.value })} placeholder="What has her attention?" /></label>
                  <label className={styles.field}><span>Wizard OS Project · optional</span><select value={focusDraft.linkedProjectId} onChange={(event) => setFocusDraft({ ...focusDraft, linkedProjectId: event.target.value })}><option value="">None</option>{projects.map((project) => <option key={project.id} value={project.id}>{project.title}</option>)}</select></label>
                  <label className={styles.field}><span>Next Step · optional</span><input value={focusDraft.nextAction} onChange={(event) => setFocusDraft({ ...focusDraft, nextAction: event.target.value })} placeholder="One next step" /></label>
                  <div className={styles.actionRow}>
                    <button className={styles.primaryButton} disabled={saving} onClick={saveFocus}>{saving ? "Saving…" : "Save Focus"}</button>
                    {selectedFocus && <button className={styles.textButton} disabled={saving} onClick={clearFocus}>Clear Focus</button>}
                  </div>
                </article>

                <article id="room-consultation" className={styles.panel}>
                  <p className={styles.kicker}>VISIT {selected.name.toUpperCase()}</p>
                  <h3>Continue the conversation in her home thread.</h3>
                  <p className={styles.panelCopy}>The Museum remains the visual layer; the Muse conversation remains in the Nine Muses project.</p>
                  <textarea id="consult-question" aria-label={`Question for ${selected.name}`} className={styles.largeInput} value={consultQuestion} onChange={(event) => setConsultQuestion(event.target.value)} placeholder={`What do you want to ask ${selected.name}?`} />
                  <button className={styles.primaryButton} onClick={copyConsultPacket}>Copy for {selected.name}</button>
                  <small className={styles.costNote}>Gateway cost: $0. No AI request is made here.</small>
                </article>
              </section>

              <section className={`${styles.panel} ${transitions.contextPanel}`}>
                <div className={styles.panelHeader}><div><p className={styles.kicker}>WIZARD OS</p><h3>Nearby operational context</h3></div><strong>{projects.length}</strong></div>
                <div className={styles.projectGrid}>
                  {loading && <p className={styles.empty}>Reading Wizard OS…</p>}
                  {!loading && projects.length === 0 && <p className={styles.empty}>No Wizard OS projects returned.</p>}
                  {projects.slice(0, 8).map((project) => <article key={project.id}><span>{project.kind ?? project.type ?? "Project"}</span><strong>{project.title}</strong><small>{project.next ?? project.nextAction ?? "No next action"}</small></article>)}
                </div>
              </section>
            </>
          )}

          {mode === "council" && (
            <>
              <section className={`${styles.roomHeading} ${transitions.councilHeading}`}>
                <div><p className={styles.kicker}>COUNCIL TABLE</p><h2>Choose the perspectives. Have the discussion here.</h2></div>
                <div className={styles.zeroCallBadge}>Nothing is stored</div>
              </section>

              <section className={`${styles.councilPanel} ${transitions.councilPanel}`}>
                <div className={styles.councilRoster}>
                  {MUSE_DIRECTORY.map((muse) => {
                    const active = councilIds.includes(muse.id);
                    return <button key={muse.id} className={active ? styles.councilSelected : ""} onClick={() => toggleCouncilMuse(muse.id)}><span>{muse.symbol}</span><strong>{muse.name}</strong><small>{muse.role}</small></button>;
                  })}
                </div>
                <div className={styles.councilComposer}>
                  <p className={styles.kicker}>TEMPORARY COUNCIL · {councilIds.length}/3</p>
                  <h3>Choose two or three sisters.</h3>
                  <p className={styles.panelCopy}>No Council object, no log, no assignment record. This simply prepares the discussion for the Nine Muses project.</p>
                  <textarea className={styles.largeInput} value={councilQuestion} onChange={(event) => setCouncilQuestion(event.target.value)} placeholder="What should the Council consider?" />
                  <button className={styles.primaryButton} onClick={copyCouncilPacket}>Copy Council Discussion</button>
                  <button className={styles.textButton} onClick={() => { setCouncilIds([]); setCouncilQuestion(""); }}>Clear</button>
                </div>
              </section>
            </>
          )}
        </div>

        <footer className={styles.footerNote}>
          <span>THE MUSEUM</span>
          <p>Character · Presence · Current Focus. Wizard OS remains the operational system.</p>
        </footer>
      </section>
    </main>
  );
}
