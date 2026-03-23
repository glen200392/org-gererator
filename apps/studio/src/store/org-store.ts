// Zustand store for Studio org chart state
// Manages: scenarios, CRUD, undo/redo, selection, layout, language

import { create } from "zustand";
import type { OrgNode, OrgEdge, ConditionalRule, LayoutDirection, EdgeType } from "@orgchart/core";
import { collectDescendantIds } from "@orgchart/core";
import type { OrgFlowNode, OrgFlowEdge } from "@orgchart/react-flow-kit";
import { treeToFlowElements, addCoreEdges } from "@orgchart/react-flow-kit";

export interface Scenario {
  id: string;
  name: string;
  roots: OrgNode[];
  edges: OrgEdge[];
  rules: ConditionalRule[];
}

// ── Helper: find node in tree + build nodesById map ──

function buildNodesById(roots: OrgNode[]): Map<string, OrgNode> {
  const map = new Map<string, OrgNode>();
  function walk(n: OrgNode) { map.set(n.id, n); n.children.forEach(walk); }
  roots.forEach(walk);
  return map;
}

function removeNodeFromParent(node: OrgNode) {
  if (node.parent) {
    node.parent.children = node.parent.children.filter((c) => c.id !== node.id);
  }
}

export function deepCloneTree(roots: OrgNode[]): OrgNode[] {
  function cloneNode(n: OrgNode, parent: OrgNode | null): OrgNode {
    const clone: OrgNode = { ...n, parent, children: [] };
    clone.children = n.children.map((c) => cloneNode(c, clone));
    return clone;
  }
  return roots.map((r) => cloneNode(r, null));
}

// ── State interface ──

interface OrgState {
  scenarios: Scenario[];
  activeScenarioId: string | null;
  flowNodes: OrgFlowNode[];
  flowEdges: OrgFlowEdge[];
  selectedNodeId: string | null;
  layoutDirection: LayoutDirection;
  lang: "tw" | "en";
  history: string[];
  historyIndex: number;

  // Context menu
  contextMenu: { nodeId: string; x: number; y: number } | null;

  // Basic
  setActiveScenario: (id: string) => void;
  addScenario: (scenario: Scenario) => void;
  rebuildFlow: () => void;
  updateFlowNodes: (nodes: OrgFlowNode[]) => void;
  setLayoutDirection: (dir: LayoutDirection) => void;
  setLang: (lang: "tw" | "en") => void;

  // Selection
  selectNode: (id: string | null) => void;

  // Context menu
  openContextMenu: (nodeId: string, x: number, y: number) => void;
  closeContextMenu: () => void;

  // CRUD
  reparentNode: (nodeId: string, newParentId: string) => void;
  addChildNode: (parentId: string) => void;
  addSiblingNode: (siblingId: string) => void;
  deleteNode: (nodeId: string) => void;
  updateNodeField: (nodeId: string, field: string, value: string) => void;
  addEdge: (fromId: string, toId: string, edgeType: EdgeType) => void;
  swapSiblingOrder: (nodeIdA: string, nodeIdB: string) => void;
  setScenarioRules: (rules: ConditionalRule[]) => void;

  // History
  pushHistory: () => void;
  undo: () => void;
  redo: () => void;
}

// ── Helpers to mutate active scenario ──

function getActiveScenario(state: OrgState): Scenario | undefined {
  return state.scenarios.find((s) => s.id === state.activeScenarioId);
}

function mutateActiveScenario(
  set: (fn: (s: OrgState) => Partial<OrgState>) => void,
  get: () => OrgState,
  mutator: (scenario: Scenario) => void,
) {
  const scenario = getActiveScenario(get());
  if (!scenario) return;
  // Deep clone to avoid mutating history snapshots
  const clonedRoots = deepCloneTree(scenario.roots);
  const clonedEdges = [...scenario.edges.map((e) => ({ ...e }))];
  const clonedScenario = { ...scenario, roots: clonedRoots, edges: clonedEdges };
  mutator(clonedScenario);
  set((s) => ({
    scenarios: s.scenarios.map((sc) => (sc.id === s.activeScenarioId ? clonedScenario : sc)),
  }));
  get().pushHistory();
  get().rebuildFlow();
}

