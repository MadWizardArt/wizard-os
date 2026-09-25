export type CommerceWriteMode = "disabled" | "draft";

export function commerceWriteMode(): CommerceWriteMode {
  return process.env.WARLOCK_COMMERCE_WRITE_MODE === "draft" ? "draft" : "disabled";
}

export function commerceDraftWritesEnabled() {
  return commerceWriteMode() === "draft";
}

export function assertCommerceDraftWritesEnabled() {
  if (!commerceDraftWritesEnabled()) {
    throw new Error("warlock_commerce_writes_disabled");
  }
}

// Publishing is intentionally not represented as a write mode.
// Warlock v3 may create/update drafts only; activation remains a human approval action.
export function publishingEnabled() {
  return false as const;
}
