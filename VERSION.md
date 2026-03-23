# OrgChart — Version History

## Current: v2.0.0 (this branch)

**Dual-app monorepo architecture**
- Studio (React Flow + ELK.js) — CEO/主管互動拖曳版
- SAP Edition (Canvas) — HRBP/HRIS SuccessFactors 整合版
- 22 core modules, 92 tests, 3-round code review

### How to run
```bash
pnpm install
pnpm --filter @orgchart/studio dev        # → localhost:5174
pnpm --filter @orgchart/sap-edition dev    # → localhost:5173
```

---

## v0.2.0 (legacy, preserved in apps/legacy/)

**Single-file org chart generator** (`index.html`, 3,400 lines)
- Vanilla JS + Canvas 2D
- Excel import (V2 Workbook)
- PNG / PDF / PPTX export
- 8 themes, bilingual (zh-TW/en)

### How to run legacy version
```bash
cd apps/legacy && npx http-server -p 4173
# or checkout tag: git checkout v0.2.0
```

---

## Git Tags

| Tag | Commit | Description |
|---|---|---|
| `v0.2.0` | `8488f40` | Original single-file app |
| `v1.0.0-monorepo` | `be02c41` | Monorepo restructure (core extracted) |
| `v2.0.0` | `ccc0dc7` | Complete Studio + SAP Edition |

### Switch between versions
```bash
git checkout v0.2.0          # legacy single-file
git checkout v1.0.0-monorepo # monorepo with core only
git checkout v2.0.0          # full dual-app (current)
```
