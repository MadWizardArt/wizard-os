"use client";

import { useCallback, useEffect, useState } from "react";
import type { MuseId } from "../../lib/museum";

export type MusePresenceState = "working" | "available" | "waiting" | "council" | "quiet";

export const PRESENCE_META: Record<MusePresenceState, { label: string; roomLine: string }> = {
  working: { label: "Working", roomLine: "Her attention is engaged." },
  available: { label: "Available", roomLine: "Her room is open." },
  waiting: { label: "Waiting on Brandon", roomLine: "She is awaiting your input." },
  council: { label: "In Council", roomLine: "Her attention is at the council table." },
  quiet: { label: "Quiet", roomLine: "The room has settled." },
};

const STORAGE_PREFIX = "wizard-os-museum-presence:";
const EVENT_NAME = "museum-presence-change";
const STATES = new Set<MusePresenceState>(["working", "available", "waiting", "council", "quiet"]);

function storageKey(museId: MuseId) {
  return `${STORAGE_PREFIX}${museId}`;
}

function readOverride(museId: MuseId): MusePresenceState | null {
  try {
    const value = window.localStorage.getItem(storageKey(museId));
    return value && STATES.has(value as MusePresenceState) ? value as MusePresenceState : null;
  } catch {
    return null;
  }
}

export function deriveDefaultPresence(hasFocus: boolean): MusePresenceState {
  return hasFocus ? "working" : "available";
}

export function useMusePresence(museId: MuseId, defaultState: MusePresenceState) {
  const [presence, setPresenceState] = useState<MusePresenceState>(defaultState);
  const [overridden, setOverridden] = useState(false);

  useEffect(() => {
    const override = readOverride(museId);
    setPresenceState(override ?? defaultState);
    setOverridden(Boolean(override));
  }, [museId, defaultState]);

  useEffect(() => {
    const onPresenceChange = (event: Event) => {
      const detail = (event as CustomEvent<{ museId?: MuseId; presence?: MusePresenceState | null }>).detail;
      if (!detail || detail.museId !== museId) return;
      const override = detail.presence ?? null;
      setPresenceState(override ?? defaultState);
      setOverridden(Boolean(override));
    };
    const onStorage = (event: StorageEvent) => {
      if (event.key !== storageKey(museId)) return;
      const override = readOverride(museId);
      setPresenceState(override ?? defaultState);
      setOverridden(Boolean(override));
    };
    window.addEventListener(EVENT_NAME, onPresenceChange as EventListener);
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener(EVENT_NAME, onPresenceChange as EventListener);
      window.removeEventListener("storage", onStorage);
    };
  }, [museId, defaultState]);

  const setPresence = useCallback((next: MusePresenceState | null) => {
    try {
      if (next) window.localStorage.setItem(storageKey(museId), next);
      else window.localStorage.removeItem(storageKey(museId));
    } catch {
      // Presence overrides are visual-only. If storage is unavailable, keep the local session useful.
    }
    setPresenceState(next ?? defaultState);
    setOverridden(Boolean(next));
    window.dispatchEvent(new CustomEvent(EVENT_NAME, { detail: { museId, presence: next } }));
  }, [museId, defaultState]);

  return { presence, overridden, setPresence };
}
