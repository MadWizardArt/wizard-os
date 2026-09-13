"use client";
import ArtworkLifecycle from "./ArtworkLifecycle";
import { useEffect, useState, type FormEvent } from "react";
import {
  campaignStatuses,
  taskCategories,
  easternDate,
  overdue,
  weekRange,
  addDays,
} from "../../lib/campaign-rules";
import type {
  SalesData,
  Campaign,
  Task,
  Painting,
} from "../../lib/campaign-types";
const money = (v: number | null) =>
  v == null
    ? "Not priced"
    : new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: "USD",
        maximumFractionDigits: 2,
      }).format(v / 100);
const displayDate = (d: string) =>
  new Date(d + "T12:00:00Z").toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "America/New_York",
  });
const campaignUrl = (id: string) =>
  `/campaigns?campaign=${encodeURIComponent(id)}`;
function Thumb({ painting }: { painting: Painting }) {
  return painting.thumbnail ? (
    <img
      className="salesThumb"
      src={painting.thumbnail}
      alt={painting.project.title}
    />
  ) : (
    <span className="salesThumb placeholder" aria-label="No artwork image">
      ✦
    </span>
  );
}
function useSales() {
  const [data, setData] = useState<SalesData | null>(null),
    [error, setError] = useState("");
  async function refresh() {
    try {
      const r = await fetch("/api/campaigns", { cache: "no-store" });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      setData(d);
      setError("");
    } catch (e) {
      setError((e as Error).message);
    }
  }
  useEffect(() => {
    refresh();
    const reload = () => refresh();
    window.addEventListener("focus", reload);
    return () => window.removeEventListener("focus", reload);
  }, []);
  return { data, error, refresh };
}
export function CampaignDashboard() {
  const { data, error, refresh } = useSales();
  if (error)
    return (
      <section className="panel sales">
        <p role="alert">Painting sales: {error}</p>
        <button onClick={refresh}>Retry</button>
      </section>
    );
  if (!data)
    return <section className="panel sales">Loading painting sales…</section>;
  const g = data.goal,
    w = weekRange(),
    tasks = data.campaigns
      .flatMap((c) => c.tasks.map((t) => ({ ...t, campaign: c })))
      .filter(
        (t) => !t.completed && t.dueDate >= w.start && t.dueDate <= w.end,
      ),
    active = data.campaigns.filter(
      (c) => !["Draft", "Closed"].includes(c.status),
    );
  return (
    <section className="panel sales salesDashboard">
      <div className="salesBar">
        <div>
          <p className="eyebrow">
            Painting sales · due {displayDate(g.dueDate)}
          </p>
          <h3>
            {money(g.receivedCents)} received of {money(g.targetCents)}
          </h3>
        </div>
        <a href="/campaigns">Open Campaigns →</a>
      </div>
      <progress max={g.targetCents || 1} value={Math.max(0, g.receivedCents)} />
      <p>
        {money(Math.max(0, g.targetCents - g.receivedCents))} remaining ·{" "}
        {g.basis}
        {g.excludeSalesTax ? " · excludes sales tax" : ""}
        {g.excludeShipping ? " and shipping" : ""}
      </p>
      <div className="salesSplit">
        <div>
          <strong>Active campaigns · {active.length}</strong>
          {active.map((c) => (
            <p key={c.id}>
              <a href={campaignUrl(c.id)}>{c.title}</a> · {c.status}
            </p>
          ))}
          {!active.length && (
            <p>No active campaigns. Draft campaigns are in Campaigns.</p>
          )}
        </div>
        <div>
          <strong>This week · Eastern time</strong>
          {tasks.map((t) => (
            <p key={t.id} className={overdue(t) ? "salesOverdue" : ""}>
              <a href={campaignUrl(t.campaignId)}>{t.title}</a> · {t.dueDate}
              {overdue(t) ? " · Overdue" : ""}
            </p>
          ))}
          {!tasks.length && <p>No incomplete tasks due this week.</p>}
        </div>
      </div>
      <div className="salesBar">
        <a className="primary" href="/campaigns?new=campaign">
          New Campaign
        </a>
        <a className="primary" href="/inventory?new=painting">
          Add Painting
        </a>
        <a className="primary" href="/inventory">
          Record Sale
        </a>
      </div>
    </section>
  );
}

