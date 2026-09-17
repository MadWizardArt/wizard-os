"use client";

import { useEffect, useState } from "react";
import { MUSE_BY_ID, MUSE_DIRECTORY } from "../../lib/museum-directory";
import type { MuseId } from "../../lib/museum";
import styles from "./museum.module.css";
import polish from "./MuseumPolish.module.css";
import transitions from "./MuseumTransitions.module.css";
import MuseRoom from "./MuseRoom";
import CouncilChamber from "./CouncilChamber";
import MuseumGatewayStatus from "./MuseumGatewayStatus";
import GrottoGate from "./GrottoGate";

type SharedProject = {
  id: string;
  title: string;
  kind?: string;
  type?: string;
  next?: string;
  nextAction?: string | null;
};

type MuseumMode = "hall" | "chamber" | "council";

export default function MuseumPage() {
  const [mode, setMode] = useState<MuseumMode>("hall");
  const [selectedId, setSelectedId] = useState<MuseId>("novy");
  const [projects, setProjects] = useState<SharedProject[]>([]);
  const [councilIds, setCouncilIds] = useState<MuseId[]>([]);
  const [councilQuestion, setCouncilQuestion] = useState("");
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(true);

  const selected = MUSE_BY_ID[selectedId];
  const viewClass = mode === "hall"
    ? transitions.hallView
    : mode === "chamber"
      ? transitions.chamberView
      : transitions.councilView;
  const viewKey = mode === "chamber" ? `${mode}-${selectedId}` : mode;

  const loadMuseum = async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/projects", { cache: "no-store" });
      if (!response.ok) throw new Error("Wizard OS projects could not be read.");
      const projectData = await response.json();
      setProjects(Array.isArray(projectData) ? projectData : []);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Wizard OS projects could not be read.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const savedMuse = localStorage.getItem("wizard-os-museum-selected-muse") as MuseId | null;
    if (savedMuse && MUSE_BY_ID[savedMuse]) setSelectedId(savedMuse);
    void loadMuseum();
  }, []);

  const chooseMuse = (id: MuseId) => {
    setSelectedId(id);
    localStorage.setItem("wizard-os-museum-selected-muse", id);
  };

  const enterChamber = (id: MuseId) => {
    chooseMuse(id);
    setMode("chamber");
  };

  const copyText = async (text: string, success: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setNotice(success);
    } catch {
      setNotice("Clipboard access was unavailable. Select and copy the text manually.");
    }
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
          <div>
            <MuseumGatewayStatus />
            <GrottoGate />
          </div>
        </header>

        <nav className={`${styles.museumNav} ${polish.museumNav}`} aria-label="Museum rooms">
          <button className={mode === "hall" ? styles.navActive : ""} onClick={() => setMode("hall")}>Council Chamber</button>
          <button className={mode === "chamber" ? styles.navActive : ""} onClick={() => setMode("chamber")}>{selected.name}&apos;s Room</button>
          <button className={mode === "council" ? styles.navActive : ""} onClick={() => setMode("council")}>Council Table</button>
        </nav>

        {notice && <button className={styles.notice} onClick={() => setNotice("")}>{notice}<span>×</span></button>}

        <div key={viewKey} className={`${transitions.view} ${viewClass}`}>
          {mode === "hall" && <CouncilChamber onEnter={enterChamber} />}

          {mode === "chamber" && (
            <>
              <nav className={`${styles.roomSwitcher} ${transitions.roomSwitcher}`} aria-label="Visit another Muse">
                {MUSE_DIRECTORY.map((muse) => <button key={muse.id} aria-pressed={selectedId === muse.id} onClick={() => enterChamber(muse.id)}>{muse.name}</button>)}
              </nav>

              <MuseRoom muse={selected} onCouncil={() => setMode("council")} />

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
          <p>Character · Presence · Signals. Wizard OS remains the operational system.</p>
        </footer>
      </section>
    </main>
  );
}
