const queue = [
  { id: "WO-1042", client: "Northstar Studio", job: "Brand toolkit", stage: "In Production", value: "$1,850", due: "Sep 12", tone: "green" },
  { id: "WO-1041", client: "Mad Wizard Art", job: "Autumn print release", stage: "Proofing", value: "$620", due: "Sep 11", tone: "burgundy" },
  { id: "WO-1039", client: "Private Collector", job: "Commission", stage: "Awaiting Approval", value: "$700", due: "Sep 14", tone: "navy" },
  { id: "WO-1037", client: "Wizard OS", job: "Business engine MVP", stage: "Planning", value: "Internal", due: "Sep 18", tone: "navy" },
];

const nav = ["Command", "Queue", "Money", "Ventures", "Clients", "Inventory", "Projects", "Content", "Automations"];

export default function Home() {
  return (
    <main className="shell">
      <aside className="sidebar">
        <div className="brand">
          <span className="sigil">✦</span>
          <div>
            <h1>Wizard OS</h1>
            <p>Operations Console</p>
          </div>
        </div>

        <nav>
          {nav.map((item, index) => (
            <button key={item} className={index === 0 ? "navItem active" : "navItem"}>{item}</button>
          ))}
        </nav>

        <div className="sidebarFoot">
          <span>System</span>
          <strong>All clear</strong>
        </div>
      </aside>

      <section className="workspace">
        <header className="topbar">
          <div>
            <p className="eyebrow">Wednesday · September 9</p>
            <h2>Command Center</h2>
          </div>
          <button className="primary">+ New Work Order</button>
        </header>

        <section className="metrics">
          <article className="metric"><span>Month Revenue</span><strong>$4,270</strong><small>+12% vs. prior month</small></article>
          <article className="metric"><span>Recurring Income</span><strong>$420</strong><small>9.8% of revenue</small></article>
          <article className="metric"><span>Open Work</span><strong>7</strong><small>$3,170 pipeline</small></article>
          <article className="metric"><span>Freedom Target</span><strong>42%</strong><small>$420 / $1,000</small></article>
        </section>

        <section className="panel queuePanel">
          <div className="panelHead">
            <div><p className="eyebrow">FlightDeck-style queue</p><h3>Active Work</h3></div>
            <div className="filters"><button>All</button><button>Due Soon</button><button>Waiting</button></div>
          </div>

          <div className="tableWrap">
            <table>
              <thead><tr><th>Order</th><th>Client</th><th>Job</th><th>Status</th><th>Value</th><th>Due</th></tr></thead>
              <tbody>
                {queue.map((item) => (
                  <tr key={item.id}>
                    <td className="mono">{item.id}</td>
                    <td>{item.client}</td>
                    <td>{item.job}</td>
                    <td><span className={`status ${item.tone}`}>{item.stage}</span></td>
                    <td>{item.value}</td>
                    <td>{item.due}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="lowerGrid">
          <article className="panel">
            <div className="panelHead"><div><p className="eyebrow">Priority</p><h3>Next Best Actions</h3></div></div>
            <ol className="actions">
              <li><span>01</span><div><strong>Validate one non-art recurring offer</strong><p>Run one paid-demand test before building.</p></div></li>
              <li><span>02</span><div><strong>Close pending commission approval</strong><p>Follow up with collector today.</p></div></li>
              <li><span>03</span><div><strong>Finish print release proof</strong><p>Unlock listing and launch content.</p></div></li>
            </ol>
          </article>

          <article className="panel">
            <div className="panelHead"><div><p className="eyebrow">Income mix</p><h3>Revenue Sources</h3></div></div>
            <div className="mix">
              <div><span>Services</span><strong>54%</strong></div>
              <div><span>Art</span><strong>36%</strong></div>
              <div><span>Recurring</span><strong>10%</strong></div>
            </div>
            <div className="rule">✦</div>
            <p className="note">Goal: grow recurring income without increasing required weekly hours.</p>
          </article>
        </section>
      </section>
    </main>
  );
}
