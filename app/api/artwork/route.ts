import { NextRequest, NextResponse } from "next/server";
import { prisma } from "../../../lib/prisma";
import { validDate } from "../../../lib/campaign-rules";
export const runtime = "nodejs";
function amount(v: unknown, nullable = false): number | null {
  if (nullable && (v == null || v === "")) return null;
  if (
    v == null ||
    v === "" ||
    !Number.isSafeInteger(Number(v)) ||
    Number(v) < 0 ||
    Number(v) > 2000000000
  )
    throw Error("Enter a valid nonnegative amount. Leave unknown costs blank.");
  return Number(v);
}
function day(v: unknown) {
  if (!validDate(v)) throw Error("Enter a valid date.");
  return v;
}
function option(v: unknown, values: string[]) {
  if (typeof v !== "string" || !values.includes(v))
    throw Error("Choose a valid status.");
  return v;
}
const fulfillments = [
  "Awaiting shipment",
  "Packing",
  "Shipped",
  "Delivered",
  "Local pickup",
  "Fulfilled",
];
export async function POST(req: NextRequest) {
  try {
    const b = await req.json();
    const result = await prisma.$transaction(
      async (tx) => {
        const project = await tx.project.findUniqueOrThrow({
          where: { id: b.projectId },
          include: { artwork: true },
        });
        if (project.type !== "ARTWORK") throw Error("Choose a painting.");
        const painting =
          project.artwork ??
          (await tx.painting.create({
            data: {
              projectId: project.id,
              availability: "Not ready",
              regularPriceCents: project.valueCents,
            },
          }));
        if (b.action === "complete" || b.action === "status") {
          const next =
            b.action === "complete"
              ? "Available"
              : option(b.availability, [
                  "Not ready",
                  "Available",
                  "Reserved",
                  "Sold",
                ]);
          if (next !== painting.availability) {
            if (
              b.action === "status" &&
              (!b.reason || !String(b.reason).trim())
            )
              throw Error("Add a reason for this correction or return.");
            if (painting.availability === "Sold" && next !== "Sold")
              await tx.artworkSale.updateMany({
                where: { projectId: project.id, status: "Active" },
                data: {
                  status: option(b.saleDisposition ?? "Returned", [
                    "Returned",
                    "Voided",
                  ]),
                },
              });
            await tx.artworkHistory.create({
              data: {
                projectId: project.id,
                fromStatus: painting.availability,
                toStatus: next,
                note:
                  b.action === "complete"
                    ? "Painting completed and moved to available inventory."
                    : String(b.reason),
              },
            });
          }
          return tx.painting.update({
            where: { projectId: project.id },
            data: { availability: next },
          });
        }
        if (b.action === "costs")
          return tx.painting.update({
            where: { projectId: project.id },
            data: {
              materialsCostCents: amount(b.materialsCostCents, true),
              framingCostCents: amount(b.framingCostCents, true),
            },
          });
        if (b.action === "sale" || b.action === "editSale") {
          const saleData = {
            saleDate: day(b.saleDate),
            salePriceCents: amount(b.salePriceCents)!,
            discountCents: amount(b.discountCents)!,
            salesTaxCents: amount(b.salesTaxCents)!,
            shippingIncomeCents: amount(b.shippingIncomeCents)!,
            sellingFeesCents: amount(b.sellingFeesCents, true),
            shippingExpenseCents: amount(b.shippingExpenseCents, true),
            fulfillment: option(b.fulfillment, fulfillments),
            notes: typeof b.notes === "string" ? b.notes : "",
          };
          if (b.action === "editSale") {
            const sale = await tx.artworkSale.findFirstOrThrow({
              where: { id: b.id, projectId: project.id },
            });
            await tx.artworkHistory.create({
              data: {
                projectId: project.id,
                fromStatus: painting.availability,
                toStatus: painting.availability,
                note: `Corrected sale terms. Previously: ${sale.saleDate}, artwork $${(sale.salePriceCents/100).toFixed(2)}, discount $${(sale.discountCents/100).toFixed(2)}, fulfillment ${sale.fulfillment}.`,
              },
            });
            return tx.artworkSale.update({
              where: { id: sale.id },
              data: saleData,
            });
          }
          if (typeof b.requestKey !== "string" || !b.requestKey)
            throw Error("Missing request key.");
          const previous = await tx.artworkSale.findUnique({
            where: { requestKey: b.requestKey },
          });
          if (previous) return previous;
          if (!["Available", "Reserved"].includes(painting.availability))
            throw Error(
              "Only available paintings can be sold. Correct its status first.",
            );
          if (
            await tx.artworkSale.findFirst({
              where: { projectId: project.id, status: "Active" },
            })
          )
            throw Error(
              "An active sale already exists. Open it to record another payment.",
            );
          if (b.campaignId)
            await tx.campaignPainting.findUniqueOrThrow({
              where: {
                campaignId_projectId: {
                  campaignId: b.campaignId,
                  projectId: project.id,
                },
              },
            });
          const sale = await tx.artworkSale.create({
            data: {
              ...saleData,
              projectId: project.id,
              campaignId: b.campaignId || null,
              requestKey: b.requestKey,
            },
          });
          await tx.painting.update({
            where: { projectId: project.id },
            data: {
              availability: "Sold",
              materialsCostCents: amount(b.materialsCostCents, true),
              framingCostCents: amount(b.framingCostCents, true),
            },
          });
          if (b.existingTransactionId) {
            const t = await tx.transaction.findUniqueOrThrow({
              where: { id: b.existingTransactionId },
            });
            if (
              t.type !== "INCOME" ||
              !t.receivedAt ||
              t.isNonArt ||
              t.artworkSaleId ||
              (t.projectId && t.projectId !== project.id) ||
              (t.campaignId && b.campaignId && t.campaignId !== b.campaignId)
            )
              throw Error(
                "Choose an unlinked received artwork payment for this painting.",
              );
            if (
              t.amountCents >
              saleData.salePriceCents +
                saleData.salesTaxCents +
                saleData.shippingIncomeCents
            )
              throw Error(
                "Existing payment exceeds the sale total. Review the sale terms.",
              );
            await tx.transaction.update({
              where: { id: t.id },
              data: {
                projectId: project.id,
                artworkSaleId: sale.id,
                isArtworkReceipt: true,
                campaignId: t.campaignId || b.campaignId || null,
              },
            });
          } else {
            const received = amount(b.receivedCents)!;
            const tax = amount(b.receivedTaxCents)!,
              shipping = amount(b.receivedShippingCents)!;
            if (
              received >
                saleData.salePriceCents +
                  saleData.salesTaxCents +
                  saleData.shippingIncomeCents ||
              tax + shipping > received ||
              tax > saleData.salesTaxCents ||
              shipping > saleData.shippingIncomeCents
            )
              throw Error(
                "Received amount or its tax/shipping portions exceed the sale terms.",
              );
            if (received > 0) {
              const receivedAt = new Date(day(b.receivedDate) + "T17:00:00Z");
              await tx.transaction.create({
                data: {
                  type: "INCOME",
                  amountCents: received,
                  salesTaxCents: tax,
                  shippingCents: shipping,
                  receivedAt,
                  occurredAt: receivedAt,
                  source: b.source?.trim() || "Artwork sale",
                  incomeClass: "ACTIVE",
                  isNonArt: false,
                  isArtworkReceipt: true,
                  projectId: project.id,
                  artworkSaleId: sale.id,
                  campaignId: b.campaignId || null,
                  receiptKey: "sale-" + b.requestKey,
                },
              });
            }
          }
          await tx.artworkHistory.create({
            data: {
              projectId: project.id,
              fromStatus: painting.availability,
              toStatus: "Sold",
              note: `Sale recorded on ${sale.saleDate}: artwork $${(sale.salePriceCents/100).toFixed(2)}; fulfillment ${sale.fulfillment}.`,
            },
          });
          return sale;
        }
        if (b.action === "linkPayment") {
          const sale = await tx.artworkSale.findFirstOrThrow({
            where: { id: b.saleId, projectId: project.id },
          });
          const t = await tx.transaction.findUniqueOrThrow({
            where: { id: b.transactionId },
          });
          if (
            !t.receivedAt ||
            t.type === "EXPENSE" ||
            t.isNonArt ||
            (t.artworkSaleId && t.artworkSaleId !== sale.id) ||
            (t.projectId && t.projectId !== project.id)
          )
            throw Error(
              "Payment is not eligible or already belongs to another sale.",
            );
          return tx.transaction.update({
            where: { id: t.id },
            data: {
              artworkSaleId: sale.id,
              projectId: project.id,
              isArtworkReceipt: true,
            },
          });
        }
        throw Error("Unknown artwork action.");
      },
      { isolationLevel: "Serializable" },
    );
    return NextResponse.json({ ok: true, result });
  } catch (e) {
    const error = e as { code?: string; message?: string };
    return NextResponse.json(
      {
        error: error.code
          ? "Unable to save. A linked record is missing or changed; refresh and retry."
          : error.message,
      },
      { status: 400 },
    );
  }
}
