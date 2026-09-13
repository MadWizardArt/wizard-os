"use client";

import { useEffect, useMemo, useState } from "react";
import { MUSE_BY_ID } from "../../../lib/museum-directory";
import type { MuseId } from "../../../lib/museum";
import type { BriefStatus } from "../../../lib/museum-brief-storage";
import styles from "./briefs.module.css";

type MuseumBrief = {
  id: string;
  title: string;
  objective: string;
  status: BriefStatus;
  leadMuseId: MuseId;
  supportMuseIds: MuseId[];
  linkedProjectId: string | null;
  project: { id: string; title: string } | null;
  nextAction: string;
  updatedAt: string;
};

const CLOSED = new Set<BriefStatus>(["COMPLETE", "DEFERRED"]);

function prettyStatus(status: BriefStatus) {
  return status.replaceAll("_", " ").toLowerCase().replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function formatDate(value: string) {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value : parsed.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export default function ManageMuseumBriefsPage() {
  const [briefs, setBriefs] = useState<MuseumBrief[]>([]);
  const [loading, setLoading] = useState(true);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  const [filter, setFilter] = useState<"all" | "active" | "closed">("all");

  const loadBriefs = async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/museum/briefs", { cache: "no-store" });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Briefs could not be loaded.");
      setBriefs(Array.isArray(payload) ? payload : []);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Briefs could not be loaded.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadBriefs();
  }, []);

  const activeCount = useMemo(() => briefs.filter((brief) => !CLOSED.has(brief.status)).length, [briefs]);
  const closedCount = briefs.length - activeCount;
  const visibleBriefs = useMemo(() => briefs.filter((brief) => {
    if (filter === "active") return !CLOSED.has(brief.status);
    if (filter === "closed") return CLOSED.has(brief.status);
    return true;
  }), [briefs, filter]);

  const deleteBrief = async (brief: MuseumBrief) => {
    const linkedWarning = brief.project
      ? `\n\nIts linked Wizard OS project “${brief.project.title}” will NOT be deleted.`
      : "";
    const confirmed = window.confirm(
      `Permanently delete the Museum Brief “${brief.title}”?\n\nThis removes the Brief and its Museum history. This cannot be undone.${linkedWarning}`,
    );
    if (!confirmed) return;

    setDeletingId(brief.id);
    setNotice("");
    try {
      const response = await fetch(`/api/museum/briefs/${encodeURIComponent(brief.id)}`, { method: "DELETE" });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Brief could not be deleted.");
      setBriefs((current) => current.filter((item) => item.id !== brief.id));
      setNotice(`Deleted “${brief.title}”. Linked Wizard OS records were left untouched.`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Brief could not be deleted.");
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <main className={styles.page}>
      <div className={styles.atmosphere} />
      <section className={styles.shell}>
        <header className={styles.header}>
          <div>
            <p className={styles.kicker}>THE MUSEUM · HOUSEKEEPING</p>
            <h1>Manage Briefs</h1>
            <p>Keep the Council Table useful. Delete Briefs that no longer deserve permanent Museum space.</p>
          </div>
          <a href="/museum">← Return to The Museum</a>
        </header>

        <section className={styles.summary}>
          <button className={filter === "all" ? styles.activeFilter : ""} onClick={() => setFilter("all")}><strong>{briefs.length}</strong><span>All</span></button>
          <button className={filter === "active" ? styles.activeFilter : ""} onClick={() => setFilter("active")}><strong>{activeCount}</strong><span>Active</span></button>
          <button className={filter === "closed" ? styles.activeFilter : ""} onClick={() => setFilter("closed")}><strong>{closedCount}</strong><span>Complete / Deferred</span></button>
        </section>

        {notice && <div className={styles.notice}>{notice}</div>}

        <section className={styles.warning}>
          <strong>Permanent means permanent.</strong>
          <p>Delete removes only the selected Museum Brief and its embedded Brief history. A linked Wizard OS project, artwork, campaign, inventory record, sale, or other operational record is not deleted.</p>
        </section>

        <section className={styles.list}>
          {loading && <p className={styles.empty}>Reading Museum Briefs…</p>}
          {!loading && visibleBriefs.length === 0 && <p className={styles.empty}>No Briefs match this filter.</p>}
          {visibleBriefs.map((brief) => {
            const lead = MUSE_BY_ID[brief.leadMuseId];
            return (
              <article key={brief.id} className={styles.card}>
                <div className={styles.identity}>
                  <span>{prettyStatus(brief.status)}</span>
                  <h2>{brief.title}</h2>
                  <p>{brief.objective || "No objective recorded."}</p>
                </div>
                <dl>
                  <div><dt>Lead</dt><dd>{lead?.name ?? brief.leadMuseId}</dd></div>
                  <div><dt>Support</dt><dd>{brief.supportMuseIds.length}</dd></div>
                  <div><dt>Linked project</dt><dd>{brief.project?.title ?? "None"}</dd></div>
                  <div><dt>Next action</dt><dd>{brief.nextAction || "None recorded"}</dd></div>
                  <div><dt>Updated</dt><dd>{formatDate(brief.updatedAt)}</dd></div>
                </dl>
                <button
                  className={styles.deleteButton}
                  disabled={deletingId === brief.id}
                  onClick={() => void deleteBrief(brief)}
                >
                  {deletingId === brief.id ? "Deleting…" : "Delete Brief Permanently"}
                </button>
              </article>
            );
          })}
        </section>

        <footer>
          <span>Zero inference · No Gateway call</span>
          <p>Housekeeping is deterministic database work only.</p>
        </footer>
      </section>
    </main>
  );
}
