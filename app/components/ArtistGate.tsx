"use client";

import { FormEvent, useEffect, useState } from "react";
import styles from "./ArtistGate.module.css";

type SessionState = {
  authenticated: boolean;
  configured: boolean;
  passwordConfigured: boolean;
};

async function readSession() {
  const response = await fetch("/api/museum/artist-session", { cache: "no-store" });
  if (!response.ok) throw new Error("Artist Gate status is unavailable.");
  return response.json() as Promise<SessionState>;
}

export default function ArtistGate({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<SessionState | null>(null);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [accessKey, setAccessKey] = useState("");
  const [remember, setRemember] = useState(false);
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
      const setup = session?.passwordConfigured === false;
      if (setup && password !== confirmPassword) throw new Error("The passwords do not match.");
      const response = await fetch("/api/museum/artist-session", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(setup
          ? { setupPassword: true, accessKey, password, remember }
          : { password, remember }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Artist access was not accepted.");
      setAccessKey("");
      setPassword("");
      setConfirmPassword("");
      setSession({ authenticated: true, configured: true, passwordConfigured: true });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Artist access was not accepted.");
    } finally {
      setSubmitting(false);
    }
  }

  if (session?.authenticated && session.passwordConfigured) return children;

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
                : session?.passwordConfigured === false
                  ? "Create your private Artist password. Your current access key is required once for setup."
                  : "Enter your Artist password to open the private workspace."}
            </p>
            {session?.configured !== false && (
              <form className={styles.form} onSubmit={unlock}>
                {session?.passwordConfigured === false && <label>
                  Current Artist access key
                  <input
                    type="password"
                    autoComplete="off"
                    required
                    value={accessKey}
                    onChange={(event) => setAccessKey(event.target.value)}
                  />
                </label>}
                <label>
                  {session?.passwordConfigured === false ? "Choose password" : "Artist password"}
                  <input
                    type="password"
                    autoComplete={session?.passwordConfigured === false ? "new-password" : "current-password"}
                    minLength={12}
                    maxLength={128}
                    required
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                  />
                </label>
                {session?.passwordConfigured === false && <label>
                  Confirm password
                  <input
                    type="password"
                    autoComplete="new-password"
                    minLength={12}
                    maxLength={128}
                    required
                    value={confirmPassword}
                    onChange={(event) => setConfirmPassword(event.target.value)}
                  />
                </label>}
                <label className={styles.remember}>
                  <input
                    type="checkbox"
                    checked={remember}
                    onChange={(event) => setRemember(event.target.checked)}
                  />
                  Remember this device for 30 days
                </label>
                <button type="submit" disabled={submitting}>
                  {submitting ? "Opening…" : session?.passwordConfigured === false ? "Set Password & Open" : "Open Wizard OS"}
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
