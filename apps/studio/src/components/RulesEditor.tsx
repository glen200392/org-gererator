// Conditional formatting rules editor panel
// Preset toggles + custom rule builder

import { useState } from "react";
import { useOrgStore } from "../store/org-store";
import type { ConditionalRule, RuleCheck, RuleAction, RuleOperator } from "@orgchart/core";
import {
  createVacancyHighlightRule,
  createMissingEmailRule,
  createHighSpanRule,
} from "@orgchart/core";

const presetRules = [
  { factory: createVacancyHighlightRule, label: "空缺標紅 / Vacancy Red", labelEn: "Highlight Vacancies" },
  { factory: createMissingEmailRule, label: "缺信箱黃框 / Missing Email", labelEn: "Missing Email Warning" },
  { factory: () => createHighSpanRule(8), label: "管控幅度 >8 / High Span", labelEn: "High Span of Control" },
];

const fieldOptions = [
  { value: "incumbent", label: "人員 / Incumbent" },
  { value: "incumbent.email", label: "Email" },
  { value: "incumbent.location", label: "地點 / Location" },
  { value: "dept", label: "部門 / Dept" },
  { value: "title", label: "職稱 / Title" },
  { value: "fte", label: "FTE" },
  { value: "grade", label: "職等 / Grade" },
  { value: "costCenter", label: "成本中心 / Cost Center" },
  { value: "status", label: "狀態 / Status" },
  { value: "roleType", label: "角色 / Role Type" },
];

const operatorOptions: { value: RuleOperator; label: string }[] = [
  { value: "isEmpty", label: "為空 / Is Empty" },
  { value: "isNotEmpty", label: "不為空 / Not Empty" },
  { value: "eq", label: "等於 / Equals" },
  { value: "ne", label: "不等於 / Not Equal" },
  { value: "contains", label: "包含 / Contains" },
  { value: "gt", label: "> 大於" },
  { value: "lt", label: "< 小於" },
];

