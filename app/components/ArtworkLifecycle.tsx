"use client";
import { useEffect, useState } from "react";
import { artworkPhase } from "../../lib/artwork-lifecycle";
import { easternDate } from "../../lib/campaign-rules";
import type {
  SalesData,
  Painting,
  ArtworkSale,
} from "../../lib/campaign-types";
import type { Editor, Field } from "./Campaigns";
const money = (v: number | null | undefined) =>
  v == null
    ? "Unknown"
    : new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: "USD",
      }).format(v / 100);
const f = (
  name: string,
  label: string,
  type = "text",
  required = false,
): Field => ({ name, label, type, required });
const choices = (name: string, label: string, values: string[]): Field => ({
  name,
  label,
  options: values.map((value) => ({ value, label: value })),
});
const dollars = (v: number | null | undefined) => (v == null ? "" : v / 100);
const phases = ["Works in Progress", "Available Inventory", "Sold Archive"];
export default function ArtworkLifecycle({
  data,
  open,
  mutate,
  editPainting,
  busy,
}: {
  data: SalesData;
  open: (e: Editor) => void;
  mutate: (p: Record<string, unknown>, close?: boolean) => Promise<boolean>;
  editPainting: (p: Painting) => void;
  busy: boolean;
}) {
  const [phase, setPhase] = useState("Available Inventory"),
    [query, setQuery] = useState("");
  const paintings: Painting[] = [
    ...data.paintings,
    ...data.projects
      .filter((p) => !data.paintings.some((a) => a.projectId === p.id))
      .map((p) => ({
        projectId: p.id,
        project: p,
        thumbnail: "",
        dimensions: "",
        medium: "",
        framing: "",
        regularPriceCents: p.valueCents,
        availability: "Not ready",
        batchId: null,
      })),
  ];
  useEffect(() => {
    const id = new URLSearchParams(location.search).get("project");
    if (id) {
      const p = paintings.find((p) => p.projectId === id);
      if (p) {
        setPhase(artworkPhase(p.availability));
        setQuery(p.project.title);
      }
    }
  }, []);
  function correction(p: Painting) {
    open({
      title: "Correct artwork status / record return",
      action: "status",
      values: {
        projectId: p.projectId,
        availability: p.availability,
        reason: "",
        saleDisposition: "Returned",
      },
      fields: [
        choices("availability", "Artwork status", [
          "Not ready",
          "Available",
          "Reserved",
          "Sold",
        ]),
        f("reason", "Reason (saved in history)", "textarea", true),
        ...(p.availability === "Sold"
          ? [
              choices(
                "saleDisposition",
                "If leaving Sold, keep the prior sale as",
                ["Returned", "Voided"],
              ),
            ]
          : []),
      ],
    });
  }
  function costs(p: Painting) {
    open({
      title: "Production costs",
      action: "costs",
      values: {
        projectId: p.projectId,
        materialsCostCents: dollars(p.materialsCostCents),
        framingCostCents: dollars(p.framingCostCents),
      },
      fields: [
        f(
          "materialsCostCents",
          "Materials cost ($) · blank = unknown",
          "number",
        ),
        f("framingCostCents", "Framing cost ($) · blank = unknown", "number"),
      ],
    });
  }
  function saleForm(p: Painting, s?: ArtworkSale) {
    const values = s
      ? { ...s, projectId: p.projectId }
      : {
          projectId: p.projectId,
          saleDate: easternDate(),
          salePriceCents: null,
          discountCents: 0,
          salesTaxCents: 0,
          shippingIncomeCents: 0,
          sellingFeesCents: null,
          shippingExpenseCents: null,
          materialsCostCents: p.materialsCostCents,
          framingCostCents: p.framingCostCents,
          fulfillment: "Awaiting shipment",
          notes: "",
          requestKey: crypto.randomUUID(),
          receivedCents: 0,
          receivedTaxCents: 0,
          receivedShippingCents: 0,
          receivedDate: easternDate(),
          source: "Artwork sale",
          existingTransactionId: "",
          campaignId: "",
        };
    const v: Record<string, unknown> = { ...values };
    for (const key of Object.keys(v))
      if (key.endsWith("Cents"))
        v[key] = dollars(v[key] as number | null | undefined);
    open({
      title: s ? "Edit sale terms and fulfillment" : "Record Sale",
      action: s ? "editSale" : "sale",
      values: v,
      fields: [
        f("saleDate", "Sale date", "date", true),
        f(
          "salePriceCents",
          "Actual artwork selling price AFTER discounts ($)",
          "number",
          true,
        ),
        f(
          "discountCents",
          "Discount given ($) · already included above",
          "number",
          true,
        ),
        f("salesTaxCents", "Sales tax charged ($)", "number", true),
        f(
          "shippingIncomeCents",
          "Shipping charged to buyer ($)",
          "number",
          true,
        ),
        f("sellingFeesCents", "Selling fees ($) · blank = unknown", "number"),
        f(
          "shippingExpenseCents",
          "Shipping expense ($) · blank = unknown",
          "number",
        ),
        ...(!s
          ? [
              f(
                "materialsCostCents",
                "Materials cost ($) · blank = unknown",
                "number",
              ),
              f(
                "framingCostCents",
                "Framing cost ($) · blank = unknown",
                "number",
              ),
            ]
          : []),
        choices("fulfillment", "Fulfillment (independent of payment)", [
          "Awaiting shipment",
          "Packing",
          "Shipped",
          "Delivered",
          "Local pickup",
          "Fulfilled",
        ]),
        ...(!s
          ? [
              {
                name: "campaignId",
                label: "Campaign (optional)",
                options: [
                  { value: "", label: "No campaign" },
                  ...data.campaigns
                    .filter((c) =>
                      c.artwork.some((a) => a.projectId === p.projectId),
                    )
                    .map((c) => ({ value: c.id, label: c.title })),
                ],
              },
              {
                name: "existingTransactionId",
                label: "Reuse a payment already in Money (no new receipt)",
                options: [
                  { value: "", label: "No existing payment" },
                  ...data.transactions
                    .filter(
                      (t) =>
                        t.type === "INCOME" &&
                        t.receivedAt &&
                        !t.isNonArt &&
                        !t.artworkSaleId &&
                        (!t.projectId || t.projectId === p.projectId),
                    )
                    .map((t) => ({
                      value: t.id,
                      label: `${t.source} · ${money(t.amountCents)}`,
                    })),
                ],
              },
              f(
                "receivedCents",
                "New payment received ($) · 0 = unpaid; ignored when reusing",
                "number",
                true,
              ),
              f("receivedDate", "Date this payment was received", "date", true),
              f(
                "receivedTaxCents",
                "Tax portion of this payment ($)",
                "number",
                true,
              ),
              f(
                "receivedShippingCents",
                "Shipping portion of this payment ($)",
                "number",
                true,
              ),
              f("source", "Payment source"),
            ]
          : []),
        f("notes", "Sale notes", "textarea"),
      ],
    });
  }
  function payment(p: Painting, s: ArtworkSale) {
    open({
      title: "Record received payment / refund",
      action: "receipt",
      values: {
        projectId: p.projectId,
        artworkSaleId: s.id,
        campaignId: s.transactions.find((t) => t.campaignId)?.campaignId ?? "",
        type: "INCOME",
        amountCents: "",
        salesTaxCents: 0,
        shippingCents: 0,
        receivedDate: easternDate(),
        source: "Artwork payment",
        receiptKey: crypto.randomUUID(),
        markSold: false,
      },
      fields: [
        choices("type", "Entry type", ["INCOME", "REFUND"]),
        f(
          "amountCents",
          "Total actually received or refunded ($)",
          "number",
          true,
        ),
        f("salesTaxCents", "Tax portion ($)", "number", true),
        f("shippingCents", "Shipping portion ($)", "number", true),
        f("receivedDate", "Payment / refund date", "date", true),
        f("source", "Payment reference", "text", true),
      ],
    });
  }
  function link(p: Painting) {
    open({
      title: "Link painting to campaign",
      action: "linkPainting",
      values: { projectId: p.projectId, campaignId: "", salePriceCents: "" },
      fields: [
        {
          name: "campaignId",
          label: "Campaign",
          required: true,
          options: data.campaigns.map((c) => ({ value: c.id, label: c.title })),
        },
        f(
          "salePriceCents",
          "Campaign sale price ($) · blank keeps regular price",
          "number",
        ),
      ],
    });
  }
  const visible = paintings.filter(
    (p) =>
      artworkPhase(p.availability) === phase &&
      `${p.project.title} ${p.medium} ${p.sales?.map((s) => s.notes + " " + s.saleDate).join(" ")}`
        .toLowerCase()
        .includes(query.toLowerCase()),
  );
  return (
    <>
      <div className="salesTabs" role="tablist" aria-label="Artwork lifecycle">
        {phases.map((t) => (
          <button
            key={t}
            role="tab"
            aria-selected={phase === t}
            onClick={() => setPhase(t)}
          >
            {t} ·{" "}
            {paintings.filter((p) => artworkPhase(p.availability) === t).length}
          </button>
        ))}
      </div>
      <label>
        Search artwork{" "}
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Title, medium, sale date or notes"
        />
      </label>
      <p>
        One artwork record from creation through sale. Unknown costs stay blank;
        enter 0 only when the cost is confirmed as zero.
      </p>
      <div className="salesGrid">
        {visible.map((p) => (
          <article className="panel" key={p.projectId}>
            {p.thumbnail && (
              <img
                className="salesThumb"
                src={p.thumbnail}
                alt={p.project.title}
              />
            )}
            <h3>{p.project.title}</h3>
            <p>
              {p.dimensions || "Dimensions not entered"} ·{" "}
              {p.medium || "Medium not entered"}
              <br />
              {p.framing || "Framing not entered"} · {p.availability}
            </p>
            <p>
              Regular price: {money(p.regularPriceCents)}
              <br />
              Materials: {money(p.materialsCostCents)} · Framing:{" "}
              {money(p.framingCostCents)}
            </p>
            <div className="salesBar">
              {phase === "Works in Progress" && (
                <button
                  className="primary"
                  disabled={busy}
                  onClick={() =>
                    mutate(
                      { action: "complete", projectId: p.projectId },
                      false,
                    )
                  }
                >
                  Complete Painting
                </button>
              )}
              {phase === "Available Inventory" && (
                <>
                  <button className="primary" onClick={() => saleForm(p)}>
                    Record Sale
                  </button>
                  <button onClick={() => link(p)}>Add to campaign</button>
                </>
              )}
              <button onClick={() => editPainting(p)}>Edit painting</button>
              <button onClick={() => costs(p)}>Edit costs</button>
              <button onClick={() => correction(p)}>Correct status</button>
              <a href={`/?project=${p.projectId}`}>Production history →</a>
            </div>
            {data.campaigns
              .filter((c) => c.artwork.some((a) => a.projectId === p.projectId))
              .map((c) => (
                <p key={c.id}>
                  <a href={`/campaigns?campaign=${c.id}`}>{c.title}</a>
                </p>
              ))}
            {p.sales?.map((s) => (
              <section className="panel" key={s.id}>
                <h3>
                  {s.saleDate} · {s.status} sale
                </h3>
                <p>
                  Actual sale price: {money(s.salePriceCents)} · Discount:{" "}
                  {money(s.discountCents)}
                  <br />
                  Payment: <strong>{s.summary.paymentStatus}</strong> ·
                  Received: {money(s.summary.receivedCents)} · Outstanding:{" "}
                  {money(s.summary.balanceCents)}
                  <br />
                  Fulfillment: <strong>{s.fulfillment}</strong>
                </p>
                <p>
                  Shipping income: {money(s.shippingIncomeCents)} · Shipping
                  expense: {money(s.shippingExpenseCents)}
                  <br />
                  Selling fees: {money(s.sellingFeesCents)}
                </p>
                <p>
                  <strong>
                    {s.status === "Voided" ? "Voided sale · " : ""}
                    {s.summary.costsComplete
                      ? "Profit"
                      : "Provisional profit"}: {money(s.summary.profitCents)}
                  </strong>
                  <br />
                  {s.summary.costsComplete
                    ? "All cost categories recorded."
                    : "Missing costs are unknown; calculation deducts only known costs."}{" "}
                  Returned or voided sales use net payments retained. Active sales use actual selling price, shipping income and refunds;
                  sales tax excluded. Unpaid sale value is not received income.
                </p>
                <div className="salesBar">
                  <button onClick={() => saleForm(p, s)}>
                    Edit sale / fulfillment
                  </button>
                  <button onClick={() => payment(p, s)}>
                    Record payment / refund
                  </button>
                  <button
                    onClick={() =>
                      open({
                        title: "Link existing payment or refund",
                        action: "linkPayment",
                        values: {
                          projectId: p.projectId,
                          saleId: s.id,
                          transactionId: "",
                        },
                        fields: [
                          {
                            name: "transactionId",
                            label: "Existing Money record",
                            required: true,
                            options: data.transactions
                              .filter(
                                (t) =>
                                  t.receivedAt &&
                                  !t.isNonArt &&
                                  (!t.artworkSaleId ||
                                    t.artworkSaleId === s.id) &&
                                  (!t.projectId || t.projectId === p.projectId),
                              )
                              .map((t) => ({
                                value: t.id,
                                label: `${t.type} · ${t.source} · ${money(t.amountCents)}`,
                              })),
                          },
                        ],
                      })
                    }
                  >
                    Reuse existing receipt
                  </button>
                </div>
                <small>
                  Receipts linked: {s.transactions.length}. Returns and
                  corrections preserve these records; record actual refunds
                  separately.
                </small>
              </section>
            ))}
            {p.availability === "Sold" && !p.sales?.length && (
              <p>
                Sale details and costs are unknown. Correct to Available if this
                was a mistake, then use Record Sale with an existing receipt.
              </p>
            )}
            {!!p.history?.length && (
              <details>
                <summary>Status and correction history</summary>
                {p.history.map((h) => (
                  <p key={h.id}>
                    {new Date(h.createdAt).toLocaleDateString("en-US", {
                      timeZone: "America/New_York",
                    })}{" "}
                    · {h.fromStatus ?? "New"} → {h.toStatus}
                    <br />
                    {h.note}
                  </p>
                ))}
              </details>
            )}
          </article>
        ))}
      </div>
      {!visible.length && <p>No matching paintings in {phase}.</p>}
    </>
  );
}
