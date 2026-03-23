// Export org chart as V2 Workbook Excel — can be re-imported into SAP Edition
// Also produces a SAP-compatible CSV for SuccessFactors bulk import

import type { OrgNode, OrgEdge } from "@orgchart/core";

interface ExcelRow {
  [key: string]: string | number | boolean;
}

/**
 * Flatten an OrgNode tree into V2 Workbook rows (Nodes sheet).
 * Compatible with parseWorkbookV2 for round-trip import.
 */
function flattenNodesToRows(roots: OrgNode[]): ExcelRow[] {
  const rows: ExcelRow[] = [];
  function walk(node: OrgNode, level: number) {
    const d = node as unknown as Record<string, unknown>;
    rows.push({
      NodeID: node.id,
      ParentID: node.parentId,
      Dept: node.dept,
      DeptEn: String(d.deptEn ?? ""),
      Name: node.name,
      NameEn: String(d.nameEn ?? ""),
      Title: node.title,
      TitleEn: String(d.titleEn ?? ""),
      PageGroup: node.pageGroup || "ALL",
      SortOrder: node.sortOrder,
      RoleType: node.roleType,
      LayoutType: node.layoutType,
      LevelHint: level,
      Color: node.bgColor.replace("#", ""),
      ShowInOverview: true,
      ShowInDetail: true,
      Code: String(d.code ?? ""),
      FTE: Number(d.fte ?? 1),
      Grade: String(d.grade ?? ""),
      CostCenter: String(d.costCenter ?? ""),
      EmployeeId: String((d.incumbent as Record<string, unknown>)?.employeeId ?? ""),
      Email: String((d.incumbent as Record<string, unknown>)?.email ?? ""),
      Location: String((d.incumbent as Record<string, unknown>)?.location ?? ""),
      StartDate: String((d.incumbent as Record<string, unknown>)?.startDate ?? ""),
    });
    node.children.forEach((c) => walk(c, level + 1));
  }
  roots.forEach((r) => walk(r, 1));
  return rows;
}

/**
 * Convert edges to V2 Edges sheet rows.
 */
function edgesToRows(edges: OrgEdge[]): ExcelRow[] {
  return edges.map((e, i) => ({
    EdgeID: e.edgeId || `EDGE_${i + 1}`,
    FromNodeID: e.fromNodeId,
    ToNodeID: e.toNodeId,
    EdgeType: e.edgeType,
    PageScope: e.pageScope,
    Label: e.label,
  }));
}

/**
 * Export as V2 Workbook Excel (.xlsx).
 * Uses xlsx library (dynamic import).
 */
export async function exportExcel(
  roots: OrgNode[],
  edges: OrgEdge[],
  filename = "OrgChart_Workbook.xlsx",
): Promise<void> {
  const XLSX = await import("xlsx");
  const wb = XLSX.utils.book_new();

  const nodesRows = flattenNodesToRows(roots);
  const edgesRows = edgesToRows(edges);
  const slidesRows = [{ PageGroup: "ALL", SlideTitle: "Organization Chart", RenderMode: "subtree", RootNodeID: roots[0]?.id ?? "", MaxDepth: 999, SlideOrder: 1 }];

  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(nodesRows), "Nodes");
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(edgesRows), "Edges");
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(slidesRows), "Slides");

  XLSX.writeFile(wb, filename);
}

/**
 * Sanitize a CSV cell value to prevent formula injection.
 * Prefixes dangerous characters (=, +, -, @, tab, CR) with a single quote.
 * Note: The ' prefix means SAP re-import may need to strip it.
 * This is intentional — the CSV is for review/comparison, not round-trip.
 */
function sanitizeCSV(value: string): string {
  const s = String(value).replace(/"/g, '""'); // escape internal quotes (fix W10)
  if (/^[=+\-@\t\r]/.test(s)) return `"'${s}"`; // prefix with ' to prevent formula
  return `"${s}"`;
}

/**
 * Export as SAP SuccessFactors compatible CSV.
 * Format: PositionCode, ParentPosition, Department, Title, IncumbentId, IncumbentName
 * This CSV can be used for SF bulk import or comparison.
 */
export async function exportSAPCSV(
  roots: OrgNode[],
  filename = "OrgChart_SAP_Import.csv",
): Promise<void> {
  const rows: string[] = [
    "PositionCode,ParentPosition,Department,DepartmentEN,Title,TitleEN,IncumbentId,IncumbentName,FTE,CostCenter,Location",
  ];

  function walk(node: OrgNode) {
    const d = node as unknown as Record<string, unknown>;
    const inc = d.incumbent as Record<string, unknown> | null;
    rows.push([
      sanitizeCSV(node.id),
      sanitizeCSV(node.parentId),
      sanitizeCSV(String(node.dept)),
      sanitizeCSV(String(d.deptEn ?? "")),
      sanitizeCSV(String(node.title)),
      sanitizeCSV(String(d.titleEn ?? "")),
      sanitizeCSV(String(inc?.employeeId ?? "")),
      sanitizeCSV(String(node.name)),
      d.fte ?? 1,
      sanitizeCSV(String(d.costCenter ?? "")),
      sanitizeCSV(String(inc?.location ?? "")),
    ].join(","));
    node.children.forEach(walk);
  }
  roots.forEach(walk);

  const blob = new Blob(["\uFEFF" + rows.join("\n")], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
