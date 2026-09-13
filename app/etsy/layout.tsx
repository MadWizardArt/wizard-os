import type { ReactNode } from "react";

export default function EtsyLayout({ children }: { children: ReactNode }) {
  return (
    <div className="warlock-etsy-surface">
      <style>{`
        /* Keep the Aurelia handoff architecture available for future use,
           but remove the recent-handoff dropdown from the active Warlock UI. */
        .warlock-etsy-surface section + form > div:nth-child(2) {
          display: none;
        }
      `}</style>
      {children}
    </div>
  );
}
