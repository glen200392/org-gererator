import { useCallback, useEffect, useState } from "react";
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
import { PropertyPanel } from "./components/PropertyPanel";
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
import type { LayoutDirection, EdgeType } from "@orgchart/core";
import type { OrgFlowNode } from "@orgchart/react-flow-kit";

const nodeTypes: NodeTypes = {
  orgNode: OrgNode as unknown as NodeTypes["orgNode"],
};

function StudioCanvas() {
  const {
    flowNodes: storeNodes,
    flowEdges: storeEdges,
    layoutDirection,
    lang,
    contextMenu,
    rebuildFlow,
    setLayoutDirection,
    setLang,
    selectNode,
    openContextMenu,
    closeContextMenu,
    reparentNode,
    addChildNode,
    addSiblingNode,
    deleteNode,
    updateNodeField,
    addEdge,
    undo,
    redo,
  } = useOrgStore();

  const [nodes, setNodes, onNodesChange] = useNodesState(storeNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(storeEdges);
  // UI panels state
  const [, setEdgeCreationMode] = useState(false);
  const [showRulesEditor, setShowRulesEditor] = useState(false);
  const [showScenarioPanel, setShowScenarioPanel] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [confirmDialog, setConfirmDialog] = useState<{ message: string; onConfirm: () => void } | null>(null);
  const reactFlowInstance = useReactFlow();

  const { layoutNodes } = useElkLayout({
    direction: layoutDirection,
    horizontalSpacing: 50,
    verticalSpacing: 100,
    nodeWidth: 200,
    nodeHeight: 90,
  });

  // Inject onUpdate callback into node data
  const nodesWithCallbacks = useCallback(
    (rawNodes: OrgFlowNode[]): OrgFlowNode[] =>
      rawNodes.map((n) => ({
        ...n,
        data: { ...n.data, onUpdate: updateNodeField },
      })),
    [updateNodeField],
  );

  // Initial load — restore from localStorage if available
  useEffect(() => {
    const saved = loadState();
    if (saved && Array.isArray(saved.scenarios) && saved.scenarios.length > 0) {
      const state = useOrgStore.getState();
      // Hydrate store with saved scenarios
      useOrgStore.setState({
        scenarios: saved.scenarios as typeof state.scenarios,
        activeScenarioId: saved.activeScenarioId ?? state.activeScenarioId,
        layoutDirection: (saved.layoutDirection as typeof state.layoutDirection) ?? state.layoutDirection,
        lang: (saved.lang as typeof state.lang) ?? state.lang,
      });
    }
    rebuildFlow();
  }, [rebuildFlow]);

  // Auto-save to localStorage on scenario changes
  useEffect(() => {
    const state = useOrgStore.getState();
    saveState({
      scenarios: state.scenarios,
      activeScenarioId: state.activeScenarioId,
      layoutDirection: state.layoutDirection,
      lang: state.lang,
    });
  }, [storeNodes]); // triggers whenever flow rebuilds

  // Sync store → local state + ELK layout
  useEffect(() => {
    if (storeNodes.length === 0) return;
    layoutNodes(storeNodes, storeEdges).then((laid) => {
      setNodes(nodesWithCallbacks(laid));
      setEdges(storeEdges);
    });
  }, [storeNodes, storeEdges, layoutNodes, setNodes, setEdges, nodesWithCallbacks]);

  // Re-layout on direction change
  useEffect(() => {
    if (nodes.length === 0) return;
    layoutNodes(nodes as OrgFlowNode[], edges).then((laid) =>
      setNodes(nodesWithCallbacks(laid)),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layoutDirection]);

  // ── Event handlers ──

  // Click node → select
  const onNodeClick = useCallback((_: React.MouseEvent, node: Node) => {
    selectNode(node.id);
    closeContextMenu();
  }, [selectNode, closeContextMenu]);

  // Click pane → deselect
  const onPaneClick = useCallback(() => {
    selectNode(null);
    closeContextMenu();
  }, [selectNode, closeContextMenu]);

  // Right-click node → context menu
  const onNodeContextMenu = useCallback((event: React.MouseEvent, node: Node) => {
    event.preventDefault();
    openContextMenu(node.id, event.clientX, event.clientY);
  }, [openContextMenu]);

  // Drag stop → detect re-parent target
  const onNodeDragStop = useCallback((_: React.MouseEvent, node: Node) => {
    const intersecting = reactFlowInstance.getIntersectingNodes(node);
    const target = intersecting.find((n) => n.id !== node.id);
    if (!target) return;

    // Check if this is a meaningful move (not to current parent)
    const nodeData = node.data as Record<string, unknown>;
    if (target.id === nodeData?.parentId) return;

    const msg = lang === "tw"
      ? `確定將「${nodeData?.dept ?? node.id}」移到「${(target.data as Record<string, unknown>)?.dept ?? target.id}」下方？`
      : `Move "${nodeData?.dept ?? node.id}" under "${(target.data as Record<string, unknown>)?.dept ?? target.id}"?`;
    const capturedNodeId = node.id;
    const capturedTargetId = target.id;
    setConfirmDialog({ message: msg, onConfirm: () => reparentNode(capturedNodeId, capturedTargetId) });
  }, [reactFlowInstance, reparentNode, lang]);

  // Connect handle → create edge
  // Connect handle → show edge type selector
  const [pendingConnection, setPendingConnection] = useState<{ source: string; target: string } | null>(null);

  const onConnect = useCallback((connection: Connection) => {
    if (!connection.source || !connection.target) return;
    // Store pending connection and show type selector
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
  }, [undo, redo, deleteNode, lang]);

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

        {/* Layout */}
        {(["vertical", "horizontal", "compact"] as LayoutDirection[]).map((dir) => (
          <button
            key={dir}
            onClick={() => setLayoutDirection(dir)}
            style={{
              ...btnStyle,
              background: layoutDirection === dir ? "#1E40AF" : "#1E293B",
            }}
          >
            {dir === "vertical" ? "↕ 垂直" : dir === "horizontal" ? "↔ 水平" : "▣ 緊密"}
          </button>
        ))}
        <span style={{ color: "#334155" }}>|</span>

        {/* Language */}
        <button onClick={() => setLang(lang === "tw" ? "en" : "tw")} style={btnStyle}>
          {lang === "tw" ? "EN" : "繁中"}
        </button>
        <span style={{ color: "#334155" }}>|</span>

        {/* Undo/Redo */}
        <button onClick={undo} style={btnStyle} title="Undo (Ctrl+Z)">↩</button>
        <button onClick={redo} style={btnStyle} title="Redo (Ctrl+Y)">↪</button>
        <span style={{ color: "#334155" }}>|</span>

        {/* AI Layout */}
        <button
          onClick={() => {
            const scenario = useOrgStore.getState().scenarios.find(
              (s) => s.id === useOrgStore.getState().activeScenarioId,
            );
            if (!scenario) return;
            const dims = analyzeTreeDimensions(scenario.roots);
            const suggestion = suggestLayout(dims.nodeCount, dims.maxDepth, dims.maxBreadth);
            setLayoutDirection(suggestion.direction);
            alert(lang === "tw" ? `🤖 ${suggestion.reason}` : `🤖 ${suggestion.reasonEn}`);
          }}
          style={{ ...btnStyle, background: "#065F46", borderColor: "#10B981" }}
          title="AI auto-layout suggestion"
        >
          🤖 {lang === "tw" ? "AI 排版" : "AI Layout"}
        </button>

        {/* Voice Input */}
        {isVoiceSupported && (
          <VoiceButton lang={lang} />
        )}
        <span style={{ color: "#334155" }}>|</span>

        {/* Rules Editor */}
        <button
          onClick={() => setShowRulesEditor((v) => !v)}
          style={btnStyle}
        >
          📐 {lang === "tw" ? "規則" : "Rules"}
        </button>

        {/* Export */}
        <button
          onClick={async () => {
            const el = getFlowViewport();
            if (el) await exportPNG(el);
          }}
          style={btnStyle}
          title="Export PNG"
        >
          🖼️ PNG
        </button>
        <button
          onClick={async () => {
            const el = getFlowViewport();
            if (el) await exportPDF(el);
          }}
          style={btnStyle}
          title="Export PDF"
        >
          📄 PDF
        </button>
        <button
          onClick={async () => {
            const sc = useOrgStore.getState().scenarios.find(s => s.id === useOrgStore.getState().activeScenarioId);
            if (sc) await exportPPTX(sc.roots, sc.edges, sc.name);
          }}
          style={btnStyle}
          title="Export editable PPTX"
        >
          ⬇️ PPTX
        </button>
        <button
          onClick={async () => {
            const sc = useOrgStore.getState().scenarios.find(s => s.id === useOrgStore.getState().activeScenarioId);
            if (sc) await exportExcel(sc.roots, sc.edges);
          }}
          style={btnStyle}
          title="Export V2 Excel Workbook"
        >
          📊 Excel
        </button>
        <button
          onClick={async () => {
            const sc = useOrgStore.getState().scenarios.find(s => s.id === useOrgStore.getState().activeScenarioId);
            if (sc) await exportSAPCSV(sc.roots);
          }}
          style={btnStyle}
          title="Export SAP-compatible CSV"
        >
          📋 SAP CSV
        </button>
        <span style={{ color: "#334155" }}>|</span>

        {/* Scenario Panel Toggle */}
        <button onClick={() => setShowScenarioPanel(v => !v)} style={btnStyle}>
          🗂️ {lang === "tw" ? "方案" : "Scenario"}
        </button>

        {/* Search */}
        <input
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder={lang === "tw" ? "🔍 搜尋..." : "🔍 Search..."}
          style={{
            padding: "4px 8px", borderRadius: 4, border: "1px solid #334155",
            background: "#0F172A", color: "#E2E8F0", fontSize: 12, width: 120,
          }}
        />

        <div style={{ flex: 1 }} />
        <span style={{ color: "#475569", fontSize: 11 }}>
          {nodes.length} nodes
        </span>
      </div>

      {/* React Flow Canvas */}
      <div style={{ flex: 1 }}>
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          nodeTypes={nodeTypes}
          onNodeClick={onNodeClick}
          onNodeContextMenu={onNodeContextMenu}
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
          <MiniMap
            nodeStrokeColor="#64FFDA"
            nodeColor="#0A192F"
            style={{ background: "#1E293B" }}
          />
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
          onCreateEdge={() => setEdgeCreationMode(true)}
        />
      )}

      {/* Property Panel (slides in from right when node selected) */}
      {!showRulesEditor && <PropertyPanel />}

      {/* Rules Editor Panel */}
      {showRulesEditor && (
        <RulesEditor onClose={() => setShowRulesEditor(false)} />
      )}

      {/* Scenario Panel (left side) */}
      {showScenarioPanel && (
        <ScenarioPanel onClose={() => setShowScenarioPanel(false)} />
      )}

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

      {/* Edge Type Selector (shown after connecting two nodes) */}
      {pendingConnection && (
        <EdgeTypeSelector
          x={window.innerWidth / 2 - 100}
          y={window.innerHeight / 2 - 80}
          onSelect={handleEdgeTypeSelect}
          onCancel={() => setPendingConnection(null)}
        />
      )}
    </div>
  );
}

// ── Voice Button Component ──

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
              // Find the just-created node (last in flow) and update its fields
              setTimeout(() => {
                const state = useOrgStore.getState();
                const scenario = state.scenarios.find((s) => s.id === state.activeScenarioId);
                if (!scenario) return;
                // Find the newest node (highest counter)
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
    <>
      <button
        onClick={handleVoice}
        style={{
          ...btnStyleGlobal,
          background: listening ? "#DC2626" : "#1E293B",
          borderColor: listening ? "#F87171" : "#334155",
        }}
        title={lang === "tw" ? "語音輸入（說：部門 姓名 職稱）" : "Voice input (say: Dept Name Title)"}
      >
        🎤 {listening
          ? (transcript || (lang === "tw" ? "聆聽中..." : "Listening..."))
          : (lang === "tw" ? "語音" : "Voice")
        }
      </button>
    </>
  );
}

// Wrap with ReactFlowProvider for useReactFlow hook
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

const btnStyleGlobal = btnStyle;
