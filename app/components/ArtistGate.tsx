"use client";

import { FormEvent, useEffect, useState } from "react";
import styles from "./ArtistGate.module.css";

type SessionState = {
  authenticated: boolean;
  configured: boolean;
};

async function readSession() {
  const response = await fetch("/api/museum/artist-session", { cache: "no-store" });
  if (!response.ok) throw new Error("Artist Gate status is unavailable.");
  return response.json() as Promise<SessionState>;
}

export default function ArtistGate({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<SessionState | null>(null);
  const [accessKey, setAccessKey] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let active = true;
    void readSession()
      .then((next) => { if (active) setSession(next); })
      .catch((reason) => { if (active) setError(reason instanceof Error ? reason.message : "Artist Gate status is unavailable."); });
    return () => { active = false; };
  }, []);

  async function unlock(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError("");
    try {
      const response = await fetch("/api/museum/artist-session", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ accessKey }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Artist access was not accepted.");
      setAccessKey("");
      setSession({ authenticated: true, configured: true });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Artist access was not accepted.");
    } finally {
      setSubmitting(false);
    }
  }

  if (session?.authenticated) return children;

  return (
    <main className={styles.screen}>
      <section className={styles.panel} aria-labelledby="artist-gate-title">
        <div className={styles.sigil} aria-hidden="true">✦</div>
        <p className={styles.eyebrow}>Private operating system</p>
        <h1 id="artist-gate-title">Wizard OS</h1>
        {!session && !error ? (
          <p className={styles.checking} role="status">Checking the Artist Gate…</p>
        ) : (
          <>
            <p className={styles.copy}>
              {session?.configured === false
                ? "Artist access is not configured for this environment."
                : "Enter your Artist access key to open the private workspace."}
            </p>
            {session?.configured !== false && (
              <form className={styles.form} onSubmit={unlock}>
                <label>
                  Artist access key
                  <input
                    type="password"
                    autoComplete="current-password"
                    required
                    value={accessKey}
                    onChange={(event) => setAccessKey(event.target.value)}
                  />
                </label>
                <button type="submit" disabled={submitting}>
                  {submitting ? "Opening…" : "Open Wizard OS"}
                </button>
              </form>
            )}
          </>
        )}
        {error && <p className={styles.error} role="alert">{error}</p>}
      </section>
    </main>
  );
}
