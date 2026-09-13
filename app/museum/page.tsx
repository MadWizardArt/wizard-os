"use client";

import { useEffect, useMemo, useState } from "react";
import { MUSE_BY_ID, MUSE_DIRECTORY } from "../../lib/museum-directory";
import type { MuseId } from "../../lib/museum";
import styles from "./museum.module.css";

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
  const [saving, setSaving] = useState(false);

  const selected = MUSE_BY_ID[selectedId];
  const focusByMuse = useMemo(() => new Map(focuses.map((focus) => [focus.museId, focus])), [focuses]);
  const selectedFocus = focusByMuse.get(selectedId) ?? null;

  const loadMuseum = async () => {
    setLoading(true);
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
    <main className={styles.page} data-palette={selected.palette}>
      <div className={styles.atmosphere} />
      <section className={styles.shell}>
        <header className={styles.topbar}>
          <a className={styles.backLink} href="/">← Wizard OS</a>
          <div className={styles.titleBlock}>
            <p className={styles.kicker}>NINE MINDS · ONE WORLD · NO BUREAUCRACY</p>
            <h1>The Museum</h1>
            <p>The Muses live here. Wizard OS manages the work. The Museum only remembers who each Muse is and what she is focused on now.</p>
          </div>
          <div className={styles.gatewayStatus}><span />AI Gateway · Off</div>
        </header>

        <nav className={styles.museumNav} aria-label="Museum rooms">
          <button className={mode === "hall" ? styles.navActive : ""} onClick={() => setMode("hall")}>The Hall</button>
          <button className={mode === "chamber" ? styles.navActive : ""} onClick={() => setMode("chamber")}>{selected.name}&apos;s Chamber</button>
          <button className={mode === "council" ? styles.navActive : ""} onClick={() => setMode("council")}>Council Table</button>
        </nav>

        {notice && <button className={styles.notice} onClick={() => setNotice("")}>{notice}<span>×</span></button>}

        {mode === "hall" && (
          <>
            <section className={styles.roomHeading}>
              <div><p className={styles.kicker}>THE HALL</p><h2>Who is here, and what has her attention?</h2></div>
              <div className={styles.summaryStrip}><strong>{focuses.length}</strong><span>Current Focuses</span></div>
            </section>

            <section className={styles.hallGrid}>
              {MUSE_DIRECTORY.map((muse) => {
                const focus = focusByMuse.get(muse.id);
                return (
                  <button key={muse.id} className={styles.museCard} data-palette={muse.palette} onClick={() => enterChamber(muse.id)}>
                    <div className={styles.characterFrame}><span>{muse.symbol}</span><small>{muse.mythicSeat}</small></div>
                    <div className={styles.cardCopy}>
                      <p className={styles.cardRole}>{muse.role}</p>
                      <h3>{muse.name}</h3>
                      <p className={styles.coreQuestion}>{muse.coreQuestion}</p>
                      <div className={styles.cardFocus}>
                        <span>Current Focus</span>
                        <strong>{focus?.title || "Open"}</strong>
                        <small>{focus?.nextAction || "No work needs her attention right now."}</small>
                      </div>
                    </div>
                  </button>
                );
              })}
            </section>

            <section className={styles.architectureNote}>
              <strong>Simple by design</strong>
              <p>One optional Current Focus per Muse. Projects, tasks, status history, sales, campaigns and production stay in Wizard OS where they belong.</p>
            </section>
          </>
        )}

        {mode === "chamber" && (
          <>
            <section className={styles.chamberHero}>
              <div className={styles.chamberPortrait}><span>{selected.symbol}</span><small>{selected.mythicSeat}</small></div>
              <div className={styles.chamberIdentity}>
                <p className={styles.kicker}>CHAMBER · {selected.role.toUpperCase()}</p>
                <h2>{selected.name}</h2>
                <p className={styles.secondary}>{selected.secondary}</p>
                <blockquote>{selected.coreLine}</blockquote>
                <p>{selected.domain}</p>
                <div className={styles.identityMeta}><span>{selected.voice}</span><span>Counterweight · {MUSE_BY_ID[selected.counterweightId].name}</span></div>
              </div>
            </section>

            <section className={styles.chamberGrid}>
              <article className={styles.panel}>
                <p className={styles.kicker}>CURRENT FOCUS</p>
                <h3>{selectedFocus ? selectedFocus.title : `${selected.name} is open.`}</h3>
                <p className={styles.panelCopy}>This is the only work state the Museum keeps for a Muse.</p>
                <label className={styles.field}><span>Focus</span><input value={focusDraft.title} onChange={(event) => setFocusDraft({ ...focusDraft, title: event.target.value })} placeholder="What has her attention?" /></label>
                <label className={styles.field}><span>Wizard OS Project · optional</span><select value={focusDraft.linkedProjectId} onChange={(event) => setFocusDraft({ ...focusDraft, linkedProjectId: event.target.value })}><option value="">None</option>{projects.map((project) => <option key={project.id} value={project.id}>{project.title}</option>)}</select></label>
                <label className={styles.field}><span>Next Step · optional</span><input value={focusDraft.nextAction} onChange={(event) => setFocusDraft({ ...focusDraft, nextAction: event.target.value })} placeholder="One next step" /></label>
                <div className={styles.actionRow}>
                  <button className={styles.primaryButton} disabled={saving} onClick={saveFocus}>{saving ? "Saving…" : "Save Focus"}</button>
                  {selectedFocus && <button className={styles.textButton} disabled={saving} onClick={clearFocus}>Clear Focus</button>}
                </div>
              </article>

              <article className={styles.panel}>
                <p className={styles.kicker}>TALK TO {selected.name.toUpperCase()}</p>
                <h3>Take the conversation to her home thread.</h3>
                <p className={styles.panelCopy}>The Museum carries only the tiny bit of context that matters. ChatGPT provides the mind.</p>
                <textarea className={styles.largeInput} value={consultQuestion} onChange={(event) => setConsultQuestion(event.target.value)} placeholder={`What do you want to ask ${selected.name}?`} />
                <button className={styles.primaryButton} onClick={copyConsultPacket}>Copy for {selected.name}</button>
                <small className={styles.costNote}>Gateway cost: $0. No AI request is made here.</small>
              </article>
            </section>

            <section className={styles.panel}>
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
            <section className={styles.roomHeading}>
              <div><p className={styles.kicker}>COUNCIL TABLE</p><h2>Choose the perspectives. Have the discussion here.</h2></div>
              <div className={styles.zeroCallBadge}>Nothing is stored</div>
            </section>

            <section className={styles.councilPanel}>
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

        <footer className={styles.footerNote}>
          <span>THE MUSEUM</span>
          <p>Character · Current Focus · Conversation. Everything else belongs in Wizard OS.</p>
        </footer>
      </section>
    </main>
  );
}
