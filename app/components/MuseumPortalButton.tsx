"use client";

import { usePathname } from "next/navigation";

export default function MuseumPortalButton() {
  const pathname = usePathname();

  if (pathname.startsWith("/museum")) return null;

  return (
    <a
      href="/museum"
      aria-label="Enter The Museum"
      className="museumPortalButton"
    >
      <span aria-hidden="true">✦</span>
      The Museum
    </a>
  );
}
