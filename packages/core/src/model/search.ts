// Search state application — pure function
// Extracted from index.html L2417-2448

import type { OrgNode } from "./types";

export interface SearchResult {
  matchIds: Set<string>;
  /** Ordered array of matched node IDs (tree-walk order) for navigation */
  matchIdList: string[];
  contextIds: Set<string>;
  firstMatchId: string | null;
}

/**
 * Apply search state to a tree, setting searchMatched/searchHasMatch
 * on each node. Returns the set of match IDs and context IDs.
 * Accepts any object with a `roots` array (full OrgModel or partial).
 */
export function applySearchState(
  model: { roots: OrgNode[] },
  query: string,
): SearchResult {
  const matchIds = new Set<string>();
  const contextIds = new Set<string>();
  const trimmed = query.trim().toLowerCase();
  let firstMatchId: string | null = null;

  function walk(node: OrgNode): boolean {
    const childMatch = node.children.map(walk).some(Boolean);
    if (!trimmed) {
      node.searchMatched = false;
      node.searchHasMatch = false;
      return false;
    }
    const haystack = [node.dept, node.name, node.title].join(" ").toLowerCase();
    const selfMatch = haystack.includes(trimmed);
    node.searchMatched = selfMatch;
    node.searchHasMatch = selfMatch || childMatch;
    if (selfMatch) {
      matchIds.add(node.id);
      if (!firstMatchId) firstMatchId = node.id;
      let cur: OrgNode | null = node;
      while (cur) {
        contextIds.add(cur.id);
        cur = cur.parent;
      }
    } else if (childMatch) {
      contextIds.add(node.id);
    }
    return node.searchHasMatch;
  }

  model.roots.forEach(walk);
  // matchIdList preserves tree-walk (depth-first) order for sequential navigation
  const matchIdList = Array.from(matchIds);
  return { matchIds, matchIdList, contextIds, firstMatchId };
}
