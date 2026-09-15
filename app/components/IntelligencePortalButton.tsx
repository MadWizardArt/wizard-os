"use client";

import { usePathname } from "next/navigation";

export default function IntelligencePortalButton() {
  const pathname = usePathname();

  if (pathname.startsWith("/museum/intelligence")) return null;

  return (
    <>
      <a
        href="/museum/intelligence"
        aria-label="Open Selective Intelligence"
        title="Selective Intelligence"
        className="intelligencePortalButton"
      >
        <span aria-hidden="true">◈</span>
      </a>
      <style jsx>{`
        .intelligencePortalButton {
          position: fixed;
          right: 17px;
          bottom: 62px;
          z-index: 90;
          width: 30px;
          height: 30px;
          display: grid;
          place-items: center;
          border: 1px solid rgba(158, 136, 190, .22);
          border-radius: 50%;
          background: rgba(12, 18, 25, .72);
          color: rgba(199, 184, 220, .62);
          box-shadow: 0 6px 18px rgba(0, 0, 0, .24), inset 0 1px 0 rgba(255,255,255,.025);
          text-decoration: none;
          backdrop-filter: blur(10px);
          opacity: .66;
          transition: opacity .16s ease, border-color .16s ease, color .16s ease, transform .16s ease;
        }
        .intelligencePortalButton span {
          color: inherit;
          font-size: 13px;
          line-height: 1;
        }
        .intelligencePortalButton:hover,
        .intelligencePortalButton:focus-visible {
          opacity: 1;
          color: #d9cbe9;
          border-color: rgba(175, 149, 210, .5);
          transform: translateY(-1px);
          outline: none;
        }
        @media (max-width: 620px) {
          .intelligencePortalButton {
            right: .92rem;
            bottom: 3.35rem;
            width: 28px;
            height: 28px;
            opacity: .56;
          }
          .intelligencePortalButton span { font-size: 12px; }
        }
      `}</style>
    </>
  );
}
