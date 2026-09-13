"use client";

import { useEffect, useMemo, useState } from "react";
import type { MuseId } from "../../lib/museum";
import ChamberChat from "./ChamberChat";
import styles from "./museum.module.css";

type SharedProject = {
  id: string;
  title: string;
  kind?: string;
  type?: string;
  status?: string;
  statusEnum?: string;
  progress?: number;
  next?: string;
  nextAction?: string | null;
  due?: string;
};

type Muse = {
  id: MuseId;
  name: string;
  mythicSeat: string;
  role: string;
  secondary: string;
  domain: string;
  voice: string;
  symbol: string;
  palette: string;
};

const MUSES: Muse[] = [
  { id: "callista", name: "Callista", mythicSeat: "Calliope", role: "Executive Strategist", secondary: "Long-horizon strategy & priorities", domain: "Career direction, portfolio architecture, pricing philosophy, major investments, partnerships and legacy.", voice: "Measured · discerning · decisive", symbol: "☉", palette: "callista" },
  { id: "aurelia", name: "Aurelia", mythicSeat: "Erato", role: "Aesthetic Director", secondary: "Fine art · branding · presentation", domain: "Fine-art presentation, Spellmark art direction, visual refinement, color, typography, photography styling and portfolio curation.", voice: "Warm · cultivated · exacting", symbol: "✧", palette: "aurelia" },
  { id: "lyra", name: "Lyra", mythicSeat: "Euterpe", role: "Content Director", secondary: "YouTube · storytelling · publishing", domain: "Video, Shorts, narrative pacing, voiceover, editing rhythm, hooks, recurring content series and publishing cadence.", voice: "Quick · vivid · rhythmic", symbol: "♫", palette: "lyra" },
  { id: "cleo", name: "Cleo", mythicSeat: "Clio", role: "Archivist", secondary: "Money · Finance · Treasury", domain: "Records, provenance and continuity, with a council portfolio for money, finance, treasury and financial interpretation.", voice: "Precise · observant · orderly", symbol: "⌘", palette: "cleo" },
  { id: "novy", name: "Novy", mythicSeat: "Urania", role: "Systems Architect", secondary: "Wizard OS · orchestration · automation", domain: "Wizard OS, systems design, technical implementation, automation, workflows, decision architecture and cross-Muse orchestration.", voice: "Curious · synthetic · lightly conspiratorial", symbol: "✦", palette: "novy" },
  { id: "seraphine", name: "Seraphine", mythicSeat: "Polyhymnia", role: "Keeper of Meaning", secondary: "Scholarship · Research · Academia", domain: "Purpose, symbolism and values, with a council portfolio for scholarship, research, homework and academic synthesis.", voice: "Measured · calm · thoughtful", symbol: "◇", palette: "seraphine" },
  { id: "tessa", name: "Tessa", mythicSeat: "Terpsichore", role: "Lifestyle Operator", secondary: "Routines · logistics · sustainable flow", domain: "Daily routines, workspace flow, ergonomics, travel logistics, sustainable scheduling, movement and home organization.", voice: "Direct · friendly · practical", symbol: "◌", palette: "tessa" },
  { id: "thalia", name: "Thalia", mythicSeat: "Thalia", role: "Creative Provocateur", secondary: "Experiments · naming · divergent ideas", domain: "Brainstorming, naming, playful marketing, experiments, unexpected products, creative exercises and pattern interruption.", voice: "Quick · funny · lateral", symbol: "✺", palette: "thalia" },
  { id: "melina", name: "Melina", mythicSeat: "Melpomene", role: "Risk Officer", secondary: "Medicine · Health · Vitality", domain: "Risk analysis, quality assurance and pre-mortems, with a council portfolio for medicine, health and vitality.", voice: "Surgical · calm · unsentimental", symbol: "△", palette: "melina" },
];

const ACTIVE_STATUSES = new Set(["PLANNED", "ACTIVE", "WAITING", "BLOCKED"]);

function projectState(project: SharedProject) {
  return project.statusEnum ?? project.status ?? "Active";
}

