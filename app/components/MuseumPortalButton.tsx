"use client";

import { usePathname } from "next/navigation";

export default function MuseumPortalButton() {
  const pathname = usePathname();

  if (pathname?.startsWith("/museum")) return null;

  return (
    <>
      <a
        href="/museum"
        aria-label="Enter The Museum"
        title="The Museum"
        className="museumPortalButton"
      >
        <span aria-hidden="true">✦</span>
      </a>
      <style jsx>{`
        .museumPortalButton {
          position: fixed;
          right: 16px;
          bottom: 16px;
          z-index: 90;
          width: 38px;
          height: 38px;
          display: grid;
          place-items: center;
          border: 1px solid rgba(204, 172, 103, .24);
          border-radius: 50%;
          background: rgba(12, 18, 25, .78);
          color: rgba(232, 216, 170, .68);
          box-shadow: 0 8px 22px rgba(0, 0, 0, .28), inset 0 1px 0 rgba(255,255,255,.03);
          text-decoration: none;
          backdrop-filter: blur(10px);
          opacity: .72;
          transition: opacity .16s ease, border-color .16s ease, color .16s ease, transform .16s ease;
        }
        .museumPortalButton span {
          color: inherit;
          font-size: 15px;
          line-height: 1;
        }
        .museumPortalButton:hover,
        .museumPortalButton:focus-visible {
          opacity: 1;
          color: #e8d8aa;
          border-color: rgba(204, 172, 103, .5);
          transform: translateY(-1px);
          outline: none;
        }
        @media (max-width: 620px) {
          .museumPortalButton {
            right: .8rem;
            bottom: .8rem;
            width: 34px;
            height: 34px;
            opacity: .58;
          }
          .museumPortalButton span { font-size: 13px; }
        }
      `}</style>
    </>
  );
}
