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
    <>
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
      <style>{`
        .soldPaintingsCounter {
          position: fixed;
          right: 1rem;
          bottom: 1rem;
          z-index: 30;
          width: min(22rem, calc(100vw - 2rem));
          padding: 1rem 1.1rem;
          border: 1px solid rgba(255,255,255,.18);
          border-radius: 14px;
          background: rgba(20,18,25,.94);
          box-shadow: 0 12px 32px rgba(0,0,0,.35);
          backdrop-filter: blur(14px);
        }
        .soldCounterEyebrow { margin: 0; }
        .soldCounterAmount { margin: .35rem 0 .15rem; font-size: 1.7rem; }
        .soldCounterSummary { margin: 0; }
        .soldCounterDetails { display: block; margin-top: .45rem; opacity: .78; }
        @media (max-width: 620px) {
          .soldPaintingsCounter {
            right: .85rem;
            bottom: 5.35rem;
            width: calc(100vw - 1.7rem);
            padding: .8rem .9rem;
            border-radius: 13px;
          }
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
