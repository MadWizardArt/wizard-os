"use client";

import { useEffect, useMemo, useState } from "react";
import {
  campaignAdvanceLabels,
  campaignStatusDescriptions,
  campaignStatuses,
  isCampaignStatus,
  nextCampaignStatus,
  type CampaignStatus,
} from "../../lib/campaign-rules";
import styles from "./CampaignLifecycleControls.module.css";

type CampaignSummary = {
  id: string;
  title: string;
  status: string;
  startDate: string;
  endDate: string;
};

function displayDate(day: string) {
  return new Date(`${day}T12:00:00Z`).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "America/New_York",
  });
}

export default function CampaignLifecycleControls() {
  const [campaigns, setCampaigns] = useState<CampaignSummary[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [expanded, setExpanded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    const params = new URLSearchParams(window.location.search);
    const queryId = params.get("campaign") ?? "";
    setExpanded(Boolean(queryId));

    fetch("/api/campaigns", { cache: "no-store" })
      .then(async (response) => {
        const json = await response.json();
        if (!response.ok) throw new Error(json.error || "Campaigns could not be read.");
        if (!active) return;
        const rows = Array.isArray(json.campaigns) ? json.campaigns as CampaignSummary[] : [];
        setCampaigns(rows);
        const preferred = rows.find((campaign) => campaign.id === queryId)?.id
          ?? rows.find((campaign) => campaign.status !== "Closed")?.id
          ?? rows[0]?.id
          ?? "";
        setSelectedId(preferred);
      })
      .catch((reason) => {
        if (active) setError(reason instanceof Error ? reason.message : "Campaign flow could not be loaded.");
      });

    return () => { active = false; };
  }, []);

  const selected = useMemo(
    () => campaigns.find((campaign) => campaign.id === selectedId) ?? null,
    [campaigns, selectedId],
  );
  const status = selected && isCampaignStatus(selected.status) ? selected.status : null;
  const next = status ? nextCampaignStatus(status) : null;
  const draftCount = campaigns.filter((campaign) => campaign.status === "Draft").length;

  async function advance() {
    if (!selected || !status || !next) return;
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/campaigns/lifecycle", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: selected.id, action: "advance" }),
      });
      const json = await response.json();
      if (!response.ok) throw new Error(json.error || "Campaign could not be advanced.");
      setCampaigns((current) => current.map((campaign) =>
        campaign.id === selected.id ? { ...campaign, status: json.status } : campaign,
      ));
      window.setTimeout(() => window.location.reload(), 300);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Campaign could not be advanced.");
      setBusy(false);
    }
  }

  if (!campaigns.length && !error) return null;

  return (
    <aside className={`${styles.dock} ${expanded ? styles.expanded : ""}`} aria-label="Campaign lifecycle controls">
      <button className={styles.toggle} type="button" onClick={() => setExpanded((value) => !value)} aria-expanded={expanded}>
        <span className={styles.sigil}>↗</span>
        <span>
          <strong>Campaign Flow</strong>
          <small>{selected ? `${selected.status} · ${selected.title}` : `${draftCount} draft${draftCount === 1 ? "" : "s"}`}</small>
        </span>
        <span className={styles.chevron}>{expanded ? "×" : "⌃"}</span>
      </button>

      {expanded && <div className={styles.body}>
        {error && <p className={styles.error} role="alert">{error}</p>}
        {campaigns.length > 0 && <>
          <label className={styles.label}>
            Campaign
            <select value={selectedId} onChange={(event) => setSelectedId(event.target.value)}>
              {campaigns.map((campaign) => <option key={campaign.id} value={campaign.id}>{campaign.title}</option>)}
            </select>
          </label>

          {selected && <>
            <div className={styles.meta}>
              <span>{displayDate(selected.startDate)}–{displayDate(selected.endDate)}</span>
              <a href={`/campaigns?campaign=${encodeURIComponent(selected.id)}`}>Open campaign</a>
            </div>

            <div className={styles.track} aria-label={`Campaign status: ${selected.status}`}>
              {campaignStatuses.map((stage, index) => {
                const currentIndex = status ? campaignStatuses.indexOf(status) : -1;
                const state = index < currentIndex ? "done" : index === currentIndex ? "current" : "future";
                return <div className={`${styles.stage} ${styles[state]}`} key={stage}>
                  <span>{index < currentIndex ? "✓" : index + 1}</span>
                  <small>{stage}</small>
                </div>;
              })}
            </div>

            {status ? <>
              <p className={styles.description}>{campaignStatusDescriptions[status]}</p>
              {next ? <button className={styles.advance} type="button" disabled={busy} onClick={advance}>
                {busy ? "Advancing…" : `${campaignAdvanceLabels[status]} →`}
              </button> : <div className={styles.closed}>✓ Campaign closed</div>}
              <p className={styles.help}>Normal progression moves one stage at a time. Use <strong>Edit campaign</strong> inside the campaign only when you need to correct a status.</p>
            </> : <p className={styles.error}>This campaign uses an unsupported status. Open it and use Edit campaign to correct the status before advancing.</p>}
          </>}
        </>}
      </div>}
    </aside>
  );
}
