// Scenario management panel — create, clone, switch, compare

import { useState } from "react";
import { useOrgStore, deepCloneTree, type Scenario } from "../store/org-store";
import { diffScenarios, type ScenarioDiffResult } from "../features/scenario/diff";

export function ScenarioPanel({ onClose }: { onClose: () => void }) {
  const { scenarios, activeScenarioId, setActiveScenario, addScenario, lang } = useOrgStore();
  const [newName, setNewName] = useState("");
  const [compareId, setCompareId] = useState<string | null>(null);
  const [diffResult, setDiffResult] = useState<ScenarioDiffResult | null>(null);
  const isEn = lang === "en";

  function handleClone() {
    const active = scenarios.find((s) => s.id === activeScenarioId);
    if (!active) return;
    const name = newName.trim() || `${active.name} (copy)`;
    const clone: Scenario = {
      id: `sc_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      name,
      roots: deepCloneTree(active.roots),
      edges: active.edges.map((e) => ({ ...e })),
      rules: active.rules.map((r) => ({ ...r, condition: { ...r.condition, checks: r.condition.checks.map((c) => ({ ...c })) }, action: { ...r.action } })),
    };
    addScenario(clone);
    setNewName("");
  }

  function handleCompare() {
    if (!compareId || !activeScenarioId) return;
    const a = scenarios.find((s) => s.id === activeScenarioId);
    const b = scenarios.find((s) => s.id === compareId);
    if (!a || !b) return;
    const result = diffScenarios(a.roots, b.roots);
    setDiffResult(result);
  }

  return (
    <div style={{
      position: "fixed", left: 0, top: 0, bottom: 0, width: 300,
      background: "#1E293B", borderRight: "2px solid #64FFDA",
      padding: "12px 14px", overflowY: "auto", zIndex: 50,
      color: "#E2E8F0", fontSize: 12,
    }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
        <strong style={{ color: "#64FFDA", fontSize: 14 }}>
          {isEn ? "Scenarios" : "情境方案"}
        </strong>
        <button onClick={onClose} style={{ background: "none", border: "none", color: "#64748B", cursor: "pointer", fontSize: 16 }}>✕</button>
      </div>

      {/* Scenario list */}
      {scenarios.map((sc) => (
        <div
          key={sc.id}
          onClick={() => setActiveScenario(sc.id)}
          style={{
            padding: "8px 10px", borderRadius: 6, marginBottom: 4, cursor: "pointer",
            background: sc.id === activeScenarioId ? "#0F766E" : "#0F172A",
            border: sc.id === activeScenarioId ? "1px solid #14B8A6" : "1px solid #334155",
          }}
        >
          <div style={{ fontWeight: "bold" }}>{sc.name}</div>
          <div style={{ fontSize: 10, color: "#94A3B8" }}>
            {countNodes(sc.roots)} {isEn ? "nodes" : "個節點"} · {sc.edges.length} {isEn ? "edges" : "關係"}
          </div>
        </div>
      ))}

      {/* Clone */}
      <div style={{ marginTop: 12, display: "flex", gap: 6 }}>
        <input
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder={isEn ? "New scenario name" : "新方案名稱"}
          style={{
            flex: 1, padding: "5px 8px", borderRadius: 4,
            border: "1px solid #334155", background: "#0F172A", color: "#E2E8F0", fontSize: 12,
          }}
        />
        <button onClick={handleClone} style={{
          padding: "5px 10px", borderRadius: 4, border: "1px solid #334155",
          background: "#1E293B", color: "#E2E8F0", cursor: "pointer", fontSize: 12,
        }}>
          📋 {isEn ? "Clone" : "複製"}
        </button>
      </div>

      {/* Compare */}
      {scenarios.length > 1 && (
        <div style={{ marginTop: 16 }}>
          <div style={{ fontSize: 11, color: "#94A3B8", marginBottom: 6 }}>
            {isEn ? "Compare with:" : "比較對象："}
          </div>
          <select
            value={compareId ?? ""}
            onChange={(e) => setCompareId(e.target.value || null)}
            style={{
              width: "100%", padding: "5px 8px", borderRadius: 4, marginBottom: 6,
              border: "1px solid #334155", background: "#0F172A", color: "#E2E8F0", fontSize: 12,
            }}
          >
            <option value="">{isEn ? "Select scenario..." : "選擇方案..."}</option>
            {scenarios.filter((s) => s.id !== activeScenarioId).map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
          {compareId && (
            <button onClick={handleCompare} style={{
              width: "100%", padding: "8px", borderRadius: 4,
              border: "none", background: "#0F766E", color: "#FFF",
              cursor: "pointer", fontSize: 12, fontWeight: "bold",
            }}>
              🔍 {isEn ? "Compare" : "比較差異"}
            </button>
          )}
        </div>
      )}

      {/* Diff results */}
      {diffResult && (
        <div style={{ marginTop: 14, background: "#0F172A", borderRadius: 6, padding: 10 }}>
          <div style={{ fontSize: 13, fontWeight: "bold", marginBottom: 8, color: "#64FFDA" }}>
            {isEn ? "Diff Results" : "差異結果"}
          </div>
          <DiffStat label={isEn ? "Added" : "新增"} count={diffResult.added.length} color="#22C55E" />
          <DiffStat label={isEn ? "Removed" : "刪除"} count={diffResult.removed.length} color="#EF4444" />
          <DiffStat label={isEn ? "Moved" : "移動"} count={diffResult.moved.length} color="#F59E0B" />
          <DiffStat label={isEn ? "Modified" : "修改"} count={diffResult.modified.length} color="#3B82F6" />
          <DiffStat label={isEn ? "Unchanged" : "未變"} count={diffResult.unchanged.length} color="#64748B" />
        </div>
      )}
    </div>
  );
}

function DiffStat({ label, count, color }: { label: string; count: number; color: string }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", padding: "3px 0" }}>
      <span style={{ color }}>{label}</span>
      <span style={{ fontWeight: "bold" }}>{count}</span>
    </div>
  );
}

function countNodes(roots: { children: unknown[] }[]): number {
  let c = 0;
  function walk(n: { children: unknown[] }) { c++; (n.children as { children: unknown[] }[]).forEach(walk); }
  roots.forEach(walk);
  return c;
}
