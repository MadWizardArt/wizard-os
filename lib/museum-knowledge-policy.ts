export type KnowledgeRetrievalCandidate = {
  verifiedByArtist: boolean;
  targetMuseIds: readonly string[];
};

export function knowledgeEligibleForMuse(entry: KnowledgeRetrievalCandidate, museId: string) {
  if (!entry.verifiedByArtist) return false;
  return entry.targetMuseIds.length === 0 || entry.targetMuseIds.includes(museId);
}
