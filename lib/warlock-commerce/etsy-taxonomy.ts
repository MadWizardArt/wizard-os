export type EtsyTaxonomyNode = {
  id: number;
  name: string;
  level: number;
  parent_id: number | null;
  children?: EtsyTaxonomyNode[];
};

export type EtsyTaxonomyCandidate = {
  id: number;
  name: string;
  path: string;
  level: number;
  score: number;
};

function normalize(value: string) {
  return value
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenSet(value: string) {
  return new Set(
    normalize(value)
      .split(" ")
      .map((token) => token.length > 4 && token.endsWith("s") ? token.slice(0, -1) : token)
      .filter((token) => token.length >= 2),
  );
}

export function flattenSellerTaxonomy(
  nodes: EtsyTaxonomyNode[],
  ancestors: string[] = [],
): EtsyTaxonomyCandidate[] {
  const flattened: EtsyTaxonomyCandidate[] = [];
  for (const node of nodes) {
    const pathParts = [...ancestors, node.name];
    flattened.push({
      id: node.id,
      name: node.name,
      path: pathParts.join(" > "),
      level: node.level,
      score: 0,
    });
    if (Array.isArray(node.children) && node.children.length) {
      flattened.push(...flattenSellerTaxonomy(node.children, pathParts));
    }
  }
  return flattened;
}

export function rankSellerTaxonomy(
  nodes: EtsyTaxonomyNode[],
  query: string,
  limit = 12,
): EtsyTaxonomyCandidate[] {
  const normalizedQuery = normalize(query);
  const queryTokens = tokenSet(query);
  if (!normalizedQuery || queryTokens.size === 0) return [];

  return flattenSellerTaxonomy(nodes)
    .map((candidate) => {
      const name = normalize(candidate.name);
      const path = normalize(candidate.path);
      const nameTokens = tokenSet(candidate.name);
      const pathTokens = tokenSet(candidate.path);
      let score = 0;

      if (name === normalizedQuery) score += 120;
      if (name.includes(normalizedQuery)) score += 70;
      if (path.includes(normalizedQuery)) score += 35;

      for (const token of queryTokens) {
        if (nameTokens.has(token)) score += 22;
        else if (name.includes(token)) score += 12;
        if (pathTokens.has(token)) score += 5;
      }

      const matched = [...queryTokens].filter(
        (token) => nameTokens.has(token) || pathTokens.has(token),
      ).length;
      score += Math.round((matched / queryTokens.size) * 20);

      if (candidate.level >= 2) score += 3;
      return { ...candidate, score };
    })
    .filter((candidate) => candidate.score > 0)
    .sort((a, b) => b.score - a.score || b.level - a.level || a.path.localeCompare(b.path))
    .slice(0, Math.max(1, Math.min(limit, 25)));
}
