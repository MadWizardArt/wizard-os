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

type MuseumMode = "hall" | "chamber" | "council";

export default function MuseumPage() {
  const [mode, setMode] = useState<MuseumMode>("hall");
  const [selectedId, setSelectedId] = useState<MuseId>("novy");
  const [councilIds, setCouncilIds] = useState<MuseId[]>([]);
  const [councilQuestion, setCouncilQuestion] = useState("");
  const [notice, setNotice] = useState("");

  const selected = MUSE_BY_ID[selectedId];
  const viewClass = mode === "hall"
    ? transitions.hallView
    : mode === "chamber"
      ? transitions.chamberView
      : transitions.councilView;
  const viewKey = mode === "chamber" ? `${mode}-${selectedId}` : mode;

  useEffect(() => {
    const savedMuse = localStorage.getItem("wizard-os-museum-selected-muse") as MuseId | null;
    if (savedMuse && MUSE_BY_ID[savedMuse]) setSelectedId(savedMuse);
  }, []);

  const chooseMuse = (id: MuseId) => {
    setSelectedId(id);
    localStorage.setItem("wizard-os-museum-selected-muse", id);
  };

  const enterChamber = (id: MuseId) => {
    chooseMuse(id);
    setMode("chamber");
  };

  const toggleCouncilMuse = (id: MuseId) => {
    setCouncilIds((current) => {
      if (current.includes(id)) return current.filter((item) => item !== id);
      if (current.length >= 3) return current;
      return [...current, id];
    });
  };

  const prepareCouncilReview = () => {
    const question = councilQuestion.trim();
    if (!question || councilIds.length === 0) {
      setNotice("Choose an accountable Muse and enter a decision question.");
      return;
    }
    const lead = MUSE_BY_ID[councilIds[0]];
    const supporting = councilIds.slice(1).map((id) => MUSE_BY_ID[id]);
    // One accountable quest, not an implicit multi-Muse AI run. Additional
    // perspectives are context only until the Artist separately fuels them.
    const brief = [
      "COUNCIL REVIEW",
      `Accountable Muse: ${lead.name} — ${lead.role}`,
      supporting.length ? `Perspectives to consider (not automatically consulted): ${supporting.map((muse) => `${muse.name} — ${muse.role}`).join("; ")}` : "",
      `Decision question: ${question}`,
      "Distinguish evidence, open questions, and the smallest useful next action. The Artist retains approval.",
    ].filter(Boolean).join("\n").slice(0, 1200);
    const params = new URLSearchParams({ source: "council", muse: lead.id, brief });
    window.location.assign(`/museum/intelligence?${params.toString()}`);
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
          <div className={polish.gatewayCluster}>
            <MuseumGatewayStatus />
            <GrottoGate />
          </div>
        </header>

        <nav className={`${styles.museumNav} ${polish.museumNav}`} aria-label="Museum rooms">
          <button className={mode === "hall" ? styles.navActive : ""} onClick={() => setMode("hall")}>Council Chamber</button>
          <button className={mode === "chamber" ? styles.navActive : ""} onClick={() => setMode("chamber")}>{selected.name}&apos;s Profile</button>
          <button className={mode === "council" ? styles.navActive : ""} onClick={() => setMode("council")}>Convene Council</button>
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


            </>
          )}

          {mode === "council" && (
            <>
              <section className={`${styles.roomHeading} ${transitions.councilHeading}`}>
                <div><p className={styles.kicker}>COUNCIL TABLE</p><h2>Bring a decision to the Council.</h2></div>
                <div className={styles.zeroCallBadge}>Artist-gated intelligence</div>
              </section>

              <section className={`${styles.councilPanel} ${transitions.councilPanel}`}>
                <div className={styles.councilRoster}>
                  {MUSE_DIRECTORY.map((muse) => {
                    const active = councilIds.includes(muse.id);
                    return <button key={muse.id} className={active ? styles.councilSelected : ""} onClick={() => toggleCouncilMuse(muse.id)}><span>{muse.symbol}</span><strong>{muse.name}</strong><small>{muse.role}</small></button>;
                  })}
                </div>
                <div className={styles.councilComposer}>
                  <p className={styles.kicker}>COUNCIL REVIEW · {councilIds.length}/3</p>
                  <h3>Choose one lead, optionally two perspectives.</h3>
                  <p className={styles.panelCopy}>The first selected Muse owns the question. Other selected perspectives provide context; they are not automatically contacted or fueled. Preparing the quest costs no AI tokens.</p>
                  <label className={styles.councilQuestionLabel} htmlFor="council-question">Decision question</label><textarea id="council-question" className={styles.largeInput} maxLength={900} value={councilQuestion} onChange={(event) => setCouncilQuestion(event.target.value)} placeholder="What should we decide, test, or make?" />
                  <p className={styles.councilLead}>{councilIds.length ? `Accountable: ${MUSE_BY_ID[councilIds[0]].name}` : "Select the accountable Muse first."}</p><button className={styles.primaryButton} disabled={!councilIds.length || !councilQuestion.trim()} onClick={prepareCouncilReview}>Continue to Intelligence →</button>
                  <button className={styles.textButton} onClick={() => { setCouncilIds([]); setCouncilQuestion(""); }}>Clear</button>
                </div>
              </section>
            </>
          )}
        </div>

        <footer className={`${styles.footerNote} ${polish.footerNote}`}>
          <span>THE MUSEUM</span>
          <p>Character · Presence · Real contributions. Wizard OS remains the operational system.</p>
        </footer>
      </section>
    </main>
  );
}