// ── Default node factory ──

// Allowlist of editable node fields (module-scope for performance)
const EDITABLE_FIELDS = new Set([
  "dept", "deptEn", "name", "nameEn", "title", "titleEn",
  "roleType", "layoutType", "bgColor", "code", "fte", "grade",
  "costCenter", "status", "email", "phone", "location",
  "startDate", "photoUrl", "pageGroup", "sortOrder",
  "rr", "rrEn",
]);

let nodeCounter = 100;
function createDefaultNode(parentId: string, lang: "tw" | "en"): OrgNode {
  const id = `N_${Date.now()}_${++nodeCounter}`;
  return {
    id,
    parentId,
    dept: lang === "en" ? "New Dept" : "新部門",
    name: "",
    title: lang === "en" ? "Title" : "職稱",
    pageGroup: "OVR",
    sortOrder: 999,
    roleType: "vacant",
    layoutType: "standard",
    showInOverview: true,
    showInDetail: true,
    bgColor: "#2C5282",
    level: 0,
    children: [],
    parent: null,
    searchMatched: false,
    searchHasMatch: false,
  };
}

// ── Sample data ──

function createSampleData(): Scenario {
  const ceo: OrgNode = {
    id: "N001", parentId: "", dept: "總公司", name: "王大明", title: "CEO",
    pageGroup: "OVR", sortOrder: 10, roleType: "normal", layoutType: "standard",
    showInOverview: true, showInDetail: true, bgColor: "#0A192F",
    level: 1, children: [], parent: null, searchMatched: false, searchHasMatch: false,
  };
  const cos: OrgNode = {
    id: "N002", parentId: "N001", dept: "策略辦公室", name: "林小芳", title: "幕僚長",
    pageGroup: "OVR", sortOrder: 20, roleType: "assistant", layoutType: "sidecar",
    showInOverview: true, showInDetail: true, bgColor: "#1A365D",
    level: 2, children: [], parent: ceo, searchMatched: false, searchHasMatch: false,
  };
  const cto: OrgNode = {
    id: "N003", parentId: "N001", dept: "研發中心", name: "陳小華", title: "技術長",
    pageGroup: "RD", sortOrder: 30, roleType: "normal", layoutType: "standard",
    showInOverview: true, showInDetail: true, bgColor: "#2C5282",
    level: 2, children: [], parent: ceo, searchMatched: false, searchHasMatch: false,
  };
  const sw: OrgNode = {
    id: "N004", parentId: "N003", dept: "軟體開發部", name: "李大方", title: "經理",
    pageGroup: "RD", sortOrder: 40, roleType: "normal", layoutType: "standard",
    showInOverview: true, showInDetail: true, bgColor: "#2B6CB0",
    level: 3, children: [], parent: cto, searchMatched: false, searchHasMatch: false,
  };
  const arch: OrgNode = {
    id: "N005", parentId: "N003", dept: "架構部", name: "", title: "首席架構師",
    pageGroup: "RD", sortOrder: 50, roleType: "vacant", layoutType: "standard",
    showInOverview: true, showInDetail: true, bgColor: "#2B6CB0",
    level: 3, children: [], parent: cto, searchMatched: false, searchHasMatch: false,
  };
  const sales: OrgNode = {
    id: "N006", parentId: "N001", dept: "全球業務處", name: "張大帥", title: "營運長",
    pageGroup: "SALES", sortOrder: 60, roleType: "normal", layoutType: "standard",
    showInOverview: true, showInDetail: true, bgColor: "#2C5282",
    level: 2, children: [], parent: ceo, searchMatched: false, searchHasMatch: false,
  };
  const dom: OrgNode = {
    id: "N007", parentId: "N006", dept: "國內業務", name: "孫六", title: "經理",
    pageGroup: "SALES", sortOrder: 70, roleType: "normal", layoutType: "standard",
    showInOverview: true, showInDetail: true, bgColor: "#3182CE",
    level: 3, children: [], parent: sales, searchMatched: false, searchHasMatch: false,
  };
  const ovs: OrgNode = {
    id: "N008", parentId: "N006", dept: "海外業務", name: "鄭九", title: "經理",
    pageGroup: "SALES", sortOrder: 80, roleType: "normal", layoutType: "standard",
    showInOverview: true, showInDetail: true, bgColor: "#3182CE",
    level: 3, children: [], parent: sales, searchMatched: false, searchHasMatch: false,
  };

  ceo.children = [cos, cto, sales];
  cto.children = [sw, arch];
  sales.children = [dom, ovs];

  const edges: OrgEdge[] = [{
    edgeId: "E001", fromNodeId: "N005", toNodeId: "N006",
    edgeType: "dotted", pageScope: "cross-page", label: "技術支援",
    showInOverview: true, showInDetail: true,
  }];

  return { id: "default", name: "當前組織", roots: [ceo], edges, rules: [] };
}

