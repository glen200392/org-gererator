import { useCallback, useEffect, useState, useRef } from "react";
import {
  ReactFlow,
  MiniMap,
  Controls,
  Background,
  BackgroundVariant,
  useNodesState,
  useEdgesState,
  useReactFlow,
  ReactFlowProvider,
  type NodeTypes,
  type Node,
  type Connection,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";

import { OrgNode } from "@orgchart/react-flow-kit";
import { useElkLayout } from "@orgchart/react-flow-kit";
import { useOrgStore } from "./store/org-store";
import { ContextMenu } from "./components/ContextMenu";
import { suggestLayout, analyzeTreeDimensions } from "./features/ai-layout";
import { isVoiceSupported, createVoiceSession, parseVoiceTranscript } from "./features/voice-input";
import { RulesEditor } from "./components/RulesEditor";
import { EdgeTypeSelector } from "./components/EdgeTypeSelector";
import { ConfirmDialog } from "./components/ConfirmDialog";
import { ScenarioPanel } from "./components/ScenarioPanel";
import { exportPNG, exportPDF, getFlowViewport } from "./features/export";
import { exportPPTX } from "./features/export-pptx";
import { exportExcel, exportSAPCSV } from "./features/export-excel";
import { saveState, loadState } from "./features/persistence";
import { parseFile, buildImport, isSupportedImportFile, type ParsedFile } from "./features/import-generic";
import { ImportPreviewDialog } from "./components/ImportPreviewDialog";
import type { LayoutDirection, EdgeType, FieldMapping } from "@orgchart/core";
import type { OrgFlowNode } from "@orgchart/react-flow-kit";
import { rebuildParentRefs } from "./store/org-store";

const nodeTypes: NodeTypes = {
  orgNode: OrgNode as unknown as NodeTypes["orgNode"],
};

// ── Drop type detection ──

function detectDropType(
  dragNodeId: string,
  targetNodeId: string,
  flowNodes: OrgFlowNode[],
): "swap" | "reparent" | "invalid" | null {
  if (dragNodeId === targetNodeId) return null;

  const dragData = flowNodes.find((n) => n.id === dragNodeId)?.data as Record<string, unknown> | undefined;
  const targetData = flowNodes.find((n) => n.id === targetNodeId)?.data as Record<string, unknown> | undefined;
  if (!dragData || !targetData) return null;

  // Cycle detection using store's tree (flow nodes no longer have children after W3 fix)
  // Build parent→children map from all flow nodes' parentId field
  const childrenOf = new Map<string, string[]>();
  flowNodes.forEach((n) => {
    const pid = String((n.data as Record<string, unknown>).parentId ?? "");
    if (pid) {
      const list = childrenOf.get(pid) ?? [];
      list.push(n.id);
      childrenOf.set(pid, list);
    }
  });

  const descendants = new Set<string>();
  function collectDesc(id: string) {
    descendants.add(id);
    const kids = childrenOf.get(id);
    if (kids) kids.forEach(collectDesc);
  }
  collectDesc(dragNodeId);
  if (descendants.has(targetNodeId)) return "invalid";

  // Same parent → swap
  if (dragData.parentId === targetData.parentId) return "swap";

  // Different parent → reparent
  return "reparent";
}

function StudioCanvas() {
  const {
    flowNodes: storeNodes,
    flowEdges: storeEdges,
    layoutDirection,
    lang,
    contextMenu,
    searchQuery,
    searchResultIds,
    searchResultIndex,
    focusedSearchNodeId,
    rebuildFlow,
    setLayoutDirection,
    setLang,
    setSearchQuery,
    nextSearchResult,
    prevSearchResult,
    clearSearch,
    selectNode,
    openContextMenu,
    closeContextMenu,
    reparentNode,
    addChildNode,
    addSiblingNode,
    deleteNode,
    updateNodeField,
    addEdge,
    swapSiblingOrder,
    undo,
    redo,
  } = useOrgStore();

  const [nodes, setNodes, onNodesChange] = useNodesState(storeNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(storeEdges);

  // UI state
  const [showRulesEditor, setShowRulesEditor] = useState(false);
  const [showScenarioPanel, setShowScenarioPanel] = useState(false);
  const [confirmDialog, setConfirmDialog] = useState<{ message: string; onConfirm: () => void } | null>(null);
  const [pendingConnection, setPendingConnection] = useState<{ source: string; target: string } | null>(null);
  const [edgeCreationSource, setEdgeCreationSource] = useState<string | null>(null);

  // ── Generic import state ──
  const [importParsed, setImportParsed] = useState<ParsedFile | null>(null);
  const [importDragOver, setImportDragOver] = useState(false);
  const [importToast, setImportToast] = useState<{ message: string; type: "success" | "warning" } | null>(null);

  // ── Smart drag state ──
  const [isDragging, setIsDragging] = useState(false);
  const [dropTarget, setDropTarget] = useState<{ nodeId: string; type: "swap" | "reparent" | "invalid" } | null>(null);
  const dragNodeIdRef = useRef<string | null>(null);

  const reactFlowInstance = useReactFlow();

  // Pan viewport to focused search result
  useEffect(() => {
    if (!focusedSearchNodeId) return;
    const node = nodes.find((n) => n.id === focusedSearchNodeId);
    if (!node?.position) return;
    const x = node.position.x + (node.measured?.width ?? 200) / 2;
    const y = node.position.y + (node.measured?.height ?? 90) / 2;
    reactFlowInstance.setCenter(x, y, { zoom: 1.2, duration: 300 });
  }, [focusedSearchNodeId, nodes, reactFlowInstance]);

  const { layoutNodes } = useElkLayout({
    direction: layoutDirection,
    horizontalSpacing: 50,
    verticalSpacing: 100,
    nodeWidth: 200,
    nodeHeight: 90,
  });

  // Inject callbacks + drag target + search state into node data
  const searchMatchSet = useRef(new Set<string>());
  useEffect(() => {
    searchMatchSet.current = new Set(searchResultIds);
  }, [searchResultIds]);

  const nodesWithState = useCallback(
    (rawNodes: OrgFlowNode[]): OrgFlowNode[] =>
      rawNodes.map((n) => ({
        ...n,
        data: {
          ...n.data,
          onUpdate: updateNodeField,
          dragTargetType: dropTarget?.nodeId === n.id ? dropTarget.type : null,
          isFocusedSearch: n.id === focusedSearchNodeId,
          isSearchMatched: searchMatchSet.current.has(n.id),
        },
      })),
    [updateNodeField, dropTarget, focusedSearchNodeId],
  );

  // ── Initial load ──
  useEffect(() => {
    const saved = loadState();
    if (saved && Array.isArray(saved.scenarios) && saved.scenarios.length > 0) {
      const state = useOrgStore.getState();
      useOrgStore.setState({
        scenarios: saved.scenarios as typeof state.scenarios,
        activeScenarioId: saved.activeScenarioId ?? state.activeScenarioId,
        layoutDirection: (saved.layoutDirection as typeof state.layoutDirection) ?? state.layoutDirection,
        lang: (saved.lang as typeof state.lang) ?? state.lang,
      });
    }
    rebuildFlow();
  }, [rebuildFlow]);

  // Auto-save
  useEffect(() => {
    const state = useOrgStore.getState();
    saveState({
      scenarios: state.scenarios,
      activeScenarioId: state.activeScenarioId,
      layoutDirection: state.layoutDirection,
      lang: state.lang,
    });
  }, [storeNodes]);

  // Sync store → ELK layout (SKIP during drag)
  useEffect(() => {
    if (storeNodes.length === 0 || isDragging) return;
    layoutNodes(storeNodes, storeEdges).then((laid) => {
      setNodes(nodesWithState(laid));
      setEdges(storeEdges);
    });
  }, [storeNodes, storeEdges, layoutNodes, setNodes, setEdges, nodesWithState, isDragging]);

  // Re-layout on direction change
  useEffect(() => {
    if (nodes.length === 0 || isDragging) return;
    layoutNodes(nodes as OrgFlowNode[], edges).then((laid) =>
      setNodes(nodesWithState(laid)),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layoutDirection]);

  // Update drag target visuals when dropTarget changes (during drag)
  useEffect(() => {
    if (!isDragging) return;
    setNodes((prev) =>
      prev.map((n) => ({
        ...n,
        data: {
          ...n.data,
          dragTargetType: dropTarget?.nodeId === n.id ? dropTarget.type : null,
        },
      })),
    );
  }, [dropTarget, isDragging, setNodes]);

  // Update search focus visuals when focused node changes
  useEffect(() => {
    setNodes((prev) =>
      prev.map((n) => ({
        ...n,
        data: {
          ...n.data,
          isFocusedSearch: n.id === focusedSearchNodeId,
          isSearchMatched: searchMatchSet.current.has(n.id),
        },
      })),
    );
  }, [focusedSearchNodeId, searchResultIds, setNodes]);

  // ── Smart Drag Handlers ──

  const onNodeDragStart = useCallback((_: React.MouseEvent, node: Node) => {
    setIsDragging(true);
    dragNodeIdRef.current = node.id;
    setDropTarget(null);
  }, []);

  const onNodeDrag = useCallback((_: React.MouseEvent, node: Node) => {
    const intersecting = reactFlowInstance.getIntersectingNodes(node);
    const target = intersecting.find((n) => n.id !== node.id);

    if (!target || !dragNodeIdRef.current) {
      setDropTarget(null);
      return;
    }

    const type = detectDropType(dragNodeIdRef.current, target.id, nodes as OrgFlowNode[]);
    if (type) {
      setDropTarget({ nodeId: target.id, type });
    } else {
      setDropTarget(null);
    }
  }, [reactFlowInstance, nodes]);

  const onNodeDragStop = useCallback((_: React.MouseEvent, _node: Node) => {
    const dragId = dragNodeIdRef.current;
    const target = dropTarget;

    // Clear drag state
    setIsDragging(false);
    setDropTarget(null);
    dragNodeIdRef.current = null;

    if (!dragId || !target) return; // Dropped on empty space

    if (target.type === "invalid") return; // Invalid target (cycle)

    if (target.type === "swap") {
      swapSiblingOrder(dragId, target.nodeId);
      return;
    }

    if (target.type === "reparent") {
      // Direct reparent — no confirmation needed (Ctrl+Z to undo)
      reparentNode(dragId, target.nodeId);
    }
  }, [dropTarget, swapSiblingOrder, reparentNode]);

  // ── File import handlers ──

  const handleImportFile = useCallback(async (file: File) => {
    if (!isSupportedImportFile(file.name)) return;
    try {
      const parsed = await parseFile(file);
      setImportParsed(parsed);
    } catch (err) {
      setImportToast({ message: `Import error: ${err instanceof Error ? err.message : "Unknown"}`, type: "warning" });
      setTimeout(() => setImportToast(null), 4000);
    }
  }, []);

  const handleImportConfirm = useCallback((mappings: FieldMapping[]) => {
    if (!importParsed) return;
    const result = buildImport(importParsed, mappings);
    rebuildParentRefs(result.roots);

    const scenarioId = `import_${Date.now()}`;
    const { addScenario, setActiveScenario } = useOrgStore.getState();
    addScenario({
      id: scenarioId,
      name: result.scenarioName,
      roots: result.roots,
      edges: [],
      rules: [],
    });
    setActiveScenario(scenarioId);

    setImportParsed(null);

    // Show result toast
    const msg = result.warnings.length > 0
      ? `${lang === "tw" ? "已匯入" : "Imported"} ${result.totalProcessed} ${lang === "tw" ? "筆" : "rows"}. ⚠ ${result.warnings[0]}`
      : `${lang === "tw" ? "已匯入" : "Imported"} ${result.totalProcessed} ${lang === "tw" ? "筆" : "rows"}`;
    setImportToast({ message: msg, type: result.warnings.length > 0 ? "warning" : "success" });
    setTimeout(() => setImportToast(null), 5000);
  }, [importParsed, lang]);

  // File drop on canvas
  const onCanvasDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    if (e.dataTransfer.types.includes("Files")) {
      setImportDragOver(true);
    }
  }, []);

  const onCanvasDragLeave = useCallback(() => {
    setImportDragOver(false);
  }, []);

  const onCanvasDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setImportDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) handleImportFile(file);
  }, [handleImportFile]);

  // ── Click handlers ──

  const onNodeClick = useCallback((_: React.MouseEvent, node: Node) => {
    // Edge creation mode: clicking a node creates the edge
    if (edgeCreationSource) {
      if (edgeCreationSource !== node.id) {
        setPendingConnection({ source: edgeCreationSource, target: node.id });
      }
      setEdgeCreationSource(null);
      return;
    }
    selectNode(node.id);
    closeContextMenu();
  }, [selectNode, closeContextMenu, edgeCreationSource]);

  const onPaneClick = useCallback(() => {
    selectNode(null);
    closeContextMenu();
    setEdgeCreationSource(null);
  }, [selectNode, closeContextMenu]);

  const onNodeContextMenu = useCallback((event: React.MouseEvent, node: Node) => {
    event.preventDefault();
    openContextMenu(node.id, event.clientX, event.clientY);
  }, [openContextMenu]);

  const onConnect = useCallback((connection: Connection) => {
    if (!connection.source || !connection.target) return;
    setPendingConnection({ source: connection.source, target: connection.target });
  }, []);

  const handleEdgeTypeSelect = useCallback((edgeType: EdgeType) => {
    if (pendingConnection) {
      addEdge(pendingConnection.source, pendingConnection.target, edgeType);
    }
    setPendingConnection(null);
  }, [pendingConnection, addEdge]);

  // Keyboard shortcuts
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key === "z" && !e.shiftKey) { e.preventDefault(); undo(); }
      if ((e.ctrlKey || e.metaKey) && (e.key === "y" || (e.key === "z" && e.shiftKey))) { e.preventDefault(); redo(); }
      if (e.key === "Escape") { setEdgeCreationSource(null); setPendingConnection(null); clearSearch(); }
      if (e.key === "Delete" || e.key === "Backspace") {
        const sel = useOrgStore.getState().selectedNodeId;
        if (sel && document.activeElement?.tagName !== "INPUT") {
          e.preventDefault();
          const capturedId = sel;
          setConfirmDialog({
            message: lang === "tw" ? "確定刪除此節點及其子節點？" : "Delete this node and all children?",
            onConfirm: () => deleteNode(capturedId),
          });
        }
      }
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [undo, redo, deleteNode, lang, clearSearch]);

  return (
    <div style={{ width: "100vw", height: "100vh", display: "flex", flexDirection: "column" }}>
      {/* Toolbar */}
      <div style={{
        display: "flex", alignItems: "center", gap: 10, padding: "8px 16px",
        background: "#0A192F", color: "#E2E8F0", fontSize: 13,
        borderBottom: "2px solid #64FFDA", flexWrap: "wrap",
      }}>
        <strong style={{ fontSize: 16, color: "#64FFDA" }}>OrgChart Studio</strong>
        <span style={{ color: "#334155" }}>|</span>

        {(["vertical", "horizontal", "compact"] as LayoutDirection[]).map((dir) => (
          <button
            key={dir}
            onClick={() => setLayoutDirection(dir)}
            style={{ ...btnStyle, background: layoutDirection === dir ? "#1E40AF" : "#1E293B" }}
          >
            {dir === "vertical" ? "↕ 垂直" : dir === "horizontal" ? "↔ 水平" : "▣ 緊密"}
          </button>
        ))}
        <span style={{ color: "#334155" }}>|</span>

        <button onClick={() => setLang(lang === "tw" ? "en" : "tw")} style={btnStyle}>
          {lang === "tw" ? "EN" : "繁中"}
        </button>
        <span style={{ color: "#334155" }}>|</span>

        <button onClick={undo} style={btnStyle} title="Undo (Ctrl+Z)">↩</button>
        <button onClick={redo} style={btnStyle} title="Redo (Ctrl+Y)">↪</button>
        <span style={{ color: "#334155" }}>|</span>

        <button
          onClick={() => {
            const scenario = useOrgStore.getState().scenarios.find(
              (s) => s.id === useOrgStore.getState().activeScenarioId,
            );
            if (!scenario) return;
            const dims = analyzeTreeDimensions(scenario.roots);
            const suggestion = suggestLayout(dims.nodeCount, dims.maxDepth, dims.maxBreadth);
            setLayoutDirection(suggestion.direction);
          }}
          style={{ ...btnStyle, background: "#065F46", borderColor: "#10B981" }}
          title="AI auto-layout"
        >
          🤖 {lang === "tw" ? "AI 排版" : "AI Layout"}
        </button>

        {isVoiceSupported && <VoiceButton lang={lang} />}
        <span style={{ color: "#334155" }}>|</span>

        <button onClick={() => setShowRulesEditor((v) => !v)} style={btnStyle}>
          📐 {lang === "tw" ? "規則" : "Rules"}
        </button>

        <button onClick={async () => { const el = getFlowViewport(); if (el) await exportPNG(el); }} style={btnStyle}>🖼️ PNG</button>
        <button onClick={async () => { const el = getFlowViewport(); if (el) await exportPDF(el); }} style={btnStyle}>📄 PDF</button>
        <button onClick={async () => { const sc = useOrgStore.getState().scenarios.find(s => s.id === useOrgStore.getState().activeScenarioId); if (sc) await exportPPTX(sc.roots, sc.edges, sc.name); }} style={btnStyle}>⬇️ PPTX</button>
        <button onClick={async () => { const sc = useOrgStore.getState().scenarios.find(s => s.id === useOrgStore.getState().activeScenarioId); if (sc) await exportExcel(sc.roots, sc.edges); }} style={btnStyle}>📊 Excel</button>
        <button onClick={async () => { const sc = useOrgStore.getState().scenarios.find(s => s.id === useOrgStore.getState().activeScenarioId); if (sc) await exportSAPCSV(sc.roots); }} style={btnStyle}>📋 SAP</button>
        <span style={{ color: "#334155" }}>|</span>

        <label style={{ ...btnStyle, display: "inline-flex", alignItems: "center", gap: 4 }}>
          📂 {lang === "tw" ? "匯入" : "Import"}
          <input
            type="file"
            accept=".xlsx,.xls,.csv,.tsv"
            style={{ display: "none" }}
            onChange={(e) => { const f = e.target.files?.[0]; if (f) handleImportFile(f); e.target.value = ""; }}
          />
        </label>
        <span style={{ color: "#334155" }}>|</span>

        <button onClick={() => setShowScenarioPanel(v => !v)} style={btnStyle}>
          🗂️ {lang === "tw" ? "方案" : "Scenario"}
        </button>

        <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") { e.preventDefault(); nextSearchResult(); }
              if (e.key === "Escape") { e.preventDefault(); clearSearch(); }
            }}
            placeholder={lang === "tw" ? "🔍 搜尋..." : "🔍 Search..."}
            style={{ padding: "4px 8px", borderRadius: 4, border: "1px solid #334155", background: "#0F172A", color: "#E2E8F0", fontSize: 12, width: 120 }}
          />
          {searchResultIds.length > 0 && (
            <>
              <span style={{ color: "#94A3B8", fontSize: 11, whiteSpace: "nowrap" }}>
                {searchResultIndex + 1}/{searchResultIds.length}
              </span>
              <button onClick={prevSearchResult} style={{ ...btnStyle, padding: "2px 6px", fontSize: 11 }} title={lang === "tw" ? "上一筆" : "Previous"}>◀</button>
              <button onClick={nextSearchResult} style={{ ...btnStyle, padding: "2px 6px", fontSize: 11 }} title={lang === "tw" ? "下一筆" : "Next"}>▶</button>
            </>
          )}
          {searchQuery && searchResultIds.length === 0 && (
            <span style={{ color: "#EF4444", fontSize: 11 }}>{lang === "tw" ? "無結果" : "No match"}</span>
          )}
        </div>

        <div style={{ flex: 1 }} />
        <span style={{ color: "#475569", fontSize: 11 }}>{nodes.length} nodes</span>
      </div>

      {/* Edge creation mode banner */}
      {edgeCreationSource && (
        <div style={{
          background: "#7C3AED", color: "#FFF", padding: "6px 16px", fontSize: 13,
          display: "flex", justifyContent: "space-between", alignItems: "center",
        }}>
          <span>🔗 {lang === "tw" ? "點擊目標節點建立虛線關係（Escape 取消）" : "Click target node to create edge (Escape to cancel)"}</span>
          <button onClick={() => setEdgeCreationSource(null)} style={{ background: "none", border: "none", color: "#FFF", cursor: "pointer", fontSize: 14 }}>✕</button>
        </div>
      )}

      {/* React Flow Canvas (with file drop zone) */}
      <div
        style={{ flex: 1, position: "relative" }}
        onDragOver={onCanvasDragOver}
        onDragLeave={onCanvasDragLeave}
        onDrop={onCanvasDrop}
      >
        {/* Drag overlay */}
        {importDragOver && (
          <div style={{
            position: "absolute", inset: 0, zIndex: 100,
            background: "rgba(15,118,110,0.3)", border: "3px dashed #10B981",
            display: "flex", alignItems: "center", justifyContent: "center",
            pointerEvents: "none",
          }}>
            <span style={{ color: "#FFF", fontSize: 18, fontWeight: "bold", background: "rgba(0,0,0,0.5)", padding: "8px 20px", borderRadius: 8 }}>
              {lang === "tw" ? "放開以匯入 Excel/CSV" : "Drop to import Excel/CSV"}
            </span>
          </div>
        )}
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          nodeTypes={nodeTypes}
          onNodeClick={onNodeClick}
          onNodeContextMenu={onNodeContextMenu}
          onNodeDragStart={onNodeDragStart}
          onNodeDrag={onNodeDrag}
          onNodeDragStop={onNodeDragStop}
          onConnect={onConnect}
          onPaneClick={onPaneClick}
          fitView
          fitViewOptions={{ padding: 0.2 }}
          minZoom={0.1}
          maxZoom={2}
          attributionPosition="bottom-left"
          deleteKeyCode={null}
        >
          <Controls position="bottom-right" />
          <MiniMap nodeStrokeColor="#64FFDA" nodeColor="#0A192F" style={{ background: "#1E293B" }} />
          <Background variant={BackgroundVariant.Dots} gap={20} size={1} color="#334155" />
        </ReactFlow>
      </div>

      {/* Context Menu */}
      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          nodeId={contextMenu.nodeId}
          onClose={closeContextMenu}
          onAddChild={() => addChildNode(contextMenu.nodeId)}
          onAddSibling={() => addSiblingNode(contextMenu.nodeId)}
          onDelete={() => {
            const capturedId = contextMenu.nodeId;
            setConfirmDialog({
              message: lang === "tw" ? "確定刪除此節點及其子節點？" : "Delete this node and all children?",
              onConfirm: () => deleteNode(capturedId),
            });
          }}
          onCreateEdge={() => { setEdgeCreationSource(contextMenu.nodeId); closeContextMenu(); }}
        />
      )}

      {/* Rules Editor (right side) */}
      {showRulesEditor && <RulesEditor onClose={() => setShowRulesEditor(false)} />}

      {/* Scenario Panel (left side) */}
      {showScenarioPanel && <ScenarioPanel onClose={() => setShowScenarioPanel(false)} />}

      {/* Confirm Dialog */}
      {confirmDialog && (
        <ConfirmDialog
          message={confirmDialog.message}
          onConfirm={() => { confirmDialog.onConfirm(); setConfirmDialog(null); }}
          onCancel={() => setConfirmDialog(null)}
          danger
          confirmLabel={lang === "tw" ? "確定" : "Confirm"}
          cancelLabel={lang === "tw" ? "取消" : "Cancel"}
        />
      )}

      {/* Edge Type Selector */}
      {pendingConnection && (
        <EdgeTypeSelector
          x={window.innerWidth / 2 - 100}
          y={window.innerHeight / 2 - 80}
          onSelect={handleEdgeTypeSelect}
          onCancel={() => setPendingConnection(null)}
        />
      )}

      {/* Import Preview Dialog */}
      {importParsed && (
        <ImportPreviewDialog
          parsed={importParsed}
          lang={lang}
          onImport={handleImportConfirm}
          onCancel={() => setImportParsed(null)}
        />
      )}

      {/* Import Toast */}
      {importToast && (
        <div style={{
          position: "fixed", bottom: 20, left: "50%", transform: "translateX(-50%)",
          background: importToast.type === "success" ? "#065F46" : "#92400E",
          color: "#FFF", padding: "8px 20px", borderRadius: 8, fontSize: 13,
          boxShadow: "0 4px 16px rgba(0,0,0,0.3)", zIndex: 3000,
          display: "flex", alignItems: "center", gap: 8,
        }}>
          <span>{importToast.type === "success" ? "✓" : "⚠"}</span>
          <span>{importToast.message}</span>
          <button
            onClick={() => setImportToast(null)}
            style={{ background: "none", border: "none", color: "#FFF", cursor: "pointer", marginLeft: 8 }}
          >✕</button>
        </div>
      )}
    </div>
  );
}