export function RulesEditor({ onClose }: { onClose: () => void }) {
  const { lang } = useOrgStore();
  const isEn = lang === "en";

  // Preset toggles
  const [activePresets, setActivePresets] = useState<Set<number>>(new Set());
  // Custom rules
  const [customRules, setCustomRules] = useState<ConditionalRule[]>([]);
  // New rule form
  const [newField, setNewField] = useState("incumbent");
  const [newOp, setNewOp] = useState<RuleOperator>("isEmpty");
  const [newValue, setNewValue] = useState("");
  const [newColor, setNewColor] = useState("#DC2626");
  const [newBadge, setNewBadge] = useState("");

  function getAllActiveRules(): ConditionalRule[] {
    const rules: ConditionalRule[] = [];
    activePresets.forEach((idx) => {
      rules.push(presetRules[idx].factory());
    });
    rules.push(...customRules.filter((r) => r.enabled));
    return rules;
  }

  function applyRules() {
    const rules = getAllActiveRules();
    // Use store action to properly clone + record history (fix C2)
    useOrgStore.getState().setScenarioRules(rules);
  }

  function togglePreset(idx: number) {
    const next = new Set(activePresets);
    if (next.has(idx)) next.delete(idx);
    else next.add(idx);
    setActivePresets(next);
  }

  function addCustomRule() {
    const check: RuleCheck = { field: newField, operator: newOp, value: newValue };
    const action: RuleAction = { borderColor: newColor };
    if (newBadge) action.badge = newBadge;

    const rule: ConditionalRule = {
      id: `custom_${Date.now()}`,
      name: `${newField} ${newOp} ${newValue}`,
      condition: { logic: "and", checks: [check] },
      action,
      priority: 50 + customRules.length,
      enabled: true,
    };
    setCustomRules([...customRules, rule]);
  }

  function removeCustomRule(id: string) {
    setCustomRules(customRules.filter((r) => r.id !== id));
  }

  // Auto-apply when presets or custom rules change
  const ruleCount = activePresets.size + customRules.filter((r) => r.enabled).length;

  return (
    <div style={{
      position: "fixed", right: 0, top: 0, bottom: 0, width: 320,
      background: "#1E293B", borderLeft: "2px solid #64FFDA",
      padding: "12px 14px", overflowY: "auto", zIndex: 50,
      fontFamily: '"Microsoft JhengHei", "PingFang TC", sans-serif',
      color: "#E2E8F0", fontSize: 12,
    }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
        <strong style={{ color: "#64FFDA", fontSize: 14 }}>
          📐 {isEn ? "Conditional Rules" : "條件格式規則"}
        </strong>
        <button onClick={onClose} style={{ background: "none", border: "none", color: "#64748B", cursor: "pointer", fontSize: 16 }}>✕</button>
      </div>

      {/* Preset Rules */}
      <div style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 11, color: "#94A3B8", marginBottom: 6 }}>
          {isEn ? "Preset Rules" : "預設規則"}
        </div>
        {presetRules.map((preset, idx) => (
          <label key={idx} style={{
            display: "flex", alignItems: "center", gap: 8, padding: "6px 0",
            cursor: "pointer",
          }}>
            <input
              type="checkbox"
              checked={activePresets.has(idx)}
              onChange={() => togglePreset(idx)}
              style={{ accentColor: "#64FFDA" }}
            />
            <span>{isEn ? preset.labelEn : preset.label}</span>
          </label>
        ))}
      </div>

      {/* Custom Rules */}
      <div style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 11, color: "#94A3B8", marginBottom: 6 }}>
          {isEn ? "Custom Rules" : "自訂規則"} ({customRules.length})
        </div>
        {customRules.map((rule) => (
          <div key={rule.id} style={{
            display: "flex", justifyContent: "space-between", alignItems: "center",
            padding: "4px 8px", background: "#0F172A", borderRadius: 4, marginBottom: 4,
          }}>
            <span style={{ fontSize: 11 }}>{rule.name}</span>
            <button
              onClick={() => removeCustomRule(rule.id)}
              style={{ background: "none", border: "none", color: "#F87171", cursor: "pointer", fontSize: 12 }}
            >✕</button>
          </div>
        ))}
      </div>

      {/* New Rule Builder */}
      <div style={{ background: "#0F172A", borderRadius: 6, padding: 10, marginBottom: 14 }}>
        <div style={{ fontSize: 11, color: "#94A3B8", marginBottom: 6 }}>
          {isEn ? "Add Rule" : "新增規則"}
        </div>
        <select value={newField} onChange={(e) => setNewField(e.target.value)} style={selectStyle}>
          {fieldOptions.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
        </select>
        <select value={newOp} onChange={(e) => setNewOp(e.target.value as RuleOperator)} style={selectStyle}>
          {operatorOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        {!["isEmpty", "isNotEmpty"].includes(newOp) && (
          <input
            value={newValue}
            onChange={(e) => setNewValue(e.target.value)}
            placeholder={isEn ? "Value" : "比較值"}
            style={{ ...selectStyle, width: "100%" }}
          />
        )}
        <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
          <input
            type="color"
            value={newColor}
            onChange={(e) => setNewColor(e.target.value)}
            style={{ width: 32, height: 28, border: "none", cursor: "pointer" }}
          />
          <input
            value={newBadge}
            onChange={(e) => setNewBadge(e.target.value)}
            placeholder={isEn ? "Badge text" : "徽章文字"}
            style={{ ...selectStyle, flex: 1 }}
          />
        </div>
        <button
          onClick={addCustomRule}
          style={{
            marginTop: 8, width: "100%", padding: "6px", borderRadius: 4,
            border: "1px solid #334155", background: "#1E293B", color: "#E2E8F0",
            cursor: "pointer", fontSize: 12,
          }}
        >
          ＋ {isEn ? "Add" : "新增"}
        </button>
      </div>

      {/* Apply button */}
      <button
        onClick={applyRules}
        style={{
          width: "100%", padding: "10px", borderRadius: 6,
          border: "none", background: "#0F766E", color: "#FFF",
          cursor: "pointer", fontSize: 13, fontWeight: "bold",
        }}
      >
        {isEn ? `Apply ${ruleCount} Rules` : `套用 ${ruleCount} 條規則`}
      </button>
    </div>
  );
}

const selectStyle: React.CSSProperties = {
  width: "100%", padding: "5px 8px", borderRadius: 4, marginBottom: 6,
  border: "1px solid #334155", background: "#1E293B", color: "#E2E8F0", fontSize: 12,
};
