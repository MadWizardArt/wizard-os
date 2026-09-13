"use client";

import { usePathname } from "next/navigation";

export default function MuseumNavDock() {
  const pathname = usePathname();
  const onQuests = pathname.startsWith("/museum/quests");

  return (
    <nav
      aria-label="The Museum navigation"
      style={{
        position: "fixed",
        left: 18,
        bottom: 18,
        zIndex: 95,
        display: "flex",
        gap: 8,
        padding: 6,
        border: "1px solid rgba(204,172,103,.22)",
        borderRadius: 999,
        background: "rgba(8,12,17,.9)",
        boxShadow: "0 12px 34px rgba(0,0,0,.34)",
        backdropFilter: "blur(12px)",
      }}
    >
      <a
        href="/museum"
        style={{
          padding: "8px 11px",
          borderRadius: 999,
          color: !onQuests ? "#ead8a8" : "#7f8993",
          background: !onQuests ? "rgba(125,98,49,.22)" : "transparent",
          textDecoration: "none",
          font: "700 9px/1 system-ui, sans-serif",
          letterSpacing: ".08em",
          textTransform: "uppercase",
        }}
      >
        Character Select
      </a>
      <a
        href="/museum/quests"
        style={{
          padding: "8px 11px",
          borderRadius: 999,
          color: onQuests ? "#ead8a8" : "#7f8993",
          background: onQuests ? "rgba(125,98,49,.22)" : "transparent",
          textDecoration: "none",
          font: "700 9px/1 system-ui, sans-serif",
          letterSpacing: ".08em",
          textTransform: "uppercase",
        }}
      >
        Quest Board
      </a>
    </nav>
  );
}
