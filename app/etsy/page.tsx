type EtsyPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export default async function EtsyPage({ searchParams }: EtsyPageProps) {
  const params = (await searchParams) ?? {};
  const status = typeof params.status === "string" ? params.status : undefined;
  const reason = typeof params.reason === "string" ? params.reason : undefined;

  return (
    <main style={{ minHeight: "100vh", padding: "48px 24px", background: "#0b1118", color: "#e9edf1" }}>
      <section style={{ maxWidth: 760, margin: "0 auto", padding: 32, border: "1px solid #26313d", borderRadius: 18, background: "#111923" }}>
        <p style={{ margin: 0, color: "#a99164", letterSpacing: ".14em", textTransform: "uppercase", fontSize: 12 }}>Warlock</p>
        <h1 style={{ marginTop: 10, marginBottom: 12, fontSize: 36 }}>Etsy Seller Integration</h1>
        <p style={{ color: "#8e99a7", lineHeight: 1.6 }}>
          Connect your Etsy shop to Wizard OS so Warlock can prepare listings, sync shop data, and eventually create Etsy drafts for your approval.
        </p>

        {status === "connected" && (
          <div style={{ margin: "24px 0", padding: 16, borderRadius: 12, border: "1px solid #29533f", background: "#15231d" }}>
            Etsy authorization completed successfully.
          </div>
        )}

        {status === "error" && (
          <div style={{ margin: "24px 0", padding: 16, borderRadius: 12, border: "1px solid #6f263d", background: "#25151b" }}>
            Etsy connection failed{reason ? `: ${reason}` : "."}
          </div>
        )}

        <a
          href="/api/etsy/connect"
          style={{ display: "inline-block", marginTop: 12, padding: "12px 18px", borderRadius: 10, background: "#6f263d", color: "white", textDecoration: "none", fontWeight: 700 }}
        >
          Connect Etsy
        </a>

        <p style={{ marginTop: 22, color: "#8e99a7", fontSize: 13, lineHeight: 1.5 }}>
          Wizard OS requests listing and shop permissions needed for seller operations. Publishing remains approval-first.
        </p>
      </section>
    </main>
  );
}
