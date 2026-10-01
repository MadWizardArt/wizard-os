/** Keep opaque supplier IDs out of PostgreSQL's signed 32-bit integer range. */
export function storedSyncId(id: number): string {
  if (!Number.isSafeInteger(id) || id <= 0) throw new Error("printful_sync_id_invalid");
  return String(id);
}
/** Preserve the MCP numeric contract, within the API parser's safe integer bound. */
export function exposedSyncId(id: string | number | null): number | null {
  if (id === null) return null;
  if (typeof id === "string" && !/^[1-9]\d*$/.test(id)) throw new Error("printful_sync_id_invalid");
  const value = Number(id);
  if (!Number.isSafeInteger(value) || value <= 0) throw new Error("printful_sync_id_invalid");
  return value;
}
