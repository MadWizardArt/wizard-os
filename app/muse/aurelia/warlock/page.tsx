"use client";

import { FormEvent, useEffect, useRef, useState } from "react";

type Result = { ok?: boolean; error?: string; id?: string; status?: string; gated?: boolean } | null;

export default function AureliaWarlockHandoffPage() {
  const [authenticated, setAuthenticated] = useState<boolean | null>(null);
  const [secret, setSecret] = useState("");
  const [authError, setAuthError] = useState("");
  const [payload, setPayload] = useState("");
  const [result, setResult] = useState<Result>(null);
  const [sending, setSending] = useState(false);
  const payloadRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    fetch("/api/muse/handoff-auth", { cache: "no-store" })
      .then((response) => response.json())
      .then((data) => setAuthenticated(Boolean(data.authenticated)))
      .catch(() => setAuthenticated(false));
  }, []);

  useEffect(() => {
    if (authenticated) payloadRef.current?.focus();
  }, [authenticated]);

  async function login(event: FormEvent) {
    event.preventDefault();
    setAuthError("");
    const response = await fetch("/api/muse/handoff-auth", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ secret }),
    });
    const data = await response.json();
    if (!response.ok) {
      setAuthError(data.error || "Unable to authenticate");
      return;
    }
    setSecret("");
    setAuthenticated(true);
  }

  async function sendHandoff(event: FormEvent) {
    event.preventDefault();
    setResult(null);
    setSending(true);
    try {
      const parsed = JSON.parse(payload);
      const response = await fetch("/api/muse/aurelia-warlock", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(parsed),
      });
      const data = await response.json();
      if (response.status === 401) setAuthenticated(false);
      if (!response.ok) throw new Error(data.error || "Handoff failed");
      setResult(data);
      setPayload("");
    } catch (error) {
      setResult({ error: error instanceof Error ? error.message : "Handoff failed" });
    } finally {
      setSending(false);
    }
  }

  const inputStyle = {
    width: "100%",
    border: "1px solid #34404d",
    borderRadius: 10,
    padding: 12,
    background: "#0d141c",
    color: "#e9edf1",
    boxSizing: "border-box" as const,
  };

  if (authenticated === null) {
    return <main style={{ maxWidth: 760, margin: "48px auto", padding: 24, color: "#e9edf1" }}>Checking Muse handoff session…</main>;
  }

  return (
    <main
      data-agent-purpose="aurelia-warlock-internal-handoff-only"
      data-etsy-action="none"
      style={{ maxWidth: 760, margin: "48px auto", padding: 24, color: "#e9edf1" }}
    >
      <p style={{ color: "#a99164", textTransform: "uppercase", letterSpacing: ".12em", fontSize: 12 }}>The Museum · Muse Handoff</p>
      <h1 style={{ marginBottom: 8 }}>Aurelia → Warlock</h1>
      <p style={{ color: "#8e99a7", lineHeight: 1.6 }}>
        Internal drop-box only. Paste one structured product payload, send it to Warlock, confirm receipt, and stop. No Etsy draft or publish action belongs in this workflow.
      </p>

      {!authenticated ? (
        <form onSubmit={login} style={{ marginTop: 28, padding: 20, border: "1px solid #26313d", borderRadius: 14, background: "#111923" }}>
          <label htmlFor="muse-handoff-secret" style={{ display: "block", fontWeight: 700, marginBottom: 8 }}>Muse handoff secret</label>
          <input id="muse-handoff-secret" type="password" autoComplete="current-password" value={secret} onChange={(e) => setSecret(e.target.value)} style={inputStyle} />
          <button id="unlock-handoff-bridge" type="submit" style={{ marginTop: 14, padding: "11px 16px", border: 0, borderRadius: 9, background: "#6f263d", color: "white", fontWeight: 800 }}>Unlock handoff bridge</button>
          {authError && <p style={{ color: "#e08aa2" }}>{authError}</p>}
          <p style={{ color: "#8e99a7", fontSize: 12, lineHeight: 1.5 }}>One successful login creates a 30-day HttpOnly browser session. The secret is not stored in the page or returned to the browser.</p>
        </form>
      ) : (
        <form
          onSubmit={sendHandoff}
          data-agent-workflow="paste-json-then-click-send-to-warlock-and-stop"
          style={{ marginTop: 28, padding: 20, border: "1px solid #26313d", borderRadius: 14, background: "#111923" }}
        >
          <div style={{ marginBottom: 14, padding: 12, border: "1px solid #5b4728", borderRadius: 10, background: "#1d1a13", color: "#d8c398", lineHeight: 1.5 }}>
            <strong>Agent fast lane:</strong> paste the complete JSON payload below → click <strong>Send to Warlock</strong> → wait for <strong>HANDOFF RECEIVED</strong> → stop. Do not navigate to Etsy or the main Warlock listing editor.
          </div>
          <label htmlFor="aurelia-handoff-payload" style={{ display: "block", fontWeight: 700, marginBottom: 8 }}>Structured Aurelia handoff JSON</label>
          <textarea
            id="aurelia-handoff-payload"
            ref={payloadRef}
            aria-label="Aurelia structured handoff JSON payload"
            data-agent-input="handoff-payload"
            value={payload}
            onChange={(e) => setPayload(e.target.value)}
            placeholder='{"internalName":"...","status":"assets_ready","collection":"...","title":"...","description":"...","price":11,"launchPrice":8,"tags":["..."],"categorySearch":"..."}'
            style={{ ...inputStyle, minHeight: 320, resize: "vertical", fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" }}
          />
          <button
            id="send-to-warlock"
            data-agent-action="send-internal-handoff"
            disabled={sending || !payload.trim()}
            type="submit"
            style={{ marginTop: 14, padding: "11px 16px", border: 0, borderRadius: 9, background: "#6f263d", color: "white", fontWeight: 800, opacity: sending || !payload.trim() ? .55 : 1 }}
          >
            {sending ? "Sending to Warlock…" : "Send to Warlock"}
          </button>
          {result?.error && <p role="alert" data-handoff-state="failed" style={{ color: "#e08aa2" }}>Handoff failed: {result.error}</p>}
          {result?.ok && (
            <div role="status" data-handoff-state="received" style={{ marginTop: 16, padding: 14, border: "1px solid #29533f", borderRadius: 10, background: "#15231d" }}>
              <strong>HANDOFF RECEIVED.</strong> Status: {result.status}. Gated: {String(result.gated)}. Stop here.
            </div>
          )}
          <p style={{ color: "#8e99a7", fontSize: 12, lineHeight: 1.5 }}>Warlock will surface this record in the rolling five-item Aurelia dropdown. This action never creates an Etsy listing.</p>
        </form>
      )}
    </main>
  );
}
