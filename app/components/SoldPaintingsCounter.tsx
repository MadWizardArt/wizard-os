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
      aria-label="MadWizardArt sold painting profit counter"
      style={{
        position: "fixed",
        right: "1rem",
        bottom: "1rem",
        zIndex: 30,
        width: "min(22rem, calc(100vw - 2rem))",
        padding: "1rem 1.1rem",
        border: "1px solid rgba(255,255,255,.18)",
        borderRadius: "14px",
        background: "rgba(20, 18, 25, .94)",
        boxShadow: "0 12px 32px rgba(0,0,0,.35)",
        backdropFilter: "blur(14px)",
      }}
    >
      <p className="eyebrow" style={{ margin: 0 }}>
        MadWizardArt.com · Sold paintings only
      </p>
      <h3 style={{ margin: ".35rem 0 .15rem", fontSize: "1.7rem" }}>
        {money(profitCents)}
      </h3>
      <p style={{ margin: 0 }}>
        <strong>{fullyDocumented ? "Profit" : "Provisional profit"}</strong> ·{" "}
        {paintings.length} archived painting{paintings.length === 1 ? "" : "s"}
      </p>
      <small style={{ display: "block", marginTop: ".45rem", opacity: 0.78 }}>
        Listed sold value {money(listedValueCents)}. This counter excludes every
        non-imported artwork. Until historical sale terms and costs are entered,
        listed price minus known materials/framing costs is used provisionally.
      </small>
    </aside>
  );
}
