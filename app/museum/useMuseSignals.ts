"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { MuseId } from "../../lib/museum";
import type {
  MuseSignalPresence,
  MuseSignalPriority,
  MuseSignalType,
} from "../../lib/museum-signal-storage";

export type MuseSignal = {
  id: string;
  version: 1;
  museId: MuseId;
  title: string;
  summary: string;
  type: MuseSignalType;
  area: string;
  priority: MuseSignalPriority;
  visualState: MuseSignalPresence;
  relatedProjectId: string | null;
  sourceKey: string;
  occurredAt: string;
  readAt: string | null;
  acknowledgedAt: string | null;
};

export const SIGNAL_META: Record<MuseSignalType, { label: string; symbol: string }> = {
  update: { label: "Update", symbol: "✦" },
  recommendation: { label: "Recommendation", symbol: "◇" },
  waiting: { label: "Waiting on Brandon", symbol: "⌛" },
  completed: { label: "Completed", symbol: "✓" },
  warning: { label: "Warning", symbol: "△" },
  urgent: { label: "Urgent", symbol: "!" },
};

const SIGNAL_EVENT = "museum-signal-change";

export function useMuseSignals(museId?: MuseId) {
  const [signals, setSignals] = useState<MuseSignal[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const query = museId ? `?muse=${encodeURIComponent(museId)}` : "";
      const response = await fetch(`/api/museum/signals${query}`, { cache: "no-store" });
      if (!response.ok) return;
      const payload = await response.json();
      setSignals(Array.isArray(payload) ? payload : []);
    } finally {
      setLoading(false);
    }
  }, [museId]);

  useEffect(() => {
    void refresh();
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") void refresh();
    }, 15000);
    const onFocus = () => void refresh();
    const onSignal = () => void refresh();
    window.addEventListener("focus", onFocus);
    window.addEventListener(SIGNAL_EVENT, onSignal);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", onFocus);
      window.removeEventListener(SIGNAL_EVENT, onSignal);
    };
  }, [refresh]);

  const updateSignal = useCallback(async (id: string, action: "read" | "acknowledge") => {
    const response = await fetch("/api/museum/signals", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, action }),
    });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || "Museum signal could not be updated.");
    setSignals((current) => current.map((signal) => signal.id === id ? payload : signal));
    window.dispatchEvent(new CustomEvent(SIGNAL_EVENT, { detail: { id, action } }));
    return payload as MuseSignal;
  }, []);

  const active = useMemo(() => signals.filter((signal) => !signal.acknowledgedAt), [signals]);
  const latestActive = active[0] ?? null;
  const latestUnread = active.find((signal) => !signal.readAt) ?? null;
  const unreadCount = active.filter((signal) => !signal.readAt).length;

  return {
    signals,
    active,
    latestActive,
    latestUnread,
    unreadCount,
    loading,
    refresh,
    markRead: (id: string) => updateSignal(id, "read"),
    acknowledge: (id: string) => updateSignal(id, "acknowledge"),
  };
}
