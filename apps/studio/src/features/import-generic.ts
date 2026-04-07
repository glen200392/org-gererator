// import-generic.ts — Import generic Excel/CSV employee lists into Studio
// Supports: .xlsx, .xls, .csv files with auto header detection

import {
  detectHeaders,
  buildTreeFromFlat,
  type FlatEmployee,
  type FieldMapping,
  type DetectResult,
  type BuildTreeResult,
  type FieldKey,
  type OrgNode,
} from "@orgchart/core";

export interface ParsedFile {
  headers: string[];
  rows: string[][];
  fileName: string;
  detection: DetectResult;
}

export interface ImportResult {
  roots: OrgNode[];
  warnings: string[];
  scenarioName: string;
  totalProcessed: number;
  totalSkipped: number;
}

/**
 * Parse a file (xlsx/csv) and detect headers.
 * Returns raw data + detection result for the preview dialog.
 */
export async function parseFile(file: File): Promise<ParsedFile> {
  const ext = file.name.toLowerCase().split(".").pop();

  let headers: string[];
  let rows: string[][];

  if (ext === "csv" || ext === "tsv") {
    const Papa = await import("papaparse");
    const text = await file.text();
    const result = Papa.default.parse(text, {
      header: false,
      skipEmptyLines: true,
    });
    const allRows = result.data as string[][];
    headers = allRows[0] ?? [];
    rows = allRows.slice(1);
  } else {
    // xlsx / xls
    const XLSX = await import("xlsx");
    const buffer = await file.arrayBuffer();
    const wb = XLSX.read(buffer, { type: "array" });
    const firstSheet = wb.SheetNames[0];
    if (!firstSheet) throw new Error("Empty workbook");
    const data: string[][] = XLSX.utils.sheet_to_json(wb.Sheets[firstSheet], {
      header: 1,
      defval: "",
      raw: false,
    });
    headers = (data[0] ?? []).map(String);
    rows = data.slice(1).map((r) => r.map(String));
  }

  // Filter out completely empty rows
  rows = rows.filter((r) => r.some((cell) => cell.trim() !== ""));

  const detection = detectHeaders(headers);

  return { headers, rows, fileName: file.name, detection };
}

/**
 * Build tree from parsed data using the given field mappings.
 * Called after the user confirms/adjusts the preview.
 */
export function buildImport(
  parsed: ParsedFile,
  mappings: FieldMapping[],
  theme = "blue",
): ImportResult {
  const mappingMap = new Map<FieldKey, number>();
  for (const m of mappings) {
    mappingMap.set(m.fieldKey, m.columnIndex);
  }

  const getCol = (row: string[], field: FieldKey): string => {
    const idx = mappingMap.get(field);
    return idx !== undefined ? (row[idx] ?? "").trim() : "";
  };

  // Convert rows to FlatEmployee[]
  const employees: FlatEmployee[] = parsed.rows.map((row) => ({
    id: getCol(row, "id"),
    name: getCol(row, "name"),
    title: getCol(row, "title"),
    dept: getCol(row, "dept"),
    managerId: getCol(row, "managerId"),
    email: getCol(row, "email") || undefined,
    phone: getCol(row, "phone") || undefined,
    photoUrl: getCol(row, "photoUrl") || undefined,
    location: getCol(row, "location") || undefined,
    code: getCol(row, "code") || undefined,
  }));

  const result: BuildTreeResult = buildTreeFromFlat(employees, { theme });

  return {
    roots: result.roots,
    warnings: result.warnings.map((w) => w.message),
    scenarioName: parsed.fileName.replace(/\.(xlsx?|csv|tsv)$/i, ""),
    totalProcessed: result.totalProcessed,
    totalSkipped: result.totalSkipped,
  };
}

/**
 * Check if a file extension is supported for generic import.
 */
export function isSupportedImportFile(fileName: string): boolean {
  const ext = fileName.toLowerCase().split(".").pop();
  return ["xlsx", "xls", "csv", "tsv"].includes(ext ?? "");
}
