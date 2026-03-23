# OrgChart v2.0 Architecture

## Overview

Dual-app monorepo: **SAP Edition** (HRBP/HRIS, Canvas rendering) + **Studio** (CEO/Executives, React Flow).

```
orgchart/
├── packages/core/          # Shared: types, parser, layout, renderer, rules, metrics
├── packages/react-flow-kit/ # React Flow components (Studio only)
├── packages/ui-kit/        # Shared UI components (future)
├── apps/studio/            # Interactive drag-and-drop org restructuring
├── apps/sap-edition/       # SAP SuccessFactors integration + batch export
└── apps/legacy/            # Original single-file app (preserved)
```

## Tech Stack

| Layer | Choice |
|---|---|
| Monorepo | pnpm workspaces + Turborepo |
| Language | TypeScript (strict mode) |
| Framework | React 19 |
| Build | Vite 6 |
| State | Zustand |
| Studio Canvas | @xyflow/react (React Flow v12) |
| Studio Layout | ELK.js (mrtree algorithm) |
| SAP Canvas | Custom Canvas 2D (@orgchart/core) |
| Export | PptxGenJS (shapes), jsPDF, html-to-image, xlsx |
| Testing | Vitest (unit), Playwright (E2E) |
| CI | GitHub Actions (pnpm + Turborepo pipeline) |

## Data Flow

```
SAP Edition:                          Studio:
SF OData API                          Manual input / Excel import / Voice
      ↓                                        ↓
  sf-mapper.ts                         org-store.ts (Zustand)
      ↓                                        ↓
  OrgPosition tree                     OrgPosition tree
      ↓                                        ↓
  @orgchart/core                       @orgchart/react-flow-kit
  Canvas renderer                      React Flow + ELK.js
      ↓                                        ↓
  PPTX / PDF / PNG                     Interactive canvas
                                               ↓
                                       Export: PPTX / PDF / PNG / Excel / SAP CSV
```

## Key Design Decisions

1. **Dual rendering engines**: React Flow for interaction, Canvas for export quality
2. **Position/Person separation**: Supports vacancy management, acting roles
3. **Conditional formatting**: Rules engine in core, UI in both apps
4. **ELK.js lazy loading**: 300KB WASM loaded on-demand via dynamic import
5. **Bilingual (zh-TW/en)**: Suffix pattern for all display fields
6. **PptxGenJS shapes**: Produces editable vector PPTX (not screenshots)
