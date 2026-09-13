import { NextResponse } from "next/server";
import { prisma } from "../../../../lib/prisma";
import {
  MADWIZARD_SOLD_ARCHIVE,
  MADWIZARD_SOLD_LISTED_VALUE_CENTS,
} from "../../../../lib/madwizard-sold-archive";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    let imported = 0;
    let skipped = 0;

    for (const work of MADWIZARD_SOLD_ARCHIVE) {
      const created = await prisma.$transaction(async (tx) => {
        const existing = await tx.painting.findUnique({
          where: { projectId: work.projectId },
        });
        if (existing) return false;

        const project = await tx.project.findUnique({
          where: { id: work.projectId },
        });
        if (!project) {
          await tx.project.create({
            data: {
              id: work.projectId,
              title: work.title,
              type: "ARTWORK",
              status: "COMPLETE",
              progress: 100,
              valueCents: work.priceCents,
              notes: `Imported from MadWizardArt.com sold-out archive. Storefront listed price: $${(
                work.priceCents / 100
              ).toFixed(2)}. Actual sale date, selling price, fees, shipping, materials and framing costs remain unconfirmed. Source: ${work.sourceUrl}`,
            },
          });
        }

        await tx.painting.create({
          data: {
            projectId: work.projectId,
            thumbnail: work.thumbnail,
            dimensions: work.dimensions,
            medium: work.medium,
            framing: "",
            availability: "Sold",
            regularPriceCents: work.priceCents,
          },
        });
        await tx.artworkHistory.create({
          data: {
            projectId: work.projectId,
            fromStatus: null,
            toStatus: "Sold",
            note: "Imported from MadWizardArt.com sold-out storefront. Listed price is an archival/reference value; actual sale date, sale terms and costs remain unconfirmed.",
          },
        });
        return true;
      });

      if (created) imported += 1;
      else skipped += 1;
    }

    return NextResponse.json(
      {
        ok: true,
        imported,
        skipped,
        total: MADWIZARD_SOLD_ARCHIVE.length,
        listedValueCents: MADWIZARD_SOLD_LISTED_VALUE_CENTS,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    console.error("MadWizard sold archive import failed", error);
    return NextResponse.json(
      { error: "Could not import the MadWizardArt.com sold archive." },
      { status: 500 },
    );
  }
}
