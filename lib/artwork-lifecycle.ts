export function artworkPhase(availability?: string | null) {
  return availability === "Sold"
    ? "Sold Archive"
    : ["Available", "Reserved"].includes(availability ?? "")
      ? "Available Inventory"
      : "Works in Progress";
}
export function inProduction(project: {type?:string;statusEnum?:string;artworkAvailability?:string|null}) {
  if(project.type==='ARTWORK' && project.artworkAvailability != null) return artworkPhase(project.artworkAvailability)==='Works in Progress';
  return !['COMPLETE','ARCHIVED'].includes(project.statusEnum??'');
}
type Payment = {
  type: string;
  amountCents: number;
  salesTaxCents: number;
  shippingCents: number;
  receivedAt: Date | string | null;
};
export function saleSummary(
  sale: {
    status?: string;
    salePriceCents: number;
    shippingIncomeCents: number;
    salesTaxCents: number;
    sellingFeesCents: number | null;
    shippingExpenseCents: number | null;
    transactions: Payment[];
  },
  painting: {
    materialsCostCents: number | null;
    framingCostCents: number | null;
  },
) {
  const received = sale.transactions.filter(
    (t) => t.receivedAt && ["INCOME", "REFUND"].includes(t.type),
  );
  const receivedCents = received.reduce(
    (s, t) => s + (t.type === "REFUND" ? -1 : 1) * t.amountCents,
    0,
  );
  const refundCents = received
    .filter((t) => t.type === "REFUND")
    .reduce((s, t) => s + t.amountCents - t.salesTaxCents, 0);
  const dueCents =
    sale.salePriceCents + sale.shippingIncomeCents + sale.salesTaxCents;
  const costs = [
    painting.materialsCostCents,
    painting.framingCostCents,
    sale.sellingFeesCents,
    sale.shippingExpenseCents,
  ];
  const knownCostsCents = costs.reduce<number>((s, v) => s + (v ?? 0), 0);
  const costsComplete = costs.every((v) => v !== null);
  const reversed = sale.status === "Returned" || sale.status === "Voided";
  const retainedCents = received.reduce((sum,t)=>sum+(t.type === "REFUND" ? -1 : 1)*(t.amountCents-t.salesTaxCents),0);
  return {
    receivedCents,
    balanceCents: reversed ? 0 : Math.max(0, dueCents - receivedCents),
    paymentStatus:
      receivedCents <= 0
        ? received.some((t) => t.type === "REFUND")
          ? "Refunded"
          : "Unpaid"
        : receivedCents >= dueCents
          ? "Paid"
          : "Partially paid",
    knownCostsCents,
    costsComplete,
    profitCents: (reversed ? retainedCents : sale.salePriceCents + sale.shippingIncomeCents - refundCents) - knownCostsCents,
  };
}
