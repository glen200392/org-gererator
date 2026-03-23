import { useState, useEffect, useRef, useMemo } from "react";
import type { OrgPosition, OrgEdge, OrgModel } from "@orgchart/core";
import {
  calculateLayout,
  applyRoleLayoutAdjustments,
  renderToCanvas,
  calculateMetrics,
  createVacancyHighlightRule,
  createMissingEmailRule,
  evaluateRules,
  THEMES,
} from "@orgchart/core";
import { mapSFToOrgChart } from "./api/sf-mapper";
import {
  mockDepartments,
  mockPositions,
  mockEmpJobs,
  mockPersons,
} from "./api/sf-mock-data";

// i18n available via createI18n() when needed for full localization

export default function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [roots, setRoots] = useState<OrgPosition[]>([]);
  const [edges, setEdges] = useState<OrgEdge[]>([]);
  const [lang, setLang] = useState<"tw" | "en">("tw");
  const [theme, setTheme] = useState("blue");
  const [syncStatus, setSyncStatus] = useState("idle");
  const [view, setView] = useState<"chart" | "list">("chart");
  const [search, setSearch] = useState("");

  // Load mock data on mount
  useEffect(() => {
    handleSync();
  }, []);

  function handleSync() {
    setSyncStatus("syncing");
    // Simulate API delay
    setTimeout(() => {
      const result = mapSFToOrgChart(mockDepartments, mockPositions, mockEmpJobs, mockPersons, theme);
      setRoots(result.roots);
      setEdges(result.edges);
      setSyncStatus("done");
    }, 500);
  }

  // Render canvas whenever data changes
  useEffect(() => {
    if (!canvasRef.current || roots.length === 0) return;
    const ctx = canvasRef.current.getContext("2d");
    if (!ctx) return;

    // Clone roots for layout (don't mutate state)
    const cloned = JSON.parse(JSON.stringify(roots));
    applyRoleLayoutAdjustments(cloned);
    calculateLayout(cloned, 999);

    const model: OrgModel = {
      roots: cloned,
      issues: [],
      maxLevels: 999,
      canvasTitle: lang === "en" ? "Tymphany Organization Chart" : "Tymphany 企業組織架構圖",
      edges,
    };

    renderToCanvas(ctx, canvasRef.current, model, {
      scale: 1,
      forExport: false,
      canvasTitle: model.canvasTitle,
      collapsedIds: new Set(),
      searchQuery: "",
      searchMatchIds: new Set(),
      searchContextIds: new Set(),
      selectedNodeId: null,
      vacantPrefix: lang === "en" ? "[Vacant]" : "[空缺]",
      crossRefLabel: lang === "en" ? "ref" : "參照",
    });
  }, [roots, edges, lang, theme]);

  // Calculate metrics for root
  const rootMetrics = roots.length > 0 ? calculateMetrics(roots[0]) : null;

  // Conditional formatting rules for data integrity
  const rules = useMemo(() => [createVacancyHighlightRule(), createMissingEmailRule()], []);

  // Flatten tree for list view
  const flatNodes = useMemo(() => {
    const list: OrgPosition[] = [];
    function walk(n: OrgPosition) { list.push(n); (n.children as OrgPosition[]).forEach(walk); }
    roots.forEach(walk);
    return list;
  }, [roots]);

  // Filtered list for search
  const filteredNodes = useMemo(() => {
    if (!search.trim()) return flatNodes;
    const q = search.toLowerCase();
    return flatNodes.filter((n) =>
      n.dept.toLowerCase().includes(q) || n.name.toLowerCase().includes(q) ||
      n.title.toLowerCase().includes(q) || (n.code ?? "").toLowerCase().includes(q),
    );
  }, [flatNodes, search]);

  return (
    <div style={{ fontFamily: '"Microsoft JhengHei", "PingFang TC", sans-serif', background: "#F0F2F5", minHeight: "100vh" }}>
      {/* Header */}
      <div style={{
        display: "flex", alignItems: "center", gap: 12, padding: "10px 20px",
        background: "#0A192F", color: "#E2E8F0", borderBottom: "2px solid #64FFDA",
      }}>
        <strong style={{ fontSize: 16, color: "#64FFDA" }}>OrgChart SAP Edition</strong>
        <span style={{ color: "#475569", fontSize: 12 }}>SuccessFactors Integration</span>
        <div style={{ flex: 1 }} />
        <select
          value={theme}
          onChange={(e) => setTheme(e.target.value)}
          style={{ background: "#1E293B", color: "#E2E8F0", border: "1px solid #334155", borderRadius: 4, padding: "4px 8px", fontSize: 12 }}
        >
          {Object.keys(THEMES).map((k) => (
            <option key={k} value={k}>{k}</option>
          ))}
        </select>
        <button onClick={() => setLang(lang === "tw" ? "en" : "tw")} style={btnStyle}>
          {lang === "tw" ? "EN" : "繁中"}
        </button>
        <button onClick={handleSync} style={{ ...btnStyle, background: "#065F46", borderColor: "#10B981" }}>
          {syncStatus === "syncing" ? "⏳ Syncing..." : "🔄 Sync SF Data"}
        </button>
      </div>

      {/* Dashboard metrics */}
      {rootMetrics && (
        <div style={{ display: "flex", gap: 16, padding: "12px 20px", flexWrap: "wrap" }}>
          {[
            { label: lang === "en" ? "Headcount" : "在職人數", value: rootMetrics.headcount },
            { label: lang === "en" ? "Direct Reports" : "直接下屬", value: rootMetrics.directReports },
            { label: lang === "en" ? "Span of Control" : "管控幅度", value: rootMetrics.spanOfControl },
            { label: lang === "en" ? "Total FTE" : "總 FTE", value: rootMetrics.totalFte },
            { label: lang === "en" ? "Vacancies" : "空缺數", value: rootMetrics.vacancyCount, alert: rootMetrics.vacancyCount > 0 },
            { label: lang === "en" ? "Vacancy Rate" : "空缺率", value: (rootMetrics.vacancyRate * 100).toFixed(1) + "%" },
          ].map((m) => (
            <div key={m.label} style={{
              background: "#FFF", borderRadius: 8, padding: "12px 20px", minWidth: 120,
              border: m.alert ? "2px solid #DC2626" : "1px solid #E2E8F0",
              textAlign: "center",
            }}>
              <div style={{ fontSize: 22, fontWeight: "bold", color: m.alert ? "#DC2626" : "#0A192F" }}>
                {m.value}
              </div>
              <div style={{ fontSize: 11, color: "#64748B" }}>{m.label}</div>
            </div>
          ))}
        </div>
      )}

      {/* View toggle + search */}
      <div style={{ display: "flex", gap: 8, padding: "0 20px 8px", alignItems: "center" }}>
        <button onClick={() => setView("chart")} style={{ ...btnStyle, background: view === "chart" ? "#0F766E" : "#1E293B" }}>
          📊 {lang === "en" ? "Chart" : "圖表"}
        </button>
        <button onClick={() => setView("list")} style={{ ...btnStyle, background: view === "list" ? "#0F766E" : "#1E293B" }}>
          📋 {lang === "en" ? "List" : "列表"}
        </button>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={lang === "en" ? "Search..." : "搜尋..."}
          style={{ padding: "4px 8px", borderRadius: 4, border: "1px solid #CBD5E1", fontSize: 12, flex: 1, maxWidth: 250 }}
        />
        <span style={{ fontSize: 11, color: "#64748B" }}>
          {filteredNodes.length} / {flatNodes.length} {lang === "en" ? "positions" : "職位"}
        </span>
      </div>

      {/* Chart view */}
      {view === "chart" && (
        <div style={{ padding: "0 20px 20px", overflow: "auto" }}>
          <div style={{
            background: "#FFF", borderRadius: 8, border: "1px solid #E2E8F0",
            padding: 16, overflow: "auto", maxHeight: "70vh",
          }}>
            <canvas ref={canvasRef} style={{ display: "block" }} />
          </div>
        </div>
      )}

      {/* List view */}
      {view === "list" && (
        <div style={{ padding: "0 20px 20px" }}>
          <div style={{ background: "#FFF", borderRadius: 8, border: "1px solid #E2E8F0", overflow: "auto", maxHeight: "70vh" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
              <thead>
                <tr style={{ background: "#F8FAFC", borderBottom: "2px solid #E2E8F0" }}>
                  {[
                    lang === "en" ? "Code" : "代碼",
                    lang === "en" ? "Dept" : "部門",
                    lang === "en" ? "Title" : "職稱",
                    lang === "en" ? "Name" : "姓名",
                    lang === "en" ? "Email" : "信箱",
                    lang === "en" ? "Location" : "地點",
                    "FTE",
                    lang === "en" ? "Status" : "狀態",
                  ].map((h) => (
                    <th key={h} style={{ padding: "8px 10px", textAlign: "left", color: "#334155", fontWeight: "bold" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filteredNodes.map((node) => {
                  const action = evaluateRules(node, rules);
                  const rowStyle: React.CSSProperties = action.borderColor
                    ? { borderLeft: `3px solid ${action.borderColor}` }
                    : {};
                  return (
                    <tr key={node.id} style={{ borderBottom: "1px solid #F1F5F9", ...rowStyle }}>
                      <td style={tdStyle}>{node.code || "—"}</td>
                      <td style={tdStyle}>{lang === "en" && node.deptEn ? node.deptEn : node.dept}</td>
                      <td style={tdStyle}>{lang === "en" && node.titleEn ? node.titleEn : node.title}</td>
                      <td style={tdStyle}>
                        {node.incumbent ? (
                          lang === "en" && node.incumbent.nameEn ? node.incumbent.nameEn : node.incumbent.name
                        ) : (
                          <span style={{ color: "#DC2626", fontStyle: "italic" }}>
                            {action.badge ?? (lang === "en" ? "Vacant" : "空缺")}
                          </span>
                        )}
                      </td>
                      <td style={tdStyle}>{node.incumbent?.email || <span style={{ color: "#F59E0B" }}>—</span>}</td>
                      <td style={tdStyle}>{node.incumbent?.location || "—"}</td>
                      <td style={tdStyle}>{node.fte}</td>
                      <td style={tdStyle}>{node.status || "active"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Sync status */}
      <div style={{ padding: "8px 20px", fontSize: 11, color: "#64748B" }}>
        Mode: Mock Data | {mockPositions.length} positions | {mockPersons.length} persons | {edges.length} matrix edges
      </div>
    </div>
  );
}

const btnStyle: React.CSSProperties = {
  padding: "4px 12px", borderRadius: 4, border: "1px solid #334155",
  background: "#1E293B", color: "#E2E8F0", cursor: "pointer", fontSize: 12,
};

const tdStyle: React.CSSProperties = {
  padding: "6px 10px", color: "#1E293B",
};
