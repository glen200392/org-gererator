// React Flow type definitions for org chart nodes and edges

import type { Node, Edge } from "@xyflow/react";
import type { OrgPosition, OrgEdge as CoreOrgEdge, RuleAction } from "@orgchart/core";

/** Data payload for an org chart React Flow node */
export type OrgNodeData = {
  /** Pre-computed rule action (conditional formatting result) */
  ruleAction?: RuleAction;
  /** Whether this node is selected in the app */
  isActive?: boolean;
  /** Language for display */
  lang?: "tw" | "en";
  /** Callback when a field is edited inline */
  onUpdate?: (nodeId: string, field: string, value: string) => void;
  /** Drag target visual state */
  dragTargetType?: "swap" | "reparent" | "invalid" | null;
  /** Whether this node is the currently focused search result */
  isFocusedSearch?: boolean;
  /** Whether this node matches the current search query */
  isSearchMatched?: boolean;
  [key: string]: unknown;
} & OrgPosition;

/** React Flow node type for org chart */
export type OrgFlowNode = Node<OrgNodeData, "orgNode">;

/** React Flow edge type for org chart */
export type OrgFlowEdgeData = {
  /** Original core edge data */
  coreEdge?: CoreOrgEdge;
  [key: string]: unknown;
};

export type OrgFlowEdge = Edge<OrgFlowEdgeData>;