function prettyStatus(value: string) {
  return value.replaceAll("_", " ").toLowerCase().replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export default function MuseumPage() {
  const [selectedId, setSelectedId] = useState<MuseId>("novy");
  const [room, setRoom] = useState<"select" | "chamber">("select");
  const [selectionMode, setSelectionMode] = useState<"single" | "party">("single");
  const [party, setParty] = useState<MuseId[]>([]);
  const [projects, setProjects] = useState<SharedProject[]>([]);
  const [contextState, setContextState] = useState<"loading" | "live" | "unavailable">("loading");

  useEffect(() => {
    const savedMuse = localStorage.getItem("wizard-os-museum-selected-muse") as MuseId | null;
    const savedParty = localStorage.getItem("wizard-os-museum-party");
    if (savedMuse && MUSES.some((muse) => muse.id === savedMuse)) setSelectedId(savedMuse);
    if (savedParty) {
      try {
        const parsed = JSON.parse(savedParty) as MuseId[];
        setParty(parsed.filter((id) => MUSES.some((muse) => muse.id === id)).slice(0, 3));
      } catch {}
    }
  }, []);

  useEffect(() => {
    fetch("/api/projects")
      .then((response) => {
        if (!response.ok) throw new Error("Shared project context unavailable");
        return response.json();
      })
      .then((data: SharedProject[]) => {
        setProjects(Array.isArray(data) ? data : []);
        setContextState("live");
      })
      .catch(() => setContextState("unavailable"));
  }, []);

  const selected = MUSES.find((muse) => muse.id === selectedId) ?? MUSES[4];
  const activeProjects = useMemo(
    () => projects.filter((project) => {
      const state = project.statusEnum ?? project.status;
      return !state || ACTIVE_STATUSES.has(state) || !["COMPLETE", "ARCHIVED"].includes(state);
    }),
    [projects],
  );

  const selectMuse = (id: MuseId) => {
    if (selectionMode === "party") {
      setParty((current) => {
        if (current.includes(id)) return current.filter((item) => item !== id);
        if (current.length >= 3) return current;
        return [...current, id];
      });
      return;
    }
    setSelectedId(id);
    localStorage.setItem("wizard-os-museum-selected-muse", id);
  };

  const enterChamber = () => {
    localStorage.setItem("wizard-os-museum-selected-muse", selected.id);
    setRoom("chamber");
  };

  const saveParty = () => localStorage.setItem("wizard-os-museum-party", JSON.stringify(party));

  if (room === "chamber") {
    return (
      <main className={styles.page} data-palette={selected.palette}>
        <div className={styles.atmosphere} />
        <section className={styles.chamberShell}>
          <header className={styles.chamberHeader}>
            <button className={styles.textButton} onClick={() => setRoom("select")}>← Character Select</button>
            <div style={{ display: "flex", gap: 8 }}>
              <a className={styles.textButton} href="/museum/quests">Quest Board</a>
              <a className={styles.textButton} href="/">Return to Wizard OS</a>
            </div>
          </header>

          <section className={styles.chamberHero}>
            <div className={styles.chamberPortrait}>
              <span>{selected.symbol}</span>
              <small>{selected.mythicSeat}</small>
            </div>
            <div className={styles.chamberIdentity}>
              <p className={styles.kicker}>THE MUSEUM · ACTIVE OPERATOR</p>
              <h1>{selected.name}</h1>
              <h2>{selected.role}</h2>
              <p className={styles.secondary}>{selected.secondary}</p>
              <p className={styles.domain}>{selected.domain}</p>
              <div className={styles.voice}>{selected.voice}</div>
            </div>
          </section>

          <ChamberChat muse={{ id: selected.id, name: selected.name, role: selected.role, symbol: selected.symbol }} />

          <section className={styles.contextPanel}>
            <div className={styles.sectionHeading}>
              <div>
                <p className={styles.kicker}>SHARED WORLD STATE</p>
                <h2>Wizard OS Context</h2>
              </div>
              <span className={`${styles.contextBadge} ${contextState === "live" ? styles.live : ""}`}>
                {contextState === "loading" ? "Connecting" : contextState === "live" ? "Live" : "Unavailable"}
              </span>
            </div>
            <p className={styles.contextExplanation}>
              This chamber and every other Muse read the same Wizard OS project world. The conversation automatically receives active projects and this Muse&apos;s assigned quests; use the chat context picker when you want to focus attention on one project.
            </p>

            <div className={styles.contextStats}>
              <div><span>Shared projects</span><strong>{projects.length}</strong></div>
              <div><span>Active world items</span><strong>{activeProjects.length}</strong></div>
              <div><span>Current operator</span><strong>{selected.name}</strong></div>
            </div>

            <div className={styles.projectList}>
              {contextState === "loading" && <p className={styles.empty}>Reading Wizard OS project context…</p>}
              {contextState === "unavailable" && <p className={styles.empty}>The Museum is available, but shared project context could not be read.</p>}
              {contextState === "live" && activeProjects.length === 0 && <p className={styles.empty}>No active shared projects were returned.</p>}
              {activeProjects.slice(0, 8).map((project) => (
                <article className={styles.projectCard} key={project.id}>
                  <div><span>{project.kind ?? project.type ?? "Project"}</span><h3>{project.title}</h3></div>
                  <div className={styles.projectMeta}><strong>{prettyStatus(projectState(project))}</strong><span>{typeof project.progress === "number" ? `${project.progress}%` : "Shared"}</span></div>
                  <p>{project.next ?? project.nextAction ?? "No next action recorded."}</p>
                </article>
              ))}
            </div>
          </section>

          <section className={styles.phaseNotice}>
            <strong>Museum v0.6 · Chamber Chat</strong>
            <span>Conversation is persistent and shared-context aware. Recommendations remain advisory until converted into a Quest or approved through the Museum&apos;s existing approval gates.</span>
          </section>
        </section>
      </main>
    );
  }

  return (
    <main className={styles.page} data-palette={selected.palette}>
      <div className={styles.atmosphere} />
      <section className={styles.selectShell}>
        <header className={styles.topbar}>
          <a className={styles.backLink} href="/">← Wizard OS</a>
          <div className={styles.titleBlock}>
            <p className={styles.kicker}>NINE OPERATORS · ONE SHARED WORLD</p>
            <h1>The Museum</h1>
            <p>Choose the mind that should lead. Enter her chamber to talk directly.</p>
          </div>
          <div className={styles.worldStatus}>
            <span className={contextState === "live" ? styles.statusLightLive : styles.statusLight} />
            {contextState === "loading" ? "Connecting context" : contextState === "live" ? `${activeProjects.length} active world items` : "Context offline"}
          </div>
        </header>

        <div className={styles.modeBar}>
          <button className={selectionMode === "single" ? styles.modeActive : ""} onClick={() => setSelectionMode("single")}>Character Select</button>
          <button className={selectionMode === "party" ? styles.modeActive : ""} onClick={() => setSelectionMode("party")}>Council Party</button>
          <span>{selectionMode === "single" ? "Select one Muse, then enter her chamber to converse." : `Choose up to three operators for a quest party · ${party.length}/3`}</span>
        </div>

        <section className={styles.selectionLayout}>
          <div className={styles.roster}>
            {MUSES.map((muse) => {
              const isSelected = selectionMode === "single" ? selected.id === muse.id : party.includes(muse.id);
              return (
                <button key={muse.id} className={`${styles.museCard} ${isSelected ? styles.museSelected : ""}`} data-palette={muse.palette} onClick={() => selectMuse(muse.id)} aria-pressed={isSelected}>
                  <div className={styles.characterFrame}>
                    <span className={styles.characterSigil}>{muse.symbol}</span>
                    <div className={styles.characterGlow} />
                    {selectionMode === "party" && <span className={styles.partyMarker}>{party.includes(muse.id) ? party.indexOf(muse.id) + 1 : "+"}</span>}
                  </div>
                  <div className={styles.cardCopy}><span>{muse.mythicSeat}</span><h2>{muse.name}</h2><strong>{muse.role}</strong><p>{muse.secondary}</p></div>
                </button>
              );
            })}
          </div>

          <aside className={styles.selectionPanel}>
            {selectionMode === "single" ? (
              <>
                <p className={styles.kicker}>SELECTED OPERATOR</p>
                <div className={styles.selectedSigil}>{selected.symbol}</div>
                <h2>{selected.name}</h2>
                <h3>{selected.role}</h3>
                <span className={styles.secondary}>{selected.secondary}</span>
                <p>{selected.domain}</p>
                <div className={styles.detailRule} />
                <dl>
                  <div><dt>Voice</dt><dd>{selected.voice}</dd></div>
                  <div><dt>Shared context</dt><dd>{contextState === "live" ? "Connected" : contextState === "loading" ? "Connecting" : "Unavailable"}</dd></div>
                  <div><dt>Conversation</dt><dd>Persistent Chamber Chat</dd></div>
                </dl>
                <button className={styles.enterButton} onClick={enterChamber}>Enter {selected.name}&apos;s Chamber →</button>
              </>
            ) : (
              <>
                <p className={styles.kicker}>COUNCIL PARTY</p>
                <h2>Quest Roster</h2>
                <p>Select up to three Muses. The saved roster can be reused when assigning Museum quests.</p>
                <div className={styles.partyList}>
                  {party.length === 0 && <span className={styles.emptyParty}>No operators selected.</span>}
                  {party.map((id, index) => {
                    const muse = MUSES.find((item) => item.id === id)!;
                    return <div key={id}><span>{index + 1}</span><strong>{muse.name}</strong><small>{muse.role}</small></div>;
                  })}
                </div>
                <button className={styles.enterButton} disabled={party.length === 0} onClick={saveParty}>Save Council Party</button>
                <button className={styles.clearButton} onClick={() => setParty([])}>Clear party</button>
              </>
            )}
          </aside>
        </section>

        <footer className={styles.footerNote}>
          <span>THE MUSEUM · v0.6</span>
          <p>Character select, persistent Chamber Chat, shared context, Quest Board, Council actions, Muse responses and approval gates now inhabit one Museum world.</p>
        </footer>
      </section>
    </main>
  );
}
