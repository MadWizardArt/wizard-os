import DraftFinisher from "./DraftFinisher";
import EtsyConsole from "./EtsyConsole";

export default function EtsyPage() {
  return (
    <main style={{ minHeight: "100vh", padding: "32px 20px 64px", background: "#0b1118", color: "#e9edf1" }}>
      <section style={{ maxWidth: 880, margin: "0 auto" }}>
        <header style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, marginBottom: 18 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span aria-hidden="true" style={{ display: "grid", placeItems: "center", width: 34, height: 34, borderRadius: 9, background: "#6f263d", border: "1px solid #a85b74", color: "#f6e8ed", fontFamily: "Georgia, serif", fontSize: 20 }}>𝖂</span>
            <h1 style={{ margin: 0, fontSize: 28, fontWeight: 650 }}>Warlock</h1>
          </div>
          <a
            href="/api/etsy/connect"
            style={{ padding: "9px 12px", borderRadius: 9, border: "1px solid #34404d", background: "#17212c", color: "#d9e0e7", textDecoration: "none", fontSize: 13, fontWeight: 700, whiteSpace: "nowrap" }}
          >
            Reconnect Etsy
          </a>
        </header>

        <DraftFinisher />
        <EtsyConsole />
      </section>
    </main>
  );
}