export type Field = {
  name: string;
  label: string;
  type?: string;
  options?: { value: string; label: string }[];
  required?: boolean;
};
export type Editor = {
  title: string;
  action: string;
  values: Record<string, unknown>;
  fields: Field[];
};
const textField = (
  name: string,
  label: string,
  type = "text",
  required = false,
): Field => ({ name, label, type, required });
const selectField = (name: string, label: string, items: string[]): Field => ({
  name,
  label,
  options: items.map((value) => ({ value, label: value })),
});
export default function Campaigns({
  mode = "campaigns",
}: {
  mode?: "campaigns" | "calendar" | "inventory";
}) {
  const { data, error, refresh } = useSales();
  const [selected, setSelected] = useState("");
  const [tab, setTab] = useState("Overview");
  const [calendarView, setCalendarView] = useState("Month");
  const [month, setMonth] = useState(easternDate().slice(0, 7));
  const [editor, setEditor] = useState<Editor | null>(null);
  const [busy, setBusy] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [notice, setNotice] = useState("");
  const [initializedQuery, setInitializedQuery] = useState(false);
  const c = data?.campaigns.find((c) => c.id === selected);
  const opts =
    data?.campaigns.map((c) => ({ value: c.id, label: c.title })) ?? [];
  async function mutate(payload: Record<string, unknown>, close = true) {
    setBusy(true);
    setSaveError("");
    try {
      const r = await fetch(
        [
          "complete",
          "status",
          "costs",
          "sale",
          "editSale",
          "linkPayment",
        ].includes(String(payload.action))
          ? "/api/artwork"
          : "/api/campaigns",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        },
      );
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      await refresh();
      if (close) setEditor(null);
      setNotice("Saved to Wizard OS.");
      return true;
    } catch (e) {
      setSaveError((e as Error).message);
      return false;
    } finally {
      setBusy(false);
    }
  }
  function open(e: Editor) {
    setSaveError("");
    setEditor(e);
  }
  function campaignForm(c?: Campaign) {
    open({
      title: c ? "Edit campaign" : "New Campaign",
      action: "campaign",
      values: c
        ? { ...c, targetCents: c.targetCents / 100 }
        : {
            title: "",
            status: "Draft",
            startDate: easternDate(),
            endDate: easternDate(),
            targetCents: 0,
            notes: "",
          },
      fields: [
        textField("title", "Campaign title", "text", true),
        selectField("status", "Status", campaignStatuses),
        textField("startDate", "Sale starts", "date", true),
        textField("endDate", "Sale ends (inclusive)", "date", true),
        textField("targetCents", "Proposed revenue target ($)", "number", true),
        textField("notes", "Notes", "textarea"),
      ],
    });
  }
  function taskForm(t?: Task) {
    open({
      title: t ? "Edit task" : "New task",
      action: "task",
      values: t
        ? { ...t }
        : {
            campaignId: c?.id ?? opts[0]?.value,
            title: "",
            dueDate: easternDate(),
            dueTime: "",
            category: "Preparation",
            completed: false,
          },
      fields: [
        ...(t
          ? []
          : [
              {
                name: "campaignId",
                label: "Campaign",
                options: opts,
                required: true,
              },
            ]),
        textField("title", "Task", "text", true),
        textField("dueDate", "Due date", "date", true),
        textField("dueTime", "Optional time · Eastern", "time"),
        selectField("category", "Category", taskCategories),
        textField("completed", "Completed", "checkbox"),
      ],
    });
  }
  function paintingForm(p?: Painting) {
    open({
      title: p ? "Edit painting" : "Add Painting",
      action: "painting",
      values: p
        ? {
            ...p,
            title: p.project.title,
            regularPriceCents:
              p.regularPriceCents == null ? "" : p.regularPriceCents / 100,
          }
        : {
            title: "",
            thumbnail: "",
            dimensions: "",
            medium: "",
            framing: "",
            availability: "Available",
            regularPriceCents: "",
            batchId: "",
          },
      fields: [
        textField("title", "Artwork title", "text", true),
        textField("thumbnail", "Thumbnail image URL", "url"),
        textField("dimensions", "Dimensions (include units)"),
        textField("medium", "Medium"),
        textField("framing", "Framing"),
        ...(!p
          ? [
              selectField("availability", "Availability", [
                "Available",
                "Not ready",
              ]),
            ]
          : []),
        textField("regularPriceCents", "Regular price ($)", "number"),
        {
          name: "batchId",
          label: "Production batch (optional)",
          options: [
            { value: "", label: "No batch" },
            ...(data?.campaigns.flatMap((c) =>
              c.batches.map((b) => ({ value: b.id, label: b.title })),
            ) ?? []),
          ],
        },
      ],
    });
  }
  function receiptForm() {
    open({
      title: "Record received payment or refund",
      action: "receipt",
      values: {
        campaignId: c?.id ?? "",
        projectId: "",
        type: "INCOME",
        amountCents: "",
        salesTaxCents: 0,
        shippingCents: 0,
        receivedDate: easternDate(),
        source: "Artwork sale",
        markSold: false,
        notes: "",
        receiptKey: crypto.randomUUID(),
      },
      fields: [
        {
          name: "campaignId",
          label: "Campaign (optional)",
          options: [{ value: "", label: "No campaign" }, ...opts],
        },
        {
          name: "projectId",
          label: "Painting (optional; must belong to selected campaign)",
          options: [
            { value: "", label: "No individual painting" },
            ...(data?.paintings.map((p) => ({
              value: p.projectId,
              label: `${p.project.title} · ${p.availability}`,
            })) ?? []),
          ],
        },
        selectField("type", "Payment type", ["INCOME", "REFUND"]),
        textField(
          "amountCents",
          "Total actually received / refunded ($)",
          "number",
          true,
        ),
        textField("salesTaxCents", "Sales tax portion ($)", "number", true),
        textField("shippingCents", "Shipping portion ($)", "number", true),
        textField("receivedDate", "Payment / refund date", "date", true),
        textField("source", "Payment source or reference", "text", true),

        textField("notes", "Notes", "textarea"),
      ],
    });
  }
  useEffect(() => {
    if (!data || initializedQuery) return;
    setInitializedQuery(true);
    const q = new URLSearchParams(location.search);
    setSelected(q.get("campaign") ?? "");
    if (q.get("new") === "campaign") campaignForm();
    if (q.get("new") === "painting") paintingForm();
    if (q.get("new") === "receipt") receiptForm();
  }, [data, initializedQuery]);
  const allTasks =
    data?.campaigns.flatMap((c) =>
      c.tasks.map((t) => ({ ...t, campaignTitle: c.title })),
    ) ?? [];
  const late = allTasks.filter((t) => overdue(t));
  function taskRow(t: Task) {
    return (
      <div
        className={`salesTask ${overdue(t) ? "salesOverdue" : ""}`}
        key={t.id}
      >
        <input
          type="checkbox"
          aria-label={`Complete ${t.title}`}
          checked={t.completed}
          disabled={busy}
          onChange={(e) =>
            mutate(
              { action: "completeTask", id: t.id, completed: e.target.checked },
              false,
            )
          }
        />
        <button
          className={t.completed ? "salesDone" : ""}
          onClick={() => taskForm(t)}
        >
          {t.title}
          <small>
            {t.dueDate}
            {t.dueTime ? ` at ${t.dueTime} ET` : " · all day"} · {t.category}
            {overdue(t) ? " · OVERDUE" : ""}
          </small>
        </button>
      </div>
    );
  }
  function linkForm(projectId = "", salePriceCents: number | null = null) {
    open({
      title: "Link artwork / set sale price",
      action: "linkPainting",
      values: {
        campaignId: c?.id,
        projectId,
        salePriceCents: salePriceCents == null ? "" : salePriceCents / 100,
      },
      fields: [
        {
          name: "projectId",
          label: "Existing artwork record",
          required: true,
          options:
            data?.projects.map((p) => ({ value: p.id, label: p.title })) ?? [],
        },
        textField(
          "salePriceCents",
          "Campaign sale price ($) · blank uses regular price",
          "number",
        ),
      ],
    });
  }
  function contentForm(content?: Campaign["content"][number]) {
    open({
      title: "Facebook draft",
      action: "content",
      values: content
        ? { ...content }
        : {
            campaignId: c?.id,
            title: "",
            text: "",
            postingDate: easternDate(),
            status: "Draft",
          },
      fields: [
        textField("title", "Draft title", "text", true),
        textField("text", "Facebook text", "textarea"),
        textField("postingDate", "Intended posting date", "date", true),
        selectField("status", "Status", ["Draft", "Posted"]),
      ],
    });
  }
  function batchForm(b?: Campaign["batches"][number]) {
    open({
      title: b ? "Edit production batch" : "New production batch",
      action: "batch",
      values: b
        ? { ...b, unitPriceCents: b.unitPriceCents / 100 }
        : {
            campaignId: c?.id,
            title: "",
            plannedQuantity: 1,
            weeklyQuantity: 1,
            unitPriceCents: 100,
            startDate: easternDate(),
            completionDate: easternDate(),
          },
      fields: [
        textField("title", "Batch title", "text", true),
        textField("plannedQuantity", "Planned quantity", "number", true),
        textField("weeklyQuantity", "Paintings per week", "number", true),
        textField("unitPriceCents", "Planned unit price ($)", "number", true),
        textField("startDate", "Production starts", "date", true),
        textField("completionDate", "Painting completion target", "date", true),
      ],
    });
  }
  function goalForm() {
    if (!data) return;
    open({
      title: "Annual artwork goal",
      action: "goal",
      values: { ...data.goal, targetCents: data.goal.targetCents / 100 },
      fields: [
        textField("targetCents", "Goal ($)", "number", true),
        textField("startDate", "Receipts counted from", "date", true),
        textField("dueDate", "Goal due", "date", true),
        textField(
          "basis",
          "Provisional basis label (received artwork payments only)",
          "text",
          true,
        ),
        textField("excludeSalesTax", "Exclude sales tax", "checkbox"),
        textField("excludeShipping", "Exclude shipping", "checkbox"),
      ],
    });
  }
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!editor) return;
    const payload: Record<string, unknown> = {
      ...editor.values,
      action: editor.action,
    };
    for (const f of editor.fields) {
      if (f.name.endsWith("Cents")) {
        payload[f.name] =
          payload[f.name] === ""
            ? null
            : Math.round(Number(payload[f.name]) * 100);
      } else if (f.type === "number") payload[f.name] = Number(payload[f.name]);
    }
    await mutate(payload);
  }
  const days = (() => {
    const first = month + "-01";
    const offset = new Date(first + "T12:00:00Z").getUTCDay();
    return Array.from({ length: 42 }, (_, i) => addDays(first, i - offset));
  })();
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
          {[
            ["/", "The Crucible"],
            ["/campaigns", "Campaigns"],
            ["/calendar", "Calendar"],
            ["/inventory", "Inventory"],
            ["/?view=money", "Money"],
            ["/?view=projects", "Projects"],
          ].map(([url, label]) => (
            <a
              key={url}
              className={`navItem ${mode === label.toLowerCase() ? "active" : ""}`}
              href={url}
            >
              {label}
            </a>
          ))}
        </nav>
        <a className="primary warlockLink" href="/etsy">
          Warlock
        </a>
      </aside>
      <section className="workspace sales">
        <nav className="salesMobileNav" aria-label="Sales navigation">
          <a href="/">Crucible</a>
          <a href="/campaigns">Campaigns</a>
          <a href="/calendar">Calendar</a>
          <a href="/inventory">Inventory</a>
        </nav>
        <header className="topbar">
          <div>
            <p className="eyebrow">Painting sales · America/New_York</p>
            <h2>
              {mode === "calendar"
                ? "Calendar"
                : mode === "inventory"
                  ? "Artwork inventory"
                  : (c?.title ?? "Campaigns")}
            </h2>
          </div>
          <div className="salesBar">
            <button
              className="primary"
              onClick={() =>
                mode === "calendar"
                  ? taskForm()
                  : mode === "inventory"
                    ? paintingForm()
                    : campaignForm()
              }
              disabled={!data}
            >
              {mode === "calendar"
                ? "New task"
                : mode === "inventory"
                  ? "Add Painting"
                  : "New Campaign"}
            </button>
            <button onClick={refresh}>Refresh</button>
          </div>
        </header>
        {error && (
          <p role="alert" className="salesOverdue">
            {error}
          </p>
        )}
        {!data && !error && <p>Loading saved records…</p>}
        {notice && (
          <p role="status" className="salesSaved">
            {notice}
          </p>
        )}
        {saveError && !editor && (
          <p role="alert" className="salesOverdue">
            {saveError}
          </p>
        )}
        {data && (
          <>
            {!data.initialized && (
              <section className="panel">
                <h3>2026 painting sales setup</h3>
                <p>
                  {data.priorWorkOrders.length
                    ? `Found ${data.priorWorkOrders.length} matching prior work order(s). Setup will reuse the earliest record and preserve its notes and workflow.`
                    : "No matching prior sales work order found in the database."}
                </p>
                <p>
                  Create the September and Black Friday campaigns, the
                  30-painting batch, six weekly painting tasks, and the separate
                  $14,000 annual goal. No revenue or inventory is added.
                </p>
                <button
                  className="primary"
                  disabled={busy}
                  onClick={() => mutate({ action: "initialize" })}
                >
                  Set up 2026 campaigns
                </button>
              </section>
            )}
            {mode === "campaigns" && !c && (
              <>
                <section className="panel salesGoal">
                  <div className="salesBar">
                    <div>
                      <p className="eyebrow">
                        Annual artwork goal · {displayDate(data.goal.dueDate)}
                      </p>
                      <h3>
                        {money(data.goal.receivedCents)} /{" "}
                        {money(data.goal.targetCents)}
                      </h3>
                    </div>
                    <button onClick={goalForm}>Edit goal & basis</button>
                  </div>
                  <progress
                    value={Math.max(0, data.goal.receivedCents)}
                    max={data.goal.targetCents || 1}
                  />
                  <p>
                    {money(
                      Math.max(
                        0,
                        data.goal.targetCents - data.goal.receivedCents,
                      ),
                    )}{" "}
                    remaining · {data.goal.basis}
                    {data.goal.excludeSalesTax ? " · excludes tax" : ""}
                    {data.goal.excludeShipping ? " · excludes shipping" : ""}.
                    Refunds reduce progress. Monthly qualifying-income goals are
                    unchanged.
                  </p>
                  <a className="primary" href="/inventory">
                    Record Sale
                  </a>
                </section>
                <div className="salesGrid">
                  {data.campaigns.map((c) => {
                    const next = c.tasks
                      .filter((t) => !t.completed)
                      .sort((a, b) =>
                        (a.dueDate + (a.dueTime ?? "23:59")).localeCompare(
                          b.dueDate + (b.dueTime ?? "23:59"),
                        ),
                      )[0];
                    return (
                      <a
                        className="panel salesCard"
                        href={campaignUrl(c.id)}
                        key={c.id}
                      >
                        <div className="salesBar">
                          <span className={`salesStatus ${c.status}`}>
                            {c.status}
                          </span>
                          <span>
                            {displayDate(c.startDate)} –{" "}
                            {displayDate(c.endDate)}
                          </span>
                        </div>
                        <h3>{c.title}</h3>
                        <div className="salesThumbnails">
                          {c.artwork.slice(0, 4).map((a) => (
                            <Thumb key={a.projectId} painting={a.painting} />
                          ))}
                          {!c.artwork.length && (
                            <span>No artwork linked yet</span>
                          )}
                        </div>
                        <div className="salesSplit">
                          <p>
                            Proposed target
                            <strong>{money(c.targetCents)}</strong>
                          </p>
                          <p>
                            Actually received
                            <strong>{money(c.receivedCents)}</strong>
                          </p>
                        </div>
                        <p
                          className={
                            next && overdue(next) ? "salesOverdue" : ""
                          }
                        >
                          Next deadline:{" "}
                          {next
                            ? `${next.title} · ${next.dueDate}${next.dueTime ? " " + next.dueTime + " ET" : ""}`
                            : "No incomplete tasks"}
                        </p>
                      </a>
                    );
                  })}
                </div>
                {!data.campaigns.length && (
                  <p>No campaigns yet. Create one or use the 2026 setup.</p>
                )}
              </>
            )}
            {mode === "campaigns" && c && (
              <>
                <a href="/campaigns">← All campaigns</a>
                <div className="salesTabs" role="tablist">
                  {["Overview", "Tasks", "Artwork", "Content", "Results"].map(
                    (t) => (
                      <button
                        key={t}
                        role="tab"
                        aria-selected={tab === t}
                        onClick={() => setTab(t)}
                      >
                        {t}
                      </button>
                    ),
                  )}
                </div>
                {tab === "Overview" && (
                  <section className="panel">
                    <div className="salesBar">
                      <h3>
                        {c.status} · {displayDate(c.startDate)} –{" "}
                        {displayDate(c.endDate)}
                      </h3>
                      <button onClick={() => campaignForm(c)}>
                        Edit campaign
                      </button>
                    </div>
                    <div className="salesSplit">
                      <p>
                        Proposed target<strong>{money(c.targetCents)}</strong>
                      </p>
                      <p>
                        Actually received
                        <strong>{money(c.receivedCents)}</strong>
                      </p>
                    </div>
                    <p className="salesPre">
                      {c.notes ||
                        "Add campaign notes when your detailed plan is ready."}
                    </p>
                    {c.project && (
                      <p>
                        Linked work order:{" "}
                        <a href={`/?project=${c.project.id}`}>
                          {c.project.title}
                        </a>
                      </p>
                    )}
                    <h3>Upcoming work</h3>
                    {c.tasks
                      .filter((t) => !t.completed)
                      .slice(0, 5)
                      .map(taskRow)}
                    <a href="/calendar">Open calendar →</a>
                  </section>
                )}
                {tab === "Tasks" && (
                  <section className="panel">
                    <div className="salesBar">
                      <h3>Campaign tasks</h3>
                      <button onClick={() => taskForm()}>Add task</button>
                    </div>
                    {c.tasks.map(taskRow)}
                    {!c.tasks.length && <p>No tasks yet.</p>}
                  </section>
                )}
                {tab === "Artwork" && (
                  <>
                    <div className="salesBar">
                      <button onClick={() => linkForm()}>
                        Link existing artwork
                      </button>
                      <button onClick={() => paintingForm()}>
                        Add Painting
                      </button>
                      <button onClick={() => batchForm()}>
                        New production batch
                      </button>
                    </div>
                    <div className="salesGrid">
                      {c.artwork.map((a) => (
                        <article className="panel" key={a.projectId}>
                          <Thumb painting={a.painting} />
                          <h3>{a.painting.project.title}</h3>
                          <p>
                            {a.painting.dimensions || "Dimensions not entered"}{" "}
                            · {a.painting.medium || "Medium not entered"}
                          </p>
                          <p>Framing: {a.painting.framing || "Not entered"}</p>
                          <p
                            className={
                              a.painting.availability === "Sold"
                                ? "salesOverdue"
                                : ""
                            }
                          >
                            {a.painting.availability}
                            {a.painting.availability === "Sold"
                              ? " · unavailable in every campaign"
                              : ""}
                          </p>
                          <p>
                            Regular: {money(a.painting.regularPriceCents)}
                            <br />
                            Campaign:{" "}
                            {money(
                              a.salePriceCents ?? a.painting.regularPriceCents,
                            )}
                          </p>
                          <div className="salesBar">
                            <button
                              onClick={() =>
                                linkForm(a.projectId, a.salePriceCents)
                              }
                            >
                              Sale price
                            </button>
                            <button onClick={() => paintingForm(a.painting)}>
                              Edit painting
                            </button>
                            <button
                              onClick={() =>
                                mutate({
                                  action: "unlinkPainting",
                                  campaignId: c.id,
                                  projectId: a.projectId,
                                })
                              }
                            >
                              Unlink
                            </button>
                          </div>
                        </article>
                      ))}
                    </div>
                    <h3>Production batches</h3>
                    {c.batches.map((b) => (
                      <section className="panel" key={b.id}>
                        <div className="salesBar">
                          <h3>{b.title}</h3>
                          <button onClick={() => batchForm(b)}>
                            Edit batch
                          </button>
                        </div>
                        <p>
                          {b.plannedQuantity} planned · {b._count.paintings}{" "}
                          individual records · {b.weeklyQuantity} per week ·{" "}
                          {money(b.unitPriceCents)} each
                        </p>
                        <p>
                          {displayDate(b.startDate)} – painting completion{" "}
                          {displayDate(b.completionDate)}
                        </p>
                        <p>
                          Planned sales value:{" "}
                          {money(b.plannedQuantity * b.unitPriceCents)}. This is
                          not received revenue.
                        </p>
                      </section>
                    ))}
                  </>
                )}
                {tab === "Content" && (
                  <>
                    <div className="salesBar">
                      <p>Facebook planning only. Copy and post manually.</p>
                      <button onClick={() => contentForm()}>
                        New Facebook draft
                      </button>
                    </div>
                    {c.content.map((p) => (
                      <section className="panel" key={p.id}>
                        <div className="salesBar">
                          <h3>{p.title}</h3>
                          <span>
                            {p.status} · {displayDate(p.postingDate)}
                          </span>
                        </div>
                        <p className="salesPre">{p.text || "Empty draft"}</p>
                        <div className="salesBar">
                          <button onClick={() => contentForm(p)}>
                            Edit draft
                          </button>
                          <button
                            onClick={async () => {
                              try {
                                await navigator.clipboard.writeText(p.text);
                                setNotice("Facebook text copied.");
                              } catch {
                                setSaveError(
                                  "Copy unavailable. Open the draft and select the text to copy manually.",
                                );
                              }
                            }}
                          >
                            Copy text
                          </button>
                        </div>
                      </section>
                    ))}
                  </>
                )}
                {tab === "Results" && (
                  <section className="panel">
                    <h3>
                      {money(c.receivedCents)} received ·{" "}
                      {money(Math.max(0, c.targetCents - c.receivedCents))}{" "}
                      below proposed target
                    </h3>
                    <p>
                      {data.goal.basis}. Tax and shipping treatment follows the
                      annual goal settings. Each row is an existing Money ledger
                      record.
                    </p>
                    <div className="salesBar">
                      <button onClick={receiptForm}>
                        Record payment / refund
                      </button>
                      <button
                        onClick={() =>
                          open({
                            title: "Link existing ledger receipt",
                            action: "linkReceipt",
                            values: { campaignId: c.id, id: "" },
                            fields: [
                              {
                                name: "id",
                                label: "Received artwork payment or refund",
                                required: true,
                                options: data.transactions
                                  .filter(
                                    (t) =>
                                      t.receivedAt &&
                                      !t.isNonArt &&
                                      (!t.campaignId || t.campaignId === c.id),
                                  )
                                  .map((t) => ({
                                    value: t.id,
                                    label: `${t.type} · ${t.source} · ${money(t.amountCents)} · ${t.receivedAt?.slice(0, 10)}`,
                                  })),
                              },
                            ],
                          })
                        }
                      >
                        Link existing receipt
                      </button>
                    </div>
                    {data.transactions
                      .filter((t) => t.campaignId === c.id)
                      .map((t) => (
                        <p key={t.id}>
                          {t.type} · {t.source} · {money(t.amountCents)} total ·{" "}
                          {t.receivedAt
                            ? easternDate(new Date(t.receivedAt))
                            : "Not received"}
                          <small className="salesBlock">
                            Tax {money(t.salesTaxCents)} · shipping{" "}
                            {money(t.shippingCents)} ·{" "}
                            <a
                              href={`/?view=money&month=${t.receivedAt?.slice(0, 7)}`}
                            >
                              Open Money ledger
                            </a>
                          </small>
                        </p>
                      ))}
                  </section>
                )}
              </>
            )}
            {mode === "inventory" && (
              <ArtworkLifecycle
                data={data}
                open={open}
                mutate={mutate}
                editPainting={paintingForm}
                busy={busy}
              />
            )}
            {mode === "calendar" && (
              <>
                <div className="salesBar">
                  <label>
                    Month{" "}
                    <input
                      aria-label="Calendar month"
                      type="month"
                      value={month}
                      onChange={(e) => {
                        if (e.target.value) setMonth(e.target.value);
                      }}
                    />
                  </label>
                  <div className="salesTabs">
                    {["Month", "Agenda"].map((v) => (
                      <button
                        key={v}
                        aria-pressed={calendarView === v}
                        onClick={() => setCalendarView(v)}
                      >
                        {v}
                      </button>
                    ))}
                  </div>
                  <button onClick={() => setMonth(easternDate().slice(0, 7))}>
                    Today
                  </button>
                </div>
                <p>
                  All dates and optional times use Eastern time. Sale windows
                  include both start and end dates.
                </p>
                {late.length > 0 && (
                  <details className="panel salesOverdue">
                    <summary>
                      {late.length} incomplete overdue task
                      {late.length === 1 ? "" : "s"}
                    </summary>
                    {late.map(taskRow)}
                  </details>
                )}
                {calendarView === "Month" ? (
                  <div className="salesCalendarWrap">
                    <div className="salesCalendar">
                      {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map(
                        (d) => (
                          <strong key={d}>{d}</strong>
                        ),
                      )}
                      {days.map((day) => (
                        <div
                          key={day}
                          className={`salesDay ${day.slice(0, 7) !== month ? "salesOther" : ""} ${day === easternDate() ? "salesToday" : ""}`}
                        >
                          <time dateTime={day}>{Number(day.slice(-2))}</time>
                          {data.campaigns
                            .filter(
                              (c) => c.startDate <= day && c.endDate >= day,
                            )
                            .map((c) => (
                              <a
                                key={c.id}
                                className="salesWindow"
                                href={campaignUrl(c.id)}
                              >
                                {day === c.startDate
                                  ? "Starts · "
                                  : day === c.endDate
                                    ? "Ends · "
                                    : "↔ "}
                                {c.title}
                              </a>
                            ))}
                          {allTasks
                            .filter((t) => t.dueDate === day)
                            .map((t) => (
                              <button
                                key={t.id}
                                className={`${overdue(t) ? "salesOverdue" : ""} ${t.completed ? "salesDone" : ""}`}
                                onClick={() => taskForm(t)}
                              >
                                {t.completed ? "✓ " : ""}
                                {t.dueTime ? `${t.dueTime} ` : ""}
                                {t.title}
                              </button>
                            ))}
                          {data.campaigns.flatMap((c) =>
                            c.content
                              .filter((p) => p.postingDate === day)
                              .map((p) => (
                                <a
                                  className="salesPost"
                                  key={p.id}
                                  href={campaignUrl(c.id)}
                                >
                                  FB · {p.title} · {p.status}
                                </a>
                              )),
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <section className="panel">
                    {data.campaigns
                      .filter(
                        (c) =>
                          c.startDate.slice(0, 7) <= month &&
                          c.endDate.slice(0, 7) >= month,
                      )
                      .map((c) => (
                        <p key={c.id}>
                          <a href={campaignUrl(c.id)}>{c.title}</a> · Sale
                          window {displayDate(c.startDate)}–
                          {displayDate(c.endDate)}
                        </p>
                      ))}
                    {allTasks
                      .filter((t) => t.dueDate.startsWith(month))
                      .sort((a, b) =>
                        (a.dueDate + (a.dueTime ?? "00:00")).localeCompare(
                          b.dueDate + (b.dueTime ?? "00:00"),
                        ),
                      )
                      .map((t) => (
                        <div key={t.id}>
                          <small>{t.campaignTitle}</small>
                          {taskRow(t)}
                        </div>
                      ))}
                    {data.campaigns.flatMap((c) =>
                      c.content
                        .filter((p) => p.postingDate.startsWith(month))
                        .map((p) => (
                          <p key={p.id}>
                            <a href={campaignUrl(c.id)}>Facebook: {p.title}</a>{" "}
                            · {p.postingDate} · {p.status}
                          </p>
                        )),
                    )}
                  </section>
                )}
              </>
            )}
          </>
        )}
        {editor && (
          <div className="salesOverlay">
            <form
              className="salesModal"
              onSubmit={submit}
              role="dialog"
              aria-modal="true"
              aria-label={editor.title}
            >
              <h2>{editor.title}</h2>
              <div className="salesForm">
                {editor.fields.map((f) => (
                  <label key={f.name}>
                    <span>{f.label}</span>
                    {f.options ? (
                      <select
                        aria-label={f.label}
                        required={f.required}
                        value={String(editor.values[f.name] ?? "")}
                        onChange={(e) =>
                          setEditor({
                            ...editor,
                            values: {
                              ...editor.values,
                              [f.name]: e.target.value,
                            },
                          })
                        }
                      >
                        <option value="" disabled={f.required}>
                          Choose…
                        </option>
                        {f.options.map((o) => (
                          <option value={o.value} key={o.value}>
                            {o.label}
                          </option>
                        ))}
                      </select>
                    ) : f.type === "textarea" ? (
                      <textarea
                        rows={6}
                        value={String(editor.values[f.name] ?? "")}
                        onChange={(e) =>
                          setEditor({
                            ...editor,
                            values: {
                              ...editor.values,
                              [f.name]: e.target.value,
                            },
                          })
                        }
                      />
                    ) : f.type === "checkbox" ? (
                      <input
                        type="checkbox"
                        checked={editor.values[f.name] === true}
                        onChange={(e) =>
                          setEditor({
                            ...editor,
                            values: {
                              ...editor.values,
                              [f.name]: e.target.checked,
                            },
                          })
                        }
                      />
                    ) : (
                      <input
                        type={f.type ?? "text"}
                        required={f.required}
                        min={f.type === "number" ? 0 : undefined}
                        step={
                          f.name.endsWith("Cents")
                            ? "0.01"
                            : f.type === "number"
                              ? "1"
                              : undefined
                        }
                        value={String(editor.values[f.name] ?? "")}
                        onChange={(e) =>
                          setEditor({
                            ...editor,
                            values: {
                              ...editor.values,
                              [f.name]: e.target.value,
                            },
                          })
                        }
                      />
                    )}
                  </label>
                ))}
              </div>
              {editor.action === "receipt" && (
                <p>
                  Use “Link existing receipt” if this payment is already in
                  Money. A refund reduces income; it does not automatically
                  return artwork to available.
                </p>
              )}
              {saveError && (
                <p role="alert" className="salesOverdue">
                  {saveError}
                </p>
              )}
              <div className="salesBar">
                <button className="primary" type="submit" disabled={busy}>
                  {busy ? "Saving…" : "Save"}
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => setEditor(null)}
                >
                  Cancel
                </button>
                {editor.action === "task" && !!editor.values.id && (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() =>
                      mutate({ action: "deleteTask", id: editor.values.id })
                    }
                  >
                    Delete task
                  </button>
                )}
              </div>
            </form>
          </div>
        )}
      </section>
    </main>
  );
}
