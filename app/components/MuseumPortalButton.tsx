"use client";

import { usePathname } from "next/navigation";

export default function MuseumPortalButton() {
  const pathname = usePathname();

  if (pathname.startsWith("/museum")) return null;

  return (
    <a
      href="/museum"
      aria-label="Enter The Museum"
      style={{
        position: "fixed",
        right: 18,
        bottom: 18,
        zIndex: 90,
        display: "inline-flex",
        alignItems: "center",
        gap: 9,
        minHeight: 42,
        padding: "0 15px",
        border: "1px solid rgba(204, 172, 103, .45)",
        borderRadius: 999,
        background: "linear-gradient(180deg, rgba(21, 27, 36, .96), rgba(9, 13, 19, .96))",
        color: "#e8d8aa",
        boxShadow: "0 12px 34px rgba(0,0,0,.36), inset 0 1px 0 rgba(255,255,255,.04)",
        fontFamily: "Georgia, serif",
        fontSize: 13,
        letterSpacing: ".06em",
        textDecoration: "none",
        backdropFilter: "blur(12px)",
      }}
    >
      <span aria-hidden="true" style={{ color: "#c7a866", fontSize: 15 }}>✦</span>
      The Museum
    </a>
  );
}
