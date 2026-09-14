import { saleSummary } from "../../lib/artwork-lifecycle";
import { MADWIZARD_SOLD_ARCHIVE_PREFIX } from "../../lib/madwizard-sold-archive";
import { prisma } from "../../lib/prisma";

const money = (cents: number) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  }).format(cents / 100);

export default async function SoldPaintingsCounter() {
  const paintings = await prisma.painting.findMany({
    where: {
      projectId: { startsWith: MADWIZARD_SOLD_ARCHIVE_PREFIX },
      availability: "Sold",
    },
    include: {
      sales: {
        include: { transactions: true },
        orderBy: { createdAt: "desc" },
      },
    },
  });

  let profitCents = 0;
  let listedValueCents = 0;
  let fullyDocumented = paintings.length > 0;

  for (const painting of paintings) {
    listedValueCents += painting.regularPriceCents ?? 0;
    const activeSale = painting.sales.find((sale) => sale.status === "Active");
    if (activeSale) {
      const summary = saleSummary(activeSale, painting);
      profitCents += summary.profitCents;
      if (!summary.costsComplete) fullyDocumented = false;
    } else {
      profitCents +=
        (painting.regularPriceCents ?? 0) -
        (painting.materialsCostCents ?? 0) -
        (painting.framingCostCents ?? 0);
      fullyDocumented = false;
    }
  }

  if (!paintings.length) return null;

  return (
    <aside
      className="soldPaintingsCounter"
      aria-label="MadWizardArt sold painting profit counter"
    >
      <p className="eyebrow soldCounterEyebrow">
        MadWizardArt.com · Sold paintings only
      </p>
      <h3 className="soldCounterAmount">{money(profitCents)}</h3>
      <p className="soldCounterSummary">
        <strong>{fullyDocumented ? "Profit" : "Provisional profit"}</strong> ·{" "}
        {paintings.length} archived painting{paintings.length === 1 ? "" : "s"}
      </p>
      <small className="soldCounterDetails">
        Listed sold value {money(listedValueCents)}. This counter excludes every
        non-imported artwork. Until historical sale terms and costs are entered,
        listed price minus known materials/framing costs is used provisionally.
      </small>
    </aside>
  );
}
