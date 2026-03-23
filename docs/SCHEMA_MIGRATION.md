# Schema Migration: V2 → V3

## Overview

V3 schema (OrgPosition) is a **superset** of V2 (OrgNode). All V2 data can be imported without loss.

## Field Mapping

| V2 OrgNode | V3 OrgPosition | Notes |
|---|---|---|
| `id` | `id` | Unchanged |
| `parentId` | `parentId` | Unchanged |
| `dept` | `dept` | Unchanged |
| `name` | `incumbent.name` | Moved into Person object |
| `title` | `title` | Unchanged |
| — | `deptEn` | New: English department name |
| — | `titleEn` | New: English title |
| — | `incumbent.nameEn` | New: English name |
| — | `incumbent.email` | New |
| — | `incumbent.photoUrl` | New |
| — | `code` | New: department/position code |
| — | `fte` | New: full-time equivalent |
| — | `grade` | New: job grade/level |
| — | `costCenter` | New: cost center |
| — | `isAssistant` | New: staff/assistant flag |
| — | `isSubsidiary` | New: subsidiary company flag |
| — | `status` | New: active/planned/frozen |
| — | `metadata` | New: extensible custom fields |

## Conversion Functions

```typescript
import { nodeToPosition, positionToNode } from "@orgchart/core";

// V2 → V3
const position = nodeToPosition(node);

// V3 → V2 (for backward compatibility)
const node = positionToNode(position);

// Upgrade entire tree
const positions = upgradeTreeToPositions(roots);
```

## Excel Workbook Compatibility

V3 Excel workbooks include additional columns (DeptEn, TitleEn, EmployeeId, Email, etc.) but remain backward-compatible with V2 parsers — unknown columns are silently ignored.

## SAP SuccessFactors Mapping

| SAP Entity | V3 Field |
|---|---|
| FODepartment.externalCode | `code` |
| FODepartment.name | `dept` |
| Position.code | `id` |
| Position.parentPosition | `parentId` |
| Position.title | `title` |
| Position.fte | `fte` |
| EmpJob.userId → PerPersonal | `incumbent.*` |
| EmpJob.matrixManager | Edge (dotted) |
