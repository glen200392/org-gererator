// ImportPreviewDialog — Preview + column mapping for generic Excel/CSV import

import { useState, useEffect } from "react";
import type { ParsedFile } from "../features/import-generic";
import {
  type FieldMapping,
  type FieldKey,
  getFieldLabel,
  isRequiredField,
  ALL_FIELD_KEYS,
} from "@orgchart/core";

interface Props {
  parsed: ParsedFile;
  lang: "tw" | "en";
  onImport: (mappings: FieldMapping[]) => void;
  onCancel: () => void;
}

export function ImportPreviewDialog({ parsed, lang, onImport, onCancel }: Props) {
  const { headers, rows, detection, fileName } = parsed;
  const [mappings, setMappings] = useState<FieldMapping[]>(detection.mappings);

  // Escape to close
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") onCancel();
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [onCancel]);

  // Get which columns are already assigned
  const usedColumns = new Set(mappings.map((m) => m.columnIndex));
  const assignedFields = new Set(mappings.map((m) => m.fieldKey));

  // Check if all required fields are mapped
  const missingRequired = ALL_FIELD_KEYS.filter(
    (f) => isRequiredField(f) && !assignedFields.has(f),
  );
  const canImport = missingRequired.length === 0;

  function updateMapping(fieldKey: FieldKey, columnIndex: number | null) {
    setMappings((prev) => {
      const without = prev.filter((m) => m.fieldKey !== fieldKey);
      if (columnIndex === null) return without;
      return [
        ...without,
        { fieldKey, columnIndex, columnHeader: headers[columnIndex], confidence: 1.0 },
      ];
    });
  }

  // Preview rows (first 5)
  const previewRows = rows.slice(0, 5);

  return (
    <div style={overlayStyle}>
      <div style={dialogStyle}>
        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <div>
            <h3 style={{ margin: 0, color: "#E2E8F0", fontSize: 16 }}>
              {lang === "tw" ? "匯入預覽" : "Import Preview"}
            </h3>
            <span style={{ color: "#94A3B8", fontSize: 12 }}>
              {fileName} — {rows.length} {lang === "tw" ? "筆資料" : "rows"}
            </span>
          </div>
          <button onClick={onCancel} style={closeBtnStyle}>✕</button>
        </div>

        {/* Column Mapping */}
        <div style={{ marginBottom: 16 }}>
          <div style={{ color: "#94A3B8", fontSize: 12, marginBottom: 8 }}>
            {lang === "tw" ? "欄位對應（* 為必填）" : "Column Mapping (* required)"}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "6px 12px" }}>
            {ALL_FIELD_KEYS.map((fieldKey) => {
              const current = mappings.find((m) => m.fieldKey === fieldKey);
              const required = isRequiredField(fieldKey);
              const label = getFieldLabel(fieldKey, lang);
              const isMissing = required && !current;

              return (
                <div key={fieldKey} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <span style={{
                    fontSize: 12, color: isMissing ? "#EF4444" : "#CBD5E1",
                    minWidth: 80, textAlign: "right",
                  }}>
                    {required ? "* " : ""}{label}
                  </span>
                  <select
                    value={current?.columnIndex ?? -1}
                    onChange={(e) => {
                      const val = Number(e.target.value);
                      updateMapping(fieldKey, val === -1 ? null : val);
                    }}
                    style={{
                      ...selectStyle,
                      borderColor: isMissing ? "#EF4444" : current ? "#10B981" : "#334155",
                    }}
                  >
                    <option value={-1}>— {lang === "tw" ? "未選擇" : "Not mapped"} —</option>
                    {headers.map((h, i) => (
                      <option
                        key={i}
                        value={i}
                        disabled={usedColumns.has(i) && current?.columnIndex !== i}
                      >
                        {h || `Column ${i + 1}`}
                      </option>
                    ))}
                  </select>
                  {current && current.confidence < 1.0 && (
                    <span style={{ fontSize: 10, color: "#F59E0B" }} title="Low confidence match">⚠</span>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Data Preview Table */}
        <div style={{ marginBottom: 16 }}>
          <div style={{ color: "#94A3B8", fontSize: 12, marginBottom: 6 }}>
            {lang === "tw" ? "資料預覽（前 5 筆）" : "Data Preview (first 5 rows)"}
          </div>
          <div style={{ overflowX: "auto", maxHeight: 200 }}>
            <table style={{ borderCollapse: "collapse", width: "100%", fontSize: 11 }}>
              <thead>
                <tr>
                  {headers.map((h, i) => {
                    const mapping = mappings.find((m) => m.columnIndex === i);
                    return (
                      <th key={i} style={{
                        ...thStyle,
                        background: mapping ? "#1E3A5F" : "#0F172A",
                        color: mapping ? "#64FFDA" : "#64748B",
                      }}>
                        {mapping && (
                          <div style={{ fontSize: 9, color: "#10B981", marginBottom: 2 }}>
                            → {getFieldLabel(mapping.fieldKey, lang)}
                          </div>
                        )}
                        {h || `Col ${i + 1}`}
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {previewRows.map((row, ri) => (
                  <tr key={ri}>
                    {headers.map((_, ci) => (
                      <td key={ci} style={tdStyle}>
                        {row[ci] ?? ""}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Missing required fields warning */}
        {missingRequired.length > 0 && (
          <div style={{
            background: "rgba(239,68,68,0.1)", border: "1px solid #EF4444",
            borderRadius: 6, padding: "8px 12px", marginBottom: 12, fontSize: 12, color: "#FCA5A5",
          }}>
            {lang === "tw" ? "⚠ 缺少必填欄位：" : "⚠ Missing required fields: "}
            {missingRequired.map((f) => getFieldLabel(f, lang)).join(", ")}
          </div>
        )}

        {/* Actions */}
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
          <button onClick={onCancel} style={cancelBtnStyle}>
            {lang === "tw" ? "取消" : "Cancel"}
          </button>
          <button
            onClick={() => onImport(mappings)}
            disabled={!canImport}
            style={{
              ...importBtnStyle,
              opacity: canImport ? 1 : 0.4,
              cursor: canImport ? "pointer" : "not-allowed",
            }}
          >
            {lang === "tw" ? `匯入 ${rows.length} 筆` : `Import ${rows.length} rows`}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Styles ──

const overlayStyle: React.CSSProperties = {
  position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)",
  display: "flex", alignItems: "center", justifyContent: "center",
  zIndex: 2000,
};

const dialogStyle: React.CSSProperties = {
  background: "#1E293B", borderRadius: 12, padding: "20px 24px",
  border: "1px solid #334155", maxWidth: 720, width: "95%",
  maxHeight: "85vh", overflowY: "auto",
  boxShadow: "0 16px 48px rgba(0,0,0,0.5)",
};

const closeBtnStyle: React.CSSProperties = {
  background: "none", border: "none", color: "#94A3B8",
  fontSize: 18, cursor: "pointer", padding: "4px 8px",
};

const selectStyle: React.CSSProperties = {
  flex: 1, padding: "3px 6px", borderRadius: 4,
  border: "1px solid #334155", background: "#0F172A",
  color: "#E2E8F0", fontSize: 11, maxWidth: 180,
};

const thStyle: React.CSSProperties = {
  padding: "6px 8px", textAlign: "left",
  borderBottom: "1px solid #334155", whiteSpace: "nowrap",
};

const tdStyle: React.CSSProperties = {
  padding: "4px 8px", color: "#CBD5E1",
  borderBottom: "1px solid #1E293B", maxWidth: 150,
  overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
};

const cancelBtnStyle: React.CSSProperties = {
  padding: "6px 16px", borderRadius: 6, border: "1px solid #475569",
  background: "#0F172A", color: "#94A3B8", cursor: "pointer", fontSize: 13,
};

const importBtnStyle: React.CSSProperties = {
  padding: "6px 20px", borderRadius: 6, border: "none",
  background: "#0F766E", color: "#FFF", cursor: "pointer",
  fontSize: 13, fontWeight: "bold",
};
