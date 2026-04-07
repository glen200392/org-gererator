// tree-builder.ts — Convert a flat employee list into an OrgNode tree
// Handles: orphans, cycles, duplicate IDs, blank rows

import type { OrgNode } from "./types";
import { THEMES, DEFAULT_THEME, getColorForLevel, type ThemePalette } from "../theme/themes";

/** A single row from a flat employee list (post-header-mapping) */
export interface FlatEmployee {
  id: string;
  name: string;
  title: string;
  dept: string;
  managerId: string;
  /** Optional fields */
  email?: string;
  phone?: string;
  photoUrl?: string;
  location?: string;
  code?: string;
}

export interface BuildWarning {
  type: "orphan" | "cycle" | "duplicate" | "blank" | "self-ref";
  message: string;
  rowIndex?: number;
  employeeId?: string;
}

export interface BuildTreeResult {
  roots: OrgNode[];
  warnings: BuildWarning[];
  totalProcessed: number;
  totalSkipped: number;
}

export interface BuildTreeOptions {
  /** Theme palette for auto-coloring by depth (default: "blue") */
  theme?: string;
  /** Label for the synthetic root node when orphans exist (default: "(未分類)") */
  orphanRootLabel?: string;
}

/**
 * Build an OrgNode tree from a flat employee list.
 *
 * Algorithm:
 * 1. First pass: create OrgNode for each valid row, store in Map<id, node>
 * 2. Second pass: wire parent-child relationships via managerId
 * 3. Detect cycles via DFS visited set
 * 4. Collect orphans (nodes whose managerId doesn't exist in the map)
 * 5. If orphans exist, create a synthetic root and attach them
 */
export function buildTreeFromFlat(
  employees: FlatEmployee[],
  options: BuildTreeOptions = {},
): BuildTreeResult {
  const { theme = DEFAULT_THEME, orphanRootLabel = "(未分類)" } = options;
  const palette: ThemePalette = THEMES[theme] ?? THEMES[DEFAULT_THEME];

  const warnings: BuildWarning[] = [];
  const nodeMap = new Map<string, OrgNode>();
  let totalSkipped = 0;

  // ── Pass 1: Create nodes ──
  for (let i = 0; i < employees.length; i++) {
    const emp = employees[i];

    // Skip blank rows
    if (!emp.id && !emp.name && !emp.dept) {
      totalSkipped++;
      continue;
    }

    // Skip rows without ID
    if (!emp.id) {
      warnings.push({ type: "blank", message: `Row ${i + 2}: missing employee ID, skipped`, rowIndex: i });
      totalSkipped++;
      continue;
    }

    // Skip duplicate IDs (keep first)
    if (nodeMap.has(emp.id)) {
      warnings.push({ type: "duplicate", message: `Row ${i + 2}: duplicate ID "${emp.id}", skipped`, rowIndex: i, employeeId: emp.id });
      totalSkipped++;
      continue;
    }

    // Self-referencing manager
    if (emp.managerId === emp.id) {
      warnings.push({ type: "self-ref", message: `Row ${i + 2}: "${emp.name}" reports to self, treated as root`, rowIndex: i, employeeId: emp.id });
      emp.managerId = "";
    }

    const node: OrgNode = {
      id: emp.id,
      parentId: emp.managerId || "",
      dept: emp.dept || "",
      name: emp.name || "",
      title: emp.title || "",
      pageGroup: "OVR",
      sortOrder: i * 10,
      roleType: emp.name ? "normal" : "vacant",
      layoutType: "standard",
      showInOverview: true,
      showInDetail: true,
      bgColor: "#2C5282", // temporary, will be set by depth
      level: 0,
      children: [],
      parent: null,
      searchMatched: false,
      searchHasMatch: false,
    };

    nodeMap.set(emp.id, node);
  }

  // ── Pass 2: Wire parent-child ──
  const roots: OrgNode[] = [];
  const orphans: OrgNode[] = [];

  for (const node of nodeMap.values()) {
    if (!node.parentId) {
      // No manager → root node
      roots.push(node);
      continue;
    }

    const parent = nodeMap.get(node.parentId);
    if (!parent) {
      // Manager ID not found → orphan
      orphans.push(node);
      continue;
    }

    node.parent = parent;
    parent.children.push(node);
  }

  // ── Pass 3: Detect and break cycles ──
  const visited = new Set<string>();
  const inStack = new Set<string>();

  function detectCycle(node: OrgNode): boolean {
    if (inStack.has(node.id)) return true; // cycle found
    if (visited.has(node.id)) return false;

    visited.add(node.id);
    inStack.add(node.id);

    // Snapshot children to avoid mutating array during iteration (fix W1)
    const toRemove = new Set<string>();
    for (const child of [...node.children]) {
      if (detectCycle(child)) {
        warnings.push({
          type: "cycle",
          message: `Cycle detected: "${child.name || child.id}" → broke link to "${node.name || node.id}"`,
          employeeId: child.id,
        });
        child.parent = null;
        child.parentId = "";
        orphans.push(child);
        toRemove.add(child.id);
      }
    }
    if (toRemove.size > 0) {
      node.children = node.children.filter((c) => !toRemove.has(c.id));
    }

    inStack.delete(node.id);
    return false;
  }

  for (const root of roots) {
    detectCycle(root);
  }

  // ── Pass 4: Handle orphans ──
  if (orphans.length > 0) {
    warnings.push({
      type: "orphan",
      message: `${orphans.length} employee(s) have missing managers, placed under "${orphanRootLabel}"`,
    });

    if (roots.length === 0) {
      // All nodes are orphans — just make them all roots
      for (const orphan of orphans) {
        orphan.parentId = "";
        orphan.parent = null;
        roots.push(orphan);
      }
    } else {
      // Create synthetic root and attach orphans
      const syntheticRoot: OrgNode = {
        id: "__ORPHAN_ROOT__",
        parentId: "",
        dept: orphanRootLabel,
        name: "",
        title: "",
        pageGroup: "OVR",
        sortOrder: 9999,
        roleType: "normal",
        layoutType: "standard",
        showInOverview: true,
        showInDetail: true,
        bgColor: "#718096",
        level: 0,
        children: [],
        parent: null,
        searchMatched: false,
        searchHasMatch: false,
      };

      for (const orphan of orphans) {
        orphan.parentId = syntheticRoot.id;
        orphan.parent = syntheticRoot;
        syntheticRoot.children.push(orphan);
      }

      roots.push(syntheticRoot);
    }
  }

  // ── Pass 5: Assign levels + colors ──
  function assignLevels(node: OrgNode, level: number) {
    node.level = level;
    node.bgColor = `#${getColorForLevel(palette, level)}`;
    for (const child of node.children) {
      assignLevels(child, level + 1);
    }
  }

  for (const root of roots) {
    assignLevels(root, 1);
  }

  // Sort children by sortOrder at each level
  function sortChildren(node: OrgNode) {
    node.children.sort((a, b) => a.sortOrder - b.sortOrder);
    node.children.forEach(sortChildren);
  }
  roots.forEach(sortChildren);

  return {
    roots,
    warnings,
    totalProcessed: nodeMap.size,
    totalSkipped,
  };
}
