// Import V2 Workbook Excel into Studio as a new Scenario
// Converts parsed workbook rows into OrgNode tree

import type { OrgNode, OrgEdge } from "@orgchart/core";
import { THEMES } from "@orgchart/core";

interface ParsedRow {
  [key: string]: string | number | boolean;
}

/**
 * Import an Excel file (V2 Workbook format) and return OrgNode tree + edges.
 * Uses xlsx library via dynamic import.
 */
export async function importExcelFile(file: File, themeKey = "blue"): Promise<{
  roots: OrgNode[];
  edges: OrgEdge[];
  name: string;
} | null> {
  const XLSX = await import("xlsx");
  const buffer = await file.arrayBuffer();
  const wb = XLSX.read(buffer, { type: "array" });

  // Find Nodes sheet
  const nodesSheet = wb.SheetNames.find((n) => n.toLowerCase() === "nodes");
  if (!nodesSheet) return null;

  const rows: ParsedRow[] = XLSX.utils.sheet_to_json(wb.Sheets[nodesSheet], { defval: "" });
  const colors = THEMES[themeKey] ?? THEMES.blue;

  // Build node map
  const nodesById = new Map<string, OrgNode>();
  rows.forEach((row, i) => {
    const id = String(row.NodeID ?? row.nodeId ?? "").trim();
    if (!id) return;

    const parentId = String(row.ParentID ?? row.parentId ?? "").trim();
    const level = Number(row.LevelHint ?? row.levelHint ?? 1) || 1;

    const node: OrgNode = {
      id,
      parentId,
      dept: String(row.Dept ?? row.dept ?? ""),
      name: String(row.Name ?? row.name ?? ""),
      title: String(row.Title ?? row.title ?? ""),
      pageGroup: String(row.PageGroup ?? row.pageGroup ?? "ALL"),
      sortOrder: Number(row.SortOrder ?? row.sortOrder ?? i),
      roleType: (String(row.RoleType ?? row.roleType ?? "normal") as OrgNode["roleType"]),
      layoutType: (String(row.LayoutType ?? row.layoutType ?? "standard") as OrgNode["layoutType"]),
      showInOverview: true,
      showInDetail: true,
      bgColor: "#" + (colors[Math.min(level - 1, colors.length - 1)] ?? colors[0]),
      level,
      children: [],
      parent: null,
      searchMatched: false,
      searchHasMatch: false,
    };
    nodesById.set(id, node);
  });

  // Build tree
  nodesById.forEach((node) => {
    if (node.parentId) {
      const parent = nodesById.get(node.parentId);
      if (parent) {
        node.parent = parent;
        parent.children.push(node);
      }
    }
  });

  // Sort children
  nodesById.forEach((node) => {
    node.children.sort((a, b) => a.sortOrder - b.sortOrder);
  });

  const roots = [...nodesById.values()].filter((n) => !n.parent);

  // Parse edges
  const edgesSheet = wb.SheetNames.find((n) => n.toLowerCase() === "edges");
  const edges: OrgEdge[] = [];
  if (edgesSheet) {
    const edgeRows: ParsedRow[] = XLSX.utils.sheet_to_json(wb.Sheets[edgesSheet], { defval: "" });
    edgeRows.forEach((row, i) => {
      const from = String(row.FromNodeID ?? row.fromNodeId ?? "").trim();
      const to = String(row.ToNodeID ?? row.toNodeId ?? "").trim();
      if (from && to) {
        edges.push({
          edgeId: String(row.EdgeID ?? row.edgeId ?? `E_${i}`),
          fromNodeId: from,
          toNodeId: to,
          edgeType: (String(row.EdgeType ?? row.edgeType ?? "dotted")) as OrgEdge["edgeType"],
          pageScope: String(row.PageScope ?? row.pageScope ?? "local"),
          label: String(row.Label ?? row.label ?? ""),
          showInOverview: true,
          showInDetail: true,
        });
      }
    });
  }

  return {
    roots,
    edges,
    name: file.name.replace(/\.xlsx?$/i, ""),
  };
}
