"use client";

import { useEffect, useMemo, useState } from "react";
import { MUSE_BY_ID } from "../../../../lib/museum-directory";
import type { MuseId } from "../../../../lib/museum";
import type { BriefStatus } from "../../../../lib/museum-brief-storage";

type MuseumBrief = {
  id: string;
  title: string;
  objective: string;
  status: BriefStatus;
  leadMuseId: MuseId;
  supportMuseIds: MuseId[];
  linkedProjectId: string | null;
  nextAction: string;
  updatedAt: string;
};

type Filter = "ALL" | "ACTIVE" | "CLOSED";

const CLOSED = new Set<BriefStatus>(["COMPLETE", "DEFERRED"]);

function prettyStatus(status: BriefStatus) {
  return status.replaceAll("_", " ").toLowerCase().replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function museName(id: MuseId) {
  return MUSE_BY_ID[id]?.name ?? id;
}

function formatDate(value: string) {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value : parsed.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export default function ManageMuseumBriefsPage() {
  const [briefs, setBriefs] = useState<MuseumBrief[]>([]);
  const [filter, setFilter] = useState<Filter>("ALL");
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [notice, setNotice] = useState("");

  const loadBriefs = async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/museum/briefs", { cache: "no-store" });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Briefs could not be read.");
      setBriefs(Array.isArray(payload) ? payload : []);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Briefs could not be read.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadBriefs();
  }, []);

  const visible = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return briefs.filter((brief) => {
      const closed = CLOSED.has(brief.status);
      if (filter === "ACTIVE" && closed) return false;
      if (filter === "CLOSED" && !closed) return false;
      if (!normalized) return true;
      return [brief.title, brief.objective, brief.nextAction, museName(brief.leadMuseId)]
        .some((value) => value?.toLowerCase().includes(normalized));
    });
  }, [briefs, filter, query]);

  const activeCount = briefs.filter((brief) => !CLOSED.has(brief.status)).length;
  const closedCount = briefs.length - activeCount;

  const deleteBrief = async (brief: MuseumBrief) => {
    const linkedNote = brief.linkedProjectId
      ? "\n\nIts linked Wizard OS project will remain completely intact."
      : "";
    const confirmed = window.confirm(
      `Permanently delete “${brief.title}”?\n\nThis removes the Museum Brief and its Museum history. This cannot be undone.${linkedNote}`,
    );
    if (!confirmed) return;

    setDeletingId(brief.id);
    try {
      const response = await fetch(`/api/museum/briefs/${encodeURIComponent(brief.id)}`, { method: "DELETE" });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Brief could not be deleted.");
      setBriefs((current) => current.filter((item) => item.id !== brief.id));
      setNotice(`Deleted “${brief.title}”. Linked Wizard OS records were not changed.`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Brief could not be deleted.");
    } finally {
      setDeletingId(null);
    }
  };

  const buttonStyle = (active: boolean) => ({
    border: `1px solid ${active ? "rgba(205,174,105,.5)" : "rgba(255,255,255,.08)"}`,
    background: active ? "rgba(125,98,49,.22)" : "rgba(255,255,255,.025)",
    color: active ? "#ead8a8" : "#89939d",
    borderRadius: 999,
    padding: "8px 12px",
    cursor: "pointer",
    font: "700 9px/1 system-ui, sans-serif",
    letterSpacing: ".08em",
    textTransform: "uppercase" as const,
  });

  return (
    <main style={{ minHeight: "100vh", background: "#080b10", color: "#e8e3d8", padding: "34px 18px 88px", fontFamily: "system-ui, sans-serif" }}>
      <section style={{ width: "min(1120px, 100%)", margin: "0 auto" }}>
        <header style={{ display: "flex", justifyContent: "space-between", gap: 24, alignItems: "flex-start", flexWrap: "wrap" }}>
          <div>
            <p style={{ margin: 0, color: "#c8aa68", fontSize: 9, fontWeight: 800, letterSpacing: ".18em" }}>THE MUSEUM · BRIEF HYGIENE</p>
            <h1 style={{ margin: "8px 0 10px", font: "500 clamp(2.3rem, 5vw, 4.4rem)/.95 Georgia, serif" }}>Manage Briefs</h1>
            <p style={{ maxWidth: 720, margin: 0, color: "#8f98a3", lineHeight: 1.65, fontSize: 13 }}>
              Keep useful Briefs. Delete the ones that have outlived their value. Deletion is permanent and applies only to the Museum Brief record—linked Wizard OS projects are never deleted here.
            </p>
          </div>
          <a href="/museum" style={{ color: "#d9c58f", textDecoration: "none", fontSize: 11, fontWeight: 800, letterSpacing: ".08em", textTransform: "uppercase" }}>← Back to Museum</a>
        </header>

        {notice && (
          <button onClick={() => setNotice("")} style={{ width: "100%", marginTop: 22, padding: "12px 14px", border: "1px solid rgba(204,172,103,.25)", borderRadius: 8, background: "rgba(103,82,42,.12)", color: "#d8c797", textAlign: "left", cursor: "pointer" }}>
            {notice} <span style={{ float: "right" }}>×</span>
          </button>
        )}

        <section style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 10, marginTop: 26 }}>
          {[
            ["Total Briefs", briefs.length],
            ["Active", activeCount],
            ["Closed", closedCount],
          ].map(([label, value]) => (
            <div key={String(label)} style={{ padding: 16, border: "1px solid rgba(255,255,255,.06)", borderRadius: 9, background: "rgba(255,255,255,.02)" }}>
              <span style={{ display: "block", color: "#69737d", fontSize: 9, fontWeight: 800, textTransform: "uppercase", letterSpacing: ".08em" }}>{label}</span>
              <strong style={{ display: "block", marginTop: 6, font: "500 24px/1 Georgia, serif" }}>{value}</strong>
            </div>
          ))}
        </section>

        <section style={{ display: "flex", gap: 8, marginTop: 20, alignItems: "center", flexWrap: "wrap" }}>
          {(["ALL", "ACTIVE", "CLOSED"] as Filter[]).map((item) => <button key={item} onClick={() => setFilter(item)} style={buttonStyle(filter === item)}>{item}</button>)}
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search Briefs…" style={{ flex: "1 1 260px", minWidth: 220, padding: "10px 12px", border: "1px solid rgba(255,255,255,.08)", borderRadius: 8, background: "rgba(255,255,255,.025)", color: "#e8e3d8", outline: "none" }} />
        </section>

        <section style={{ display: "grid", gap: 10, marginTop: 18 }}>
          {loading && <p style={{ color: "#7f8993" }}>Reading Briefs…</p>}
          {!loading && visible.length === 0 && <p style={{ padding: 30, border: "1px dashed rgba(255,255,255,.08)", borderRadius: 9, color: "#737d87", textAlign: "center" }}>No Briefs match this view.</p>}
          {visible.map((brief) => {
            const closed = CLOSED.has(brief.status);
            return (
              <article key={brief.id} style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) auto", gap: 16, alignItems: "center", padding: 16, border: "1px solid rgba(255,255,255,.065)", borderRadius: 9, background: closed ? "rgba(255,255,255,.015)" : "rgba(16,22,29,.88)" }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                    <span style={{ color: closed ? "#7c858e" : "#cbb172", fontSize: 9, fontWeight: 800, letterSpacing: ".08em", textTransform: "uppercase" }}>{prettyStatus(brief.status)}</span>
                    <span style={{ color: "#606a74", fontSize: 9 }}>·</span>
                    <span style={{ color: "#8e98a2", fontSize: 9, fontWeight: 700 }}>{museName(brief.leadMuseId)} Lead</span>
                  </div>
                  <h2 style={{ margin: "7px 0 6px", font: "500 20px/1.2 Georgia, serif" }}>{brief.title}</h2>
                  <p style={{ margin: 0, color: "#858f99", fontSize: 11, lineHeight: 1.55 }}>{brief.objective || brief.nextAction || "No objective recorded."}</p>
                  <small style={{ display: "block", marginTop: 8, color: "#5f6973" }}>Updated {formatDate(brief.updatedAt)}{brief.linkedProjectId ? " · Linked to Wizard OS project" : ""}</small>
                </div>
                <button
                  disabled={deletingId === brief.id}
                  onClick={() => void deleteBrief(brief)}
                  style={{ minWidth: 118, padding: "10px 12px", border: "1px solid rgba(196,89,89,.55)", borderRadius: 8, background: "rgba(106,39,39,.22)", color: "#e6a1a1", cursor: deletingId === brief.id ? "wait" : "pointer", fontSize: 10, fontWeight: 800, letterSpacing: ".06em", textTransform: "uppercase" }}
                >
                  {deletingId === brief.id ? "Deleting…" : "Delete Brief"}
                </button>
              </article>
            );
          })}
        </section>

        <section style={{ marginTop: 22, padding: 16, borderLeft: "2px solid rgba(196,89,89,.48)", background: "rgba(106,39,39,.08)" }}>
          <strong style={{ display: "block", color: "#d79a9a", fontSize: 10, textTransform: "uppercase", letterSpacing: ".08em" }}>Permanent cleanup</strong>
          <p style={{ margin: "7px 0 0", color: "#78838d", fontSize: 11, lineHeight: 1.55 }}>Complete or Deferred preserves a Brief in the Archive. Delete removes that Brief and its Museum history entirely. Use deletion when the record no longer earns its place.</p>
        </section>
      </section>
    </main>
  );
}
