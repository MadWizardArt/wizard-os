"use client";

import { PointerEvent, useEffect, useRef, useState } from "react";

type SoldPaintingsCounterClientProps = {
  profitLabel: string;
  listedValueLabel: string;
  paintingCount: number;
  fullyDocumented: boolean;
};

const STORAGE_KEY = "wizard-os:sold-counter-top";
const EDGE_GAP = 16;

export default function SoldPaintingsCounterClient({
  profitLabel,
  listedValueLabel,
  paintingCount,
  fullyDocumented,
}: SoldPaintingsCounterClientProps) {
  const counterRef = useRef<HTMLElement | null>(null);
  const dragOffsetRef = useRef(0);
  const topRef = useRef<number | null>(null);
  const [top, setTop] = useState<number | null>(null);
  const [dragging, setDragging] = useState(false);

  function clampTop(nextTop: number) {
    const height = counterRef.current?.getBoundingClientRect().height ?? 0;
    const maxTop = Math.max(EDGE_GAP, window.innerHeight - height - EDGE_GAP);
    return Math.min(Math.max(nextTop, EDGE_GAP), maxTop);
  }

  function applyTop(nextTop: number) {
    const clamped = clampTop(nextTop);
    topRef.current = clamped;
    setTop(clamped);
    return clamped;
  }

  useEffect(() => {
    const element = counterRef.current;
    if (!element) return;

    const stored = window.localStorage.getItem(STORAGE_KEY);
    const rect = element.getBoundingClientRect();
    const initial = stored == null ? rect.top : Number(stored);
    applyTop(Number.isFinite(initial) ? initial : rect.top);

    const onResize = () => {
      if (topRef.current == null) return;
      const clamped = applyTop(topRef.current);
      window.localStorage.setItem(STORAGE_KEY, String(clamped));
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  function startDrag(event: PointerEvent<HTMLButtonElement>) {
    const element = counterRef.current;
    if (!element) return;
    dragOffsetRef.current = event.clientY - element.getBoundingClientRect().top;
    setDragging(true);
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function moveDrag(event: PointerEvent<HTMLButtonElement>) {
    if (!dragging) return;
    applyTop(event.clientY - dragOffsetRef.current);
  }

  function endDrag(event: PointerEvent<HTMLButtonElement>) {
    if (!dragging) return;
    setDragging(false);
    try {
      event.currentTarget.releasePointerCapture(event.pointerId);
    } catch {
      // Pointer capture may already have been released by the browser.
    }
    if (topRef.current != null) {
      window.localStorage.setItem(STORAGE_KEY, String(topRef.current));
    }
  }

  const headlineValue = fullyDocumented ? profitLabel : listedValueLabel;

  return (
    <>
      <aside
        ref={counterRef}
        className={`soldPaintingsCounter${dragging ? " isDragging" : ""}`}
        aria-label="MadWizardArt sold painting archive value counter"
        style={top == null ? undefined : { top, bottom: "auto" }}
      >
        <button
          type="button"
          className="soldCounterRailHandle"
          aria-label="Move sold paintings counter up or down"
          title="Drag up or down"
          onPointerDown={startDrag}
          onPointerMove={moveDrag}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
        >
          <span aria-hidden="true">↕</span>
        </button>
        <div className="soldCounterContent">
          <p className="eyebrow soldCounterEyebrow">
            MadWizardArt.com · Sold paintings only
          </p>
          <h3 className="soldCounterAmount">{headlineValue}</h3>
          <p className="soldCounterSummary">
            <strong>{fullyDocumented ? "Profit" : "Historical listed value"}</strong> ·{" "}
            {paintingCount} archived painting{paintingCount === 1 ? "" : "s"}
          </p>
          <small className="soldCounterDetails">
            {fullyDocumented
              ? `Listed sold value ${listedValueLabel}. Profit uses recorded sale terms and known costs.`
              : "Historical sale terms and costs are incomplete, so profit is intentionally not estimated. Enter confirmed sale prices, fees, shipping, materials, and framing costs to calculate profit."}
          </small>
        </div>
      </aside>
      <style>{`
        .soldPaintingsCounter {
          position: fixed;
          right: 1rem;
          bottom: 1rem;
          z-index: 30;
          width: min(22rem, calc(100vw - 2rem));
          display: grid;
          grid-template-columns: 28px minmax(0, 1fr);
          overflow: hidden;
          border: 1px solid rgba(255,255,255,.18);
          border-radius: 14px;
          background: rgba(20,18,25,.94);
          box-shadow: 0 12px 32px rgba(0,0,0,.35);
          backdrop-filter: blur(14px);
          transition: box-shadow .14s ease, border-color .14s ease;
        }
        .soldPaintingsCounter.isDragging {
          border-color: rgba(255,255,255,.3);
          box-shadow: 0 16px 40px rgba(0,0,0,.46);
          user-select: none;
        }
        .soldCounterRailHandle {
          width: 28px;
          min-height: 100%;
          display: grid;
          place-items: center;
          border: 0;
          border-right: 1px solid rgba(255,255,255,.1);
          background: rgba(255,255,255,.035);
          color: rgba(255,255,255,.46);
          cursor: ns-resize;
          touch-action: none;
          padding: 0;
        }
        .soldCounterRailHandle:hover,
        .soldCounterRailHandle:focus-visible {
          color: rgba(255,255,255,.82);
          background: rgba(255,255,255,.07);
          outline: none;
        }
        .soldCounterRailHandle span { font-size: 15px; line-height: 1; }
        .soldCounterContent { padding: 1rem 1.1rem; min-width: 0; }
        .soldCounterEyebrow { margin: 0; }
        .soldCounterAmount { margin: .35rem 0 .15rem; font-size: 1.7rem; }
        .soldCounterSummary { margin: 0; }
        .soldCounterDetails { display: block; margin-top: .45rem; opacity: .78; }
        @media (max-width: 620px) {
          .soldPaintingsCounter {
            right: .85rem;
            bottom: 5.35rem;
            width: calc(100vw - 1.7rem);
            grid-template-columns: 24px minmax(0, 1fr);
            border-radius: 13px;
          }
          .soldCounterRailHandle { width: 24px; }
          .soldCounterContent { padding: .8rem .9rem; }
          .soldCounterAmount { font-size: 1.42rem; margin-top: .25rem; }
          .soldCounterSummary { font-size: .92rem; }
          .soldCounterDetails {
            max-height: 2.8em;
            overflow: hidden;
            font-size: .72rem;
            line-height: 1.35;
          }
        }
      `}</style>
    </>
  );
}
