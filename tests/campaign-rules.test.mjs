import { test } from "node:test";
import assert from "node:assert/strict";
import {
  easternDate,
  overdue,
  goalReceived,
  validDate,
  weekRange,
} from "../lib/campaign-rules.ts";
const goal = {
  startDate: "2026-01-01",
  dueDate: "2026-12-31",
  excludeSalesTax: true,
  excludeShipping: true,
};
const payment = {
  type: "INCOME",
  amountCents: 12000,
  salesTaxCents: 500,
  shippingCents: 1500,
  receivedAt: "2026-09-25T17:00:00Z",
  isNonArt: false,
  isArtworkReceipt: true,
};
test("annual goal counts actual received artwork only, net of refunds, tax and shipping", () => {
  assert.equal(
    goalReceived(
      [
        payment,
        {
          ...payment,
          type: "REFUND",
          amountCents: 3000,
          salesTaxCents: 0,
          shippingCents: 0,
        },
        { ...payment, receivedAt: null },
        { ...payment, isArtworkReceipt: false },
        { ...payment, isNonArt: true },
        { ...payment, type: "EXPENSE" },
      ],
      goal,
    ),
    7000,
  );
});
test("Eastern annual boundaries and DST are independent of browser timezone", () => {
  assert.equal(easternDate(new Date("2027-01-01T04:59:00Z")), "2026-12-31");
  assert.equal(
    goalReceived(
      [
        { ...payment, receivedAt: "2027-01-01T04:59:00Z" },
        { ...payment, receivedAt: "2027-01-01T05:00:00Z" },
      ],
      goal,
    ),
    10000,
  );
  assert.equal(easternDate(new Date("2026-09-25T03:59:00Z")), "2026-09-24");
});
test("overdue all-day tasks stay current until Eastern day ends; timed and completed tasks differ", () => {
  const task = { dueDate: "2026-09-25", dueTime: null, completed: false };
  assert.equal(overdue(task, new Date("2026-09-26T03:59:00Z")), false);
  assert.equal(overdue(task, new Date("2026-09-26T04:00:00Z")), true);
  assert.equal(
    overdue({ ...task, dueTime: "09:00" }, new Date("2026-09-25T13:01:00Z")),
    true,
  );
  assert.equal(
    overdue({ ...task, completed: true }, new Date("2026-10-01")),
    false,
  );
});
test("invalid dates rejected and weeks span month boundaries", () => {
  assert.equal(validDate("2026-02-30"), false);
  assert.deepEqual(weekRange("2026-11-01"), {
    start: "2026-10-26",
    end: "2026-11-01",
  });
});
test("editable exclusions change the basis calculation", () => {
  assert.equal(
    goalReceived([payment], {
      ...goal,
      excludeSalesTax: false,
      excludeShipping: false,
    }),
    12000,
  );
});
