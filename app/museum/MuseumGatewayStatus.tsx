"use client";

import { useEffect, useState } from "react";

type SessionStatus = {
  configured?: boolean;
  fuelEnabled?: boolean;
  model?: string;
};

type GatewayState = "checking" | "armed" | "off" | "locked" | "unavailable";

const META: Record<GatewayState, { label: string; color: string; border: string; background: string }> = {
  checking: { label: "AI Gateway · Checking", color: "#929ba4", border: "rgba(146,155,164,.20)", background: "rgba(146,155,164,.05)" },
  armed: { label: "AI Gateway · Armed", color: "#9bc5aa", border: "rgba(117,173,137,.30)", background: "rgba(64,103,77,.10)" },
  off: { label: "AI Gateway · Off", color: "#b8a77d", border: "rgba(184,167,125,.24)", background: "rgba(123,101,56,.08)" },
  locked: { label: "AI Gateway · Locked", color: "#b88f91", border: "rgba(184,143,145,.24)", background: "rgba(112,57,61,.08)" },
  unavailable: { label: "AI Gateway · Unavailable", color: "#8f969e", border: "rgba(143,150,158,.20)", background: "rgba(143,150,158,.05)" },
};

export default function MuseumGatewayStatus() {
  const [state, setState] = useState<GatewayState>("checking");
  const [model, setModel] = useState("");

  useEffect(() => {
    let active = true;

    const refresh = async () => {
      try {
        const response = await fetch("/api/museum/artist-session", { cache: "no-store" });
        if (!response.ok) throw new Error("Gateway status unavailable");
        const status = await response.json() as SessionStatus;
        if (!active) return;
        setModel(status.model ?? "");
        if (!status.configured) setState("locked");
        else if (status.fuelEnabled) setState("armed");
        else setState("off");
      } catch {
        if (active) setState("unavailable");
      }
    };

    void refresh();
    const onVisibility = () => { if (document.visibilityState === "visible") void refresh(); };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      active = false;
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  const meta = META[state];
  const dot = state === "armed" ? "#75ad89" : state === "locked" ? "#b06d72" : state === "off" ? "#ad9560" : "#69727b";

  return (
    <div
      title={model ? `Selected model: ${model}` : meta.label}
      aria-live="polite"
      style={{
        justifySelf: "end",
        display: "inline-flex",
        alignItems: "center",
        gap: 8,
        padding: "7px 10px",
        border: `1px solid ${meta.border}`,
        borderRadius: 999,
        color: meta.color,
        background: meta.background,
        font: "700 9px/1 system-ui, sans-serif",
        letterSpacing: ".07em",
        textTransform: "uppercase",
        whiteSpace: "nowrap",
      }}
    >
      <span
        aria-hidden="true"
        style={{
          width: 7,
          height: 7,
          borderRadius: "50%",
          background: dot,
          boxShadow: state === "armed" ? "0 0 12px rgba(117,173,137,.40)" : "none",
        }}
      />
      {meta.label}
    </div>
  );
}