// ── Store ──

export const useOrgStore = create<OrgState>((set, get) => ({
  scenarios: [createSampleData()],
  activeScenarioId: "default",
  flowNodes: [],
  flowEdges: [],
  selectedNodeId: null,
  layoutDirection: "vertical",
  lang: "tw",
  history: [],
  historyIndex: -1,
  contextMenu: null,

  setActiveScenario: (id) => {
    set({ activeScenarioId: id });
    get().rebuildFlow();
  },

  addScenario: (scenario) => {
    set((s) => ({ scenarios: [...s.scenarios, scenario] }));
  },

  rebuildFlow: () => {
    const { scenarios, activeScenarioId, lang } = get();
    const scenario = scenarios.find((s) => s.id === activeScenarioId);
    if (!scenario) return;
    const { nodes, edges } = treeToFlowElements(scenario.roots, scenario.rules, lang);
    const allEdges = addCoreEdges(edges, scenario.edges);
    set({ flowNodes: nodes, flowEdges: allEdges });
  },

  updateFlowNodes: (nodes) => set({ flowNodes: nodes }),

  setLayoutDirection: (dir) => set({ layoutDirection: dir }),

  setLang: (lang) => {
    set({ lang });
    get().rebuildFlow();
  },

  selectNode: (id) => set({ selectedNodeId: id }),

  openContextMenu: (nodeId, x, y) => set({ contextMenu: { nodeId, x, y }, selectedNodeId: nodeId }),

  closeContextMenu: () => set({ contextMenu: null }),

  // ── CRUD Actions ──

  reparentNode: (nodeId, newParentId) => {
    mutateActiveScenario(set, get, (scenario) => {
      const nodesById = buildNodesById(scenario.roots);
      const node = nodesById.get(nodeId);
      const newParent = nodesById.get(newParentId);
      if (!node || !newParent) return;

      // Cycle detection: newParent must not be a descendant of node
      const descendants = collectDescendantIds(nodeId, nodesById);
      if (descendants.has(newParentId)) return;

      // Remove from old parent
      removeNodeFromParent(node);
      if (!node.parent) {
        scenario.roots = scenario.roots.filter((r) => r.id !== nodeId);
      }

      // Attach to new parent
      node.parentId = newParentId;
      node.parent = newParent;
      newParent.children.push(node);
    });
  },

  addChildNode: (parentId) => {
    mutateActiveScenario(set, get, (scenario) => {
      const nodesById = buildNodesById(scenario.roots);
      const parent = nodesById.get(parentId);
      if (!parent) return;

      const newNode = createDefaultNode(parentId, get().lang);
      newNode.parent = parent;
      newNode.bgColor = parent.bgColor;
      parent.children.push(newNode);
    });
  },

  addSiblingNode: (siblingId) => {
    mutateActiveScenario(set, get, (scenario) => {
      const nodesById = buildNodesById(scenario.roots);
      const sibling = nodesById.get(siblingId);
      if (!sibling?.parent) return; // Can't add sibling to root

      const parent = sibling.parent;
      const newNode = createDefaultNode(parent.id, get().lang);
      newNode.parent = parent;
      newNode.bgColor = sibling.bgColor;
      // Insert after sibling
      const idx = parent.children.findIndex((c) => c.id === siblingId);
      parent.children.splice(idx + 1, 0, newNode);
    });
  },

  deleteNode: (nodeId) => {
    mutateActiveScenario(set, get, (scenario) => {
      const nodesById = buildNodesById(scenario.roots);
      const node = nodesById.get(nodeId);
      if (!node) return;

      const removedIds = collectDescendantIds(nodeId, nodesById);

      // Remove from parent
      removeNodeFromParent(node);
      scenario.roots = scenario.roots.filter((r) => !removedIds.has(r.id));

      // Clean up edges referencing removed nodes
      scenario.edges = scenario.edges.filter(
        (e) => !removedIds.has(e.fromNodeId) && !removedIds.has(e.toNodeId),
      );
    });
    set({ selectedNodeId: null });
  },

  updateNodeField: (nodeId, field, value) => {
    if (!EDITABLE_FIELDS.has(field)) return;
    mutateActiveScenario(set, get, (scenario) => {
      const nodesById = buildNodesById(scenario.roots);
      const node = nodesById.get(nodeId);
      if (!node) return;
      (node as unknown as Record<string, unknown>)[field] = value;
    });
  },

  addEdge: (fromId, toId, edgeType) => {
    mutateActiveScenario(set, get, (scenario) => {
      const edgeId = `E_${Date.now()}`;
      scenario.edges.push({
        edgeId,
        fromNodeId: fromId,
        toNodeId: toId,
        edgeType,
        pageScope: "local",
        label: "",
        showInOverview: true,
        showInDetail: true,
      });
    });
  },

  swapSiblingOrder: (nodeIdA, nodeIdB) => {
    mutateActiveScenario(set, get, (scenario) => {
      const nodesById = buildNodesById(scenario.roots);
      const nodeA = nodesById.get(nodeIdA);
      const nodeB = nodesById.get(nodeIdB);
      if (!nodeA || !nodeB) return;
      // Must share the same parent
      if (nodeA.parentId !== nodeB.parentId) return;
      const parent = nodeA.parent;
      if (!parent) return; // both are roots — swap root order
      const idxA = parent.children.findIndex((c) => c.id === nodeIdA);
      const idxB = parent.children.findIndex((c) => c.id === nodeIdB);
      if (idxA < 0 || idxB < 0) return;
      // Swap positions in children array
      [parent.children[idxA], parent.children[idxB]] = [parent.children[idxB], parent.children[idxA]];
      // Update sortOrder to reflect new positions
      parent.children.forEach((c, i) => { c.sortOrder = i * 10; });
    });
  },

  setScenarioRules: (rules) => {
    mutateActiveScenario(set, get, (scenario) => {
      scenario.rules = rules.map((r) => ({
        ...r,
        condition: { ...r.condition, checks: r.condition.checks.map((c) => ({ ...c })) },
        action: { ...r.action },
      }));
    });
  },

  // ── History ──

  pushHistory: () => {
    const { scenarios, activeScenarioId, history, historyIndex } = get();
    const snapshot = JSON.stringify({ scenarios, activeScenarioId });
    const newHistory = history.slice(0, historyIndex + 1);
    newHistory.push(snapshot);
    if (newHistory.length > 50) newHistory.shift();
    set({ history: newHistory, historyIndex: newHistory.length - 1 });
  },

  undo: () => {
    const { history, historyIndex } = get();
    if (historyIndex <= 0) return;
    const newIndex = historyIndex - 1;
    const snapshot = JSON.parse(history[newIndex]);
    // Whitelist restored keys to prevent overwriting store functions (fix C1)
    set((s) => ({
      ...s,
      scenarios: snapshot.scenarios,
      activeScenarioId: snapshot.activeScenarioId,
      historyIndex: newIndex,
    }));
    get().rebuildFlow();
  },

  redo: () => {
    const { history, historyIndex } = get();
    if (historyIndex >= history.length - 1) return;
    const newIndex = historyIndex + 1;
    const snapshot = JSON.parse(history[newIndex]);
    set((s) => ({
      ...s,
      scenarios: snapshot.scenarios,
      activeScenarioId: snapshot.activeScenarioId,
      historyIndex: newIndex,
    }));
    get().rebuildFlow();
  },
}));
