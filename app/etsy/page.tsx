import EtsyConsole from "./EtsyConsole";
import DraftFinisher from "./DraftFinisher";

type EtsyPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export default async function EtsyPage({ searchParams }: EtsyPageProps) {
  const params = (await searchParams) ?? {};
  const status = typeof params.status === "string" ? params.status : undefined;
  const reason = typeof params.reason === "string" ? params.reason : undefined;

  return (
    <main style={{ minHeight: "100vh", padding: "48px 24px", background: "#0b1118", color: "#e9edf1" }}>
      <section style={{ maxWidth: 860, margin: "0 auto" }}>
        <div style={{ padding: 32, border: "1px solid #26313d", borderRadius: 18, background: "#111923", marginBottom: 22 }}>
          <p style={{ margin: 0, color: "#a99164", letterSpacing: ".14em", textTransform: "uppercase", fontSize: 12 }}>Warlock</p>
          <h1 style={{ marginTop: 10, marginBottom: 12, fontSize: 36 }}>Etsy Seller Operations</h1>
          <p style={{ color: "#8e99a7", lineHeight: 1.6 }}>
            Verify the connected shop, prepare Spellmark listings, create Etsy drafts, and finish them for final human review. Publishing remains a separate approval step.
          </p>

          {status === "connected" && (
            <div style={{ marginTop: 20, padding: 16, borderRadius: 12, border: "1px solid #29533f", background: "#15231d" }}>
              Etsy authorization completed successfully.
            </div>
          )}

          {status === "error" && (
            <div style={{ marginTop: 20, padding: 16, borderRadius: 12, border: "1px solid #6f263d", background: "#25151b" }}>
              Etsy connection failed{reason ? `: ${reason}` : "."}
            </div>
          )}

          <a href="/api/etsy/connect" style={{ display: "inline-block", marginTop: 18, padding: "10px 15px", borderRadius: 9, background: "#26313d", color: "#e9edf1", textDecoration: "none", fontWeight: 700 }}>
            Reconnect Etsy
          </a>
        </div>

        <EtsyConsole />
        <DraftFinisher />
      </section>
    </main>
  );
}
