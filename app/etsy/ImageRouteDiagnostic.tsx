"use client";

import { useState } from "react";

type TestResult = {
  ok?: boolean;
  stage?: string;
  listingId?: number;
  state?: string;
  category?: string;
  imageCount?: number;
  imageId?: number | null;
  published?: boolean;
  reusedDraft?: boolean;
  generatedImageBytes?: number;
  error?: string;
  details?: unknown;
};

export default function ImageRouteDiagnostic() {
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<TestResult | null>(null);

  async function runTest() {
    if (running) return;
    setRunning(true);
    setResult(null);
    try {
      const response = await fetch("/api/etsy/test-image-route", { method: "POST" });
      const data = (await response.json()) as TestResult;
      setResult(data);
    } catch {
      setResult({ stage: "request", error: "warlock_image_route_test_request_failed" });
    } finally {
      setRunning(false);
    }
  }

  const details = result?.details == null
    ? ""
    : typeof result.details === "string"
      ? result.details
      : JSON.stringify(result.details, null, 2);

  return (
    <section style={{ padding: 18, border: "1px solid #4f2d39", borderRadius: 14, background: "#161117", marginBottom: 22 }}>
      <div style={{ display: "flex", gap: 14, alignItems: "center", justifyContent: "space-between", flexWrap: "wrap" }}>
        <div>
          <p style={{ margin: 0, color: "#cf7893", fontSize: 11, textTransform: "uppercase", letterSpacing: ".12em" }}>Temporary diagnostic</p>
          <strong style={{ display: "block", marginTop: 6 }}>Etsy image-route test</strong>
          <p style={{ margin: "6px 0 0", color: "#8e99a7", fontSize: 12, lineHeight: 1.5 }}>
            Reuses the existing test draft when possible, uploads one generated PNG, verifies the image count, and never publishes.
          </p>
        </div>
        <button
          type="button"
          onClick={runTest}
          disabled={running}
          style={{ padding: "10px 14px", borderRadius: 9, border: "1px solid #9c4864", background: "#6f263d", color: "white", fontWeight: 800, cursor: running ? "wait" : "pointer", opacity: running ? .6 : 1 }}
        >
          {running ? "Testing…" : "Run Image Route Test"}
        </button>
      </div>

      {result?.ok && (
        <div style={{ marginTop: 14, padding: 13, border: "1px solid #29533f", borderRadius: 10, background: "#15231d", color: "#b8d7c4", fontSize: 13, lineHeight: 1.55 }}>
          <strong>PASS.</strong> Draft {result.listingId} remains {result.state ?? "draft"}; Etsy reports {result.imageCount ?? 0} image{result.imageCount === 1 ? "" : "s"}. No publish action was sent.
          {result.reusedDraft && <div style={{ marginTop: 5, color: "#8fb59c" }}>Existing diagnostic draft was reused.</div>}
        </div>
      )}

      {result && !result.ok && (
        <div style={{ marginTop: 14, padding: 13, border: "1px solid #6f263d", borderRadius: 10, background: "#25151b", color: "#e3a0b4", fontSize: 13, lineHeight: 1.55 }}>
          <strong>TEST STOPPED.</strong>
          <div style={{ marginTop: 5 }}>Stage: <strong>{result.stage ?? "unknown"}</strong></div>
          <div>Error: <strong>{result.error ?? "Unknown error"}</strong></div>
          {result.listingId && <div>Draft: <strong>{result.listingId}</strong> · left unpublished{result.reusedDraft ? " · reused existing test draft" : ""}</div>}
          {result.generatedImageBytes != null && <div>Generated PNG: {result.generatedImageBytes.toLocaleString()} bytes</div>}
          {details && (
            <pre style={{ margin: "10px 0 0", padding: 10, borderRadius: 8, background: "#120c10", color: "#efbac9", whiteSpace: "pre-wrap", overflowWrap: "anywhere", fontSize: 11, lineHeight: 1.45 }}>{details}</pre>
          )}
        </div>
      )}
    </section>
  );
}
