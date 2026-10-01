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

/** A separate, explicitly confirmed price-only operation may edit active inventory. */
export function assertCommercePriceWritesEnabled() {
  if (!commerceDraftWritesEnabled()) throw new Error("warlock_commerce_writes_disabled");
}

// Publishing is intentionally not represented as a write mode.
// Draft execution and separately confirmed live prices are distinct; activation remains human.
export function publishingEnabled() {
  return false as const;
}
