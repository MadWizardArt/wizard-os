"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";

const destinations = [
  ["The Crucible", "/"], ["Campaigns", "/campaigns"],
  ["Calendar", "/calendar"], ["Inventory & Sold", "/inventory"],
  ["Projects", "/#projects"], ["Queue", "/#queue"],
  ["Money", "/?view=money"], ["Ventures", "/?view=ventures"],
  ["Clients", "/?view=customers"], ["Warlock", "/etsy"],
  ["The Museum", "/museum"],
  ["Manage Briefs", "/museum/briefs/manage"],
];

export default function MobileNavigation() {
  const pathname = usePathname();
  const dialog = useRef<HTMLDialogElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [location, setLocation] = useState(pathname);
  useEffect(() => { setLocation(window.location.pathname + window.location.search + window.location.hash); }, [pathname]);
  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const media = window.matchMedia("(min-width: 901px)");
    const resize = () => { if (media.matches) dialog.current?.close(); };
    media.addEventListener("change", resize);
    return () => { document.body.style.overflow = previous; media.removeEventListener("change", resize); };
  }, [open]);
  const current = destinations.find(([, href]) => href === location)?.[0] ?? destinations.find(([, href]) => href !== "/" && pathname === href)?.[0] ?? "Wizard OS";
  return <div className="mobileNavigation">
    <div className="mobileNavigationBar"><a href="/" aria-label="Wizard OS home">✦ Wizard OS</a><button ref={trigger} aria-haspopup="dialog" aria-expanded={open} aria-controls="mobile-navigation-menu" onClick={() => { dialog.current?.showModal(); setOpen(true); }}>☰ Menu</button></div>
    <dialog id="mobile-navigation-menu" ref={dialog} aria-labelledby="mobile-navigation-title" onClose={() => { setOpen(false); trigger.current?.focus(); }} onClick={event => { if (event.target === dialog.current) dialog.current.close(); }}>
      <div className="mobileNavigationSheet"><header><div><h2 id="mobile-navigation-title">Explore Wizard OS</h2><p>{current}</p></div><button autoFocus onClick={() => dialog.current?.close()} aria-label="Close navigation">✕</button></header>
      <nav aria-label="Mobile navigation">{destinations.map(([label, href]) => <a key={href} href={href} aria-current={location === href ? "page" : undefined} onClick={() => { setLocation(href); dialog.current?.close(); }}>{label}<span aria-hidden="true">›</span></a>)}</nav>
      </div>
    </dialog>
  </div>;
}