// ── Voice Button ──

function VoiceButton({ lang }: { lang: "tw" | "en" }) {
  const [listening, setListening] = useState(false);
  const [transcript, setTranscript] = useState("");
  const { selectedNodeId, addChildNode, updateNodeField } = useOrgStore();

  const handleVoice = useCallback(() => {
    if (listening) return;
    setListening(true);
    setTranscript("");

    const session = createVoiceSession(lang, {
      onResult: (text, isFinal) => {
        setTranscript(text);
        if (isFinal) {
          const parsed = parseVoiceTranscript(text);
          if (parsed) {
            const parentId = selectedNodeId ?? useOrgStore.getState().flowNodes[0]?.id;
            if (parentId) {
              addChildNode(parentId);
              setTimeout(() => {
                const state = useOrgStore.getState();
                const scenario = state.scenarios.find((s) => s.id === state.activeScenarioId);
                if (!scenario) return;
                const allIds: string[] = [];
                function collect(n: { id: string; children: { id: string }[] }) {
                  allIds.push(n.id);
                  (n.children as { id: string; children: { id: string }[] }[]).forEach(collect);
                }
                scenario.roots.forEach(collect);
                const newId = allIds.filter((id) => id.startsWith("N_")).sort().pop();
                if (newId) {
                  if (parsed.dept) updateNodeField(newId, "dept", parsed.dept);
                  if (parsed.name) updateNodeField(newId, "name", parsed.name);
                  if (parsed.title) updateNodeField(newId, "title", parsed.title);
                  if (parsed.name) updateNodeField(newId, "roleType", "normal");
                }
              }, 100);
            }
          }
          setListening(false);
        }
      },
      onError: () => setListening(false),
      onEnd: () => setListening(false),
    });

    session.start();
  }, [listening, lang, selectedNodeId, addChildNode, updateNodeField]);

  return (
    <button
      onClick={handleVoice}
      style={{ ...btnStyle, background: listening ? "#DC2626" : "#1E293B", borderColor: listening ? "#F87171" : "#334155" }}
      title={lang === "tw" ? "語音輸入（說：部門 姓名 職稱）" : "Voice input (say: Dept Name Title)"}
    >
      🎤 {listening ? (transcript || (lang === "tw" ? "聆聽中..." : "Listening...")) : (lang === "tw" ? "語音" : "Voice")}
    </button>
  );
}

export default function App() {
  return (
    <ReactFlowProvider>
      <StudioCanvas />
    </ReactFlowProvider>
  );
}

const btnStyle: React.CSSProperties = {
  padding: "4px 10px", borderRadius: 4, border: "1px solid #334155",
  background: "#1E293B", color: "#E2E8F0", cursor: "pointer", fontSize: 12,
};
