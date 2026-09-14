"use client";

import { usePathname } from "next/navigation";

export default function MuseumPortalButton() {
  const pathname = usePathname();

  if (pathname.startsWith("/museum")) return null;

  return (
    <>
      <a
        href="/museum"
        aria-label="Enter The Museum"
        className="museumPortalButton"
      >
        <span aria-hidden="true">✦</span>
        The Museum
      </a>
      <style jsx>{`
        .museumPortalButton {
          position: fixed;
          right: 18px;
          bottom: 18px;
          z-index: 90;
          display: inline-flex;
          align-items: center;
          gap: 9px;
          min-height: 42px;
          padding: 0 15px;
          border: 1px solid rgba(204,172,103,.45);
          border-radius: 999px;
          background: linear-gradient(180deg, rgba(21,27,36,.96), rgba(9,13,19,.96));
          color: #e8d8aa;
          box-shadow: 0 12px 34px rgba(0,0,0,.36), inset 0 1px 0 rgba(255,255,255,.04);
          font-family: Georgia, serif;
          font-size: 13px;
          letter-spacing: .06em;
          text-decoration: none;
          backdrop-filter: blur(12px);
        }
        .museumPortalButton span { color: #c7a866; font-size: 15px; }
        @media (max-width: 620px) {
          .museumPortalButton {
            right: .85rem;
            bottom: .85rem;
            min-height: 44px;
            padding-inline: 16px;
          }
        }
      `}</style>
    </>
  );
}
