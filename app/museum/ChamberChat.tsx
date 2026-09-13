"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import type { MuseId } from "../../lib/museum";
import styles from "./ChamberChat.module.css";

type ChamberMessage = {
  id: string;
  role: "USER" | "MUSE";
  museId: MuseId;
  content: string;
  createdAt: string;
  model: string;
  error: string;
  contextProjectId: string | null;
};

type ChamberState = {
  id: string;
  museId: MuseId;
  messages: ChamberMessage[];
  createdAt: string;
  updatedAt: string;
  generationError?: string | null;
};

type ProjectOption = {
  id: string;
  title: string;
  kind?: string;
  type?: string;
  status?: string;
  statusEnum?: string;
};

export default function ChamberChat({ muse }: { muse: { id: MuseId; name: string; role: string; symbol: string } }) {
  const [state, setState] = useState<ChamberState | null>(null);
  const [projects, setProjects] = useState<ProjectOption[]>([]);
  const [message, setMessage] = useState("");
  const [contextProjectId, setContextProjectId] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [creatingQuest, setCreatingQuest] = useState(false);
  const [createdQuestId, setCreatedQuestId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const bottomRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setLoading(true);
    setError("");
    setCreatedQuestId(null);
    Promise.all([
      fetch(`/api/museum/chambers/${muse.id}`).then(async (response) => {
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error ?? "Chamber conversation is unavailable.");
        return payload as ChamberState;
      }),
      fetch("/api/projects").then(async (response) => response.ok ? response.json() as Promise<ProjectOption[]> : []),
    ])
      .then(([chamber, projectData]) => {
        setState(chamber);
        setProjects(Array.isArray(projectData) ? projectData : []);
      })
      .catch((loadError) => setError(loadError instanceof Error ? loadError.message : "Chamber conversation is unavailable."))
      .finally(() => setLoading(false));
  }, [muse.id]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [state?.messages.length, sending]);

  const contextProject = useMemo(
    () => projects.find((project) => project.id === contextProjectId) ?? null,
    [contextProjectId, projects],
  );

  const send = async (event?: FormEvent) => {
    event?.preventDefault();
    const content = message.trim();
    if (!content || sending) return;
    setSending(true);
    setCreatedQuestId(null);
    setError("");

    const optimistic: ChamberMessage = {
      id: `optimistic-${Date.now()}`,
      role: "USER",
      museId: muse.id,
      content,
      createdAt: new Date().toISOString(),
      model: "",
      error: "",
      contextProjectId: contextProjectId || null,
    };
    const previous = state;
    setState((current) => current ? { ...current, messages: [...current.messages, optimistic] } : current);
    setMessage("");

    try {
      const response = await fetch(`/api/museum/chambers/${muse.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: content, contextProjectId: contextProjectId || null }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "The Muse could not respond.");
      setState(payload as ChamberState);
      if (payload.generationError) setError(payload.generationError);
    } catch (sendError) {
      setState(previous);
      setMessage(content);
      setError(sendError instanceof Error ? sendError.message : "The Muse could not respond.");
    } finally {
      setSending(false);
    }
  };

  const clearConversation = async () => {
    if (sending || creatingQuest || !state?.messages.length) return;
    setError("");
    setCreatedQuestId(null);
    try {
      const response = await fetch(`/api/museum/chambers/${muse.id}`, { method: "DELETE" });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "Could not clear this chamber.");
      setState(payload as ChamberState);
    } catch (clearError) {
      setError(clearError instanceof Error ? clearError.message : "Could not clear this chamber.");
    }
  };

  const createQuestFromConversation = async () => {
    if (creatingQuest || !state?.messages.length) return;
    if (createdQuestId) {
      window.location.href = "/museum/quests";
      return;
    }

    const recent = state.messages.filter((item) => item.content).slice(-8);
    const lastUser = [...recent].reverse().find((item) => item.role === "USER");
    const subject = lastUser?.content.replace(/\s+/g, " ").trim() || "Chamber follow-up";
    const title = `${muse.name} · ${subject.slice(0, 88 - muse.name.length)}`.slice(0, 120);
    const brief = [
      `Created from ${muse.name}'s Chamber conversation.`,
      ...recent.map((item) => `${item.role === "USER" ? "Artist" : muse.name}: ${item.content}`),
    ].join("\n\n").slice(0, 2500);

    setCreatingQuest(true);
    setError("");
    try {
      const response = await fetch("/api/museum/quests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          brief,
          projectId: contextProjectId || null,
          assignments: [{ museId: muse.id, role: "LEAD", note: "Created from Chamber Chat" }],
        }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "Could not create a quest from this conversation.");
      setCreatedQuestId(payload.id as string);
    } catch (questError) {
      setError(questError instanceof Error ? questError.message : "Could not create a quest from this conversation.");
    } finally {
      setCreatingQuest(false);
    }
  };

  return (
    <section className={styles.chatShell}>
      <header className={styles.chatHeader}>
        <div>
          <p>CHAMBER CONVERSATION</p>
          <h2>Speak with {muse.name}</h2>
          <span>Persistent conversation · shared Wizard OS context · approval-gated actions</span>
        </div>
        <div className={styles.headerActions}>
          <button disabled={sending || creatingQuest || !state?.messages.length} onClick={() => void createQuestFromConversation()}>
            {creatingQuest ? "Creating Quest…" : createdQuestId ? "View Quest ✓" : "Create Quest"}
          </button>
          <a href="/museum/quests">Quest Board</a>
          <button disabled={sending || creatingQuest || !state?.messages.length} onClick={() => void clearConversation()}>Clear</button>
        </div>
      </header>

      <div className={styles.contextBar}>
        <label>
          <span>Focus context</span>
          <select disabled={sending} value={contextProjectId} onChange={(event) => setContextProjectId(event.target.value)}>
            <option value="">Automatic shared context</option>
            {projects.map((project) => <option key={project.id} value={project.id}>{project.title}</option>)}
          </select>
        </label>
        <div>
          <strong>{contextProject ? contextProject.title : "World context"}</strong>
          <span>{contextProject ? `${contextProject.kind ?? contextProject.type ?? "Project"} · ${contextProject.status ?? contextProject.statusEnum ?? "Active"}` : "Active projects + this Muse's assigned quests are included automatically."}</span>
        </div>
      </div>

      <div className={styles.messages}>
        {loading && <div className={styles.empty}>Opening {muse.name}&apos;s chamber conversation…</div>}
        {!loading && !state?.messages.length && (
          <div className={styles.welcome}>
            <span>{muse.symbol}</span>
            <div>
              <strong>{muse.name} is listening.</strong>
              <p>Ask a question, brainstorm an idea, discuss a project, or request her specialist perspective. Conversation itself cannot change Wizard OS without your approval.</p>
            </div>
          </div>
        )}
        {state?.messages.map((item) => (
          <article className={item.role === "USER" ? styles.userMessage : styles.museMessage} key={item.id}>
            <header>
              <span>{item.role === "USER" ? "YOU" : muse.symbol}</span>
              <strong>{item.role === "USER" ? "Artist" : muse.name}</strong>
              <small>{new Date(item.createdAt).toLocaleString()}</small>
            </header>
            {item.content && <p>{item.content}</p>}
            {item.error && <p className={styles.messageError}>{item.error}</p>}
            {item.role === "MUSE" && item.model && <footer>{item.model}</footer>}
          </article>
        ))}
        {sending && (
          <article className={styles.museMessage}>
            <header><span>{muse.symbol}</span><strong>{muse.name}</strong></header>
            <div className={styles.thinking}><i /><i /><i /><span>Considering the shared context…</span></div>
          </article>
        )}
        <div ref={bottomRef} />
      </div>

      {createdQuestId && <div className={styles.error}>Quest created. It is now persistent work led by {muse.name}; use “View Quest ✓” or Quest Board to continue it.</div>}
      {error && <div className={styles.error}>{error}</div>}

      <form className={styles.composer} onSubmit={(event) => void send(event)}>
        <textarea
          maxLength={4000}
          disabled={sending || loading}
          value={message}
          onChange={(event) => setMessage(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              void send();
            }
          }}
          placeholder={`Message ${muse.name}…`}
        />
        <div className={styles.composerFooter}>
          <span>Enter to send · Shift+Enter for a new line</span>
          <button disabled={sending || loading || !message.trim()} type="submit">{sending ? "Responding…" : "Send"}</button>
        </div>
      </form>
    </section>
  );
}
