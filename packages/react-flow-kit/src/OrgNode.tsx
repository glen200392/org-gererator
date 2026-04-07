// Custom React Flow node for org chart
// Features: bilingual display, photo, conditional badges, inline editing, hover handles

import React, { memo, useState, useRef, useEffect } from "react";
import { Handle, Position } from "@xyflow/react";
import type { OrgNodeData } from "./types";

// ── Inline editable text field ──

function EditableField({
  value,
  placeholder,
  onSave,
  style,
}: {
  value: string;
  placeholder?: string;
  onSave: (v: string) => void;
  style?: React.CSSProperties;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) inputRef.current?.focus();
  }, [editing]);

  if (!editing) {
    return (
      <span
        onDoubleClick={(e) => { e.stopPropagation(); setDraft(value); setEditing(true); }}
        style={{ cursor: "text", ...style }}
        title="雙擊編輯 / Double-click to edit"
      >
        {value || placeholder || "—"}
      </span>
    );
  }

  return (
    <input
      ref={inputRef}
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => { onSave(draft); setEditing(false); }}
      onKeyDown={(e) => {
        if (e.key === "Enter") { onSave(draft); setEditing(false); }
        if (e.key === "Escape") { setDraft(value); setEditing(false); }
        e.stopPropagation(); // prevent React Flow keyboard shortcuts
      }}
      onClick={(e) => e.stopPropagation()}
      style={{
        width: "100%",
        border: "1px solid #64FFDA",
        borderRadius: 3,
        padding: "1px 4px",
        fontSize: "inherit",
        fontFamily: "inherit",
        fontWeight: "inherit",
        textAlign: "center",
        background: "rgba(255,255,255,0.15)",
        color: "inherit",
        outline: "none",
        ...style,
      }}
    />
  );
}

// ── Pulse animation (injected once into document) ──

let pulseStyleInjected = false;
function ensurePulseStyle() {
  if (pulseStyleInjected) return;
  pulseStyleInjected = true;
  const style = document.createElement("style");
  style.textContent = `
    @keyframes orgnode-search-pulse {
      0% { box-shadow: 0 0 0 0 rgba(100, 255, 218, 0.7); }
      50% { box-shadow: 0 0 12px 4px rgba(100, 255, 218, 0.4); }
      100% { box-shadow: 0 0 0 0 rgba(100, 255, 218, 0); }
    }
  `;
  document.head.appendChild(style);
}

// ── Handle styles (visible on hover via CSS-in-JS) ──

const handleStyle: React.CSSProperties = {
  width: 8,
  height: 8,
  background: "#64FFDA",
  border: "2px solid #0A192F",
  opacity: 0,
  transition: "opacity 0.2s",
};

// ── Main node component ──

