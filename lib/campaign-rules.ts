export const campaignStatuses = [
  "Draft",
  "Preparing",
  "Live",
  "Fulfillment",
  "Closed",
];
export const taskCategories = [
  "Painting",
  "Preparation",
  "Marketing",
  "Fulfillment",
];
export const zone = "America/New_York";
export function easternDate(date = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: zone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}
export function easternTime(date = new Date()) {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: zone,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(date);
}
export function validDate(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    !Number.isNaN(Date.parse(value)) &&
    new Date(value).toISOString().slice(0, 10) === value
  );
}
export function overdue(
  task: { dueDate: string; dueTime?: string | null; completed: boolean },
  now = new Date(),
) {
  const today = easternDate(now);
  return (
    !task.completed &&
    (task.dueDate < today ||
      (task.dueDate === today &&
        !!task.dueTime &&
        task.dueTime < easternTime(now)))
  );
}
export function addDays(day: string, n: number) {
  const d = new Date(day + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
export function weekRange(day = easternDate()) {
  const weekday = new Date(day + "T12:00:00Z").getUTCDay();
  const start = addDays(day, -(weekday === 0 ? 6 : weekday - 1));
  return { start, end: addDays(start, 6) };
}
export type Receipt = {
  type: string;
  amountCents: number;
  salesTaxCents: number;
  shippingCents: number;
  receivedAt: Date | string | null;
  isNonArt: boolean;
  isArtworkReceipt: boolean;
  project?: { type: string } | null;
};
export function receiptValue(
  t: Receipt,
  goal: { excludeSalesTax: boolean; excludeShipping: boolean },
) {
  if (
    !t.receivedAt ||
    t.isNonArt ||
    !(t.isArtworkReceipt || t.project?.type === "ARTWORK") ||
    !["INCOME", "REFUND"].includes(t.type)
  )
    return 0;
  return (
    (t.type === "REFUND" ? -1 : 1) *
    Math.max(
      0,
      t.amountCents -
        (goal.excludeSalesTax ? t.salesTaxCents : 0) -
        (goal.excludeShipping ? t.shippingCents : 0),
    )
  );
}
export function goalReceived(
  receipts: Receipt[],
  goal: {
    startDate: string;
    dueDate: string;
    excludeSalesTax: boolean;
    excludeShipping: boolean;
  },
) {
  return receipts.reduce((sum, t) => {
    const d = t.receivedAt ? easternDate(new Date(t.receivedAt)) : "";
    return (
      sum +
      (d >= goal.startDate && d <= goal.dueDate ? receiptValue(t, goal) : 0)
    );
  }, 0);
}