function OrgNodeComponent(props: { data: OrgNodeData; id: string }) {
  const { data, id } = props;
  const [hovered, setHovered] = useState(false);
  const lang = data.lang ?? "tw";
  const action = data.ruleAction ?? {};
  const onUpdate = data.onUpdate;
  const isFocusedSearch = data.isFocusedSearch ?? false;
  const isSearchMatched = data.isSearchMatched ?? false;

  // Counter to force CSS animation re-trigger when focus toggles back to same node
  const [pulseKey, setPulseKey] = useState(0);
  useEffect(() => {
    if (isFocusedSearch) setPulseKey((k) => k + 1);
  }, [isFocusedSearch]);

  useEffect(() => { ensurePulseStyle(); }, []);

  // Colors
  const bgColor = action.fillColor ?? data.bgColor ?? "#0A192F";
  const borderColor = action.borderColor ?? "#64FFDA";
  const borderStyle = action.borderStyle === "dashed" ? "dashed"
    : action.borderStyle === "bold" ? "solid" : "solid";
  const borderWidth = action.borderStyle === "bold" ? 3 : 2;

  const hex = bgColor.replace("#", "");
  const r = parseInt(hex.substring(0, 2), 16) || 0;
  const g = parseInt(hex.substring(2, 4), 16) || 0;
  const b = parseInt(hex.substring(4, 6), 16) || 0;
  const isLight = (0.299 * r + 0.587 * g + 0.114 * b) / 255 > 0.55;
  const textColor = action.textColor ?? (isLight ? "#1E293B" : "#E2E8F0");
  const subtextColor = isLight ? "#475569" : "#94A3B8";

  // Extract typed fields (OrgNodeData has index signature, so cast carefully)
  const incumbent = (data.incumbent ?? null) as import("@orgchart/core").OrgPerson | null;
  const deptEn = String((data as Record<string, unknown>).deptEn ?? "");
  const titleEn = String((data as Record<string, unknown>).titleEn ?? "");
  const code = String((data as Record<string, unknown>).code ?? "");

  // Bilingual fields
  const dept = lang === "en" && deptEn ? deptEn : data.dept;
  const title = lang === "en" && titleEn ? titleEn : data.title;

  const isVacant = !incumbent;
  const personName = isVacant
    ? (lang === "en" ? "Vacant" : "空缺")
    : lang === "en" && incumbent?.nameEn
      ? incumbent.nameEn
      : incumbent?.name ?? "";

  // Drag target visual feedback
  const dragTarget = data.dragTargetType;
  const dragBorder = dragTarget === "swap" ? "3px dashed #3B82F6"
    : dragTarget === "reparent" ? "3px solid #22C55E"
    : dragTarget === "invalid" ? "3px solid #EF4444"
    : `${borderWidth}px ${borderStyle} ${borderColor}`;
  const dragShadow = dragTarget === "swap" ? "0 0 12px rgba(59,130,246,0.5)"
    : dragTarget === "reparent" ? "0 0 12px rgba(34,197,94,0.5)"
    : dragTarget === "invalid" ? "0 0 12px rgba(239,68,68,0.5)"
    : "none";

  const nodeStyle: React.CSSProperties = {
    padding: "8px 12px",
    borderRadius: 6,
    border: isFocusedSearch ? "2px solid #64FFDA" : isSearchMatched ? "2px solid #F59E0B" : dragBorder,
    boxShadow: dragShadow,
    background: bgColor,
    color: textColor,
    fontFamily: '"Microsoft JhengHei", "PingFang TC", "Helvetica Neue", sans-serif',
    minWidth: 160,
    maxWidth: 220,
    textAlign: "center",
    fontSize: 12,
    position: "relative",
    cursor: "grab",
    opacity: isVacant ? 0.75 : 1,
    transition: "border 0.15s, box-shadow 0.15s, opacity 0.2s",
    animation: isFocusedSearch ? "orgnode-search-pulse 0.6s ease-out" : undefined,
  };

  const handleSave = (field: string, value: string) => {
    if (onUpdate) onUpdate(id, field, value);
  };

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <Handle
        type="target"
        position={Position.Top}
        style={{ ...handleStyle, opacity: hovered ? 1 : 0 }}
      />

      <div key={isFocusedSearch ? pulseKey : undefined} style={nodeStyle}>
        {/* Drag target label */}
        {dragTarget && dragTarget !== "invalid" && (
          <span style={{
            position: "absolute", top: -20, left: "50%", transform: "translateX(-50%)",
            background: dragTarget === "swap" ? "#3B82F6" : "#22C55E",
            color: "#FFF", fontSize: 10, padding: "1px 8px", borderRadius: 4,
            fontWeight: "bold", whiteSpace: "nowrap",
          }}>
            {dragTarget === "swap" ? "↔ 交換" : "↓ 移入"}
          </span>
        )}
        {dragTarget === "invalid" && (
          <span style={{
            position: "absolute", top: -20, left: "50%", transform: "translateX(-50%)",
            background: "#EF4444", color: "#FFF", fontSize: 10, padding: "1px 8px",
            borderRadius: 4, fontWeight: "bold",
          }}>
            ✕
          </span>
        )}

        {/* Badge */}
        {action.badge && (
          <span style={{
            position: "absolute", top: -8, right: -8,
            background: "#DC2626", color: "#FFF", fontSize: 9,
            padding: "1px 5px", borderRadius: 8, fontWeight: "bold",
          }}>
            {action.badge}
          </span>
        )}

        {/* Icon */}
        {action.icon && (
          <span style={{ position: "absolute", top: -6, left: -6, fontSize: 14 }}>
            {action.icon}
          </span>
        )}

        {/* Photo */}
        {incumbent?.photoUrl && (
          <img
            src={incumbent.photoUrl}
            alt=""
            style={{
              width: 36, height: 36, borderRadius: "50%",
              objectFit: "cover", margin: "0 auto 4px",
              display: "block", border: `1px solid ${borderColor}`,
            }}
          />
        )}

        {/* Department (editable) */}
        <div style={{ fontWeight: "bold", fontSize: 13, lineHeight: 1.3 }}>
          <EditableField
            value={dept}
            onSave={(v) => handleSave(lang === "en" ? "deptEn" : "dept", v)}
          />
        </div>

        {/* Person + Title (fix C4: vacant nodes are now editable) */}
        <div style={{ color: subtextColor, fontSize: 11, marginTop: 2 }}>
          {isVacant ? (
            <>
              <EditableField
                value={data.name || (lang === "en" ? "Vacant" : "空缺")}
                onSave={(v) => handleSave("name", v)}
                style={{ fontStyle: "italic", color: subtextColor }}
              />
              {" ("}
              <EditableField
                value={title}
                onSave={(v) => handleSave(lang === "en" ? "titleEn" : "title", v)}
                style={{ color: subtextColor }}
              />
              {")"}
            </>
          ) : (
            <>
              <EditableField
                value={personName}
                onSave={(v) => handleSave("name", v)}
                style={{ color: subtextColor }}
              />
              {" ("}
              <EditableField
                value={title}
                onSave={(v) => handleSave(lang === "en" ? "titleEn" : "title", v)}
                style={{ color: subtextColor }}
              />
              {")"}
            </>
          )}
        </div>

        {/* Code */}
        {code && (
          <div style={{
            fontSize: 9, color: subtextColor, marginTop: 3,
            background: isLight ? "rgba(0,0,0,0.06)" : "rgba(255,255,255,0.1)",
            padding: "1px 6px", borderRadius: 3, display: "inline-block",
          }}>
            {code}
          </div>
        )}
      </div>

      <Handle
        type="source"
        position={Position.Bottom}
        style={{ ...handleStyle, opacity: hovered ? 1 : 0 }}
      />
    </div>
  );
}

export const OrgNode = memo(OrgNodeComponent);
