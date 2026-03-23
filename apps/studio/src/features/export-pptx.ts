// PPTX export using PptxGenJS shapes — produces editable vector PowerPoint
// Uses @orgchart/core data model, NOT screenshot

import type { OrgNode } from "@orgchart/core";
import {
  calculateLayout,
  applyRoleLayoutAdjustments,
  BASE_CARD_W,
  BASE_CARD_H,
  BASE_GAP_Y,
} from "@orgchart/core";
import { getPptTC } from "@orgchart/core";
import { findNodeById } from "@orgchart/core";

/**
 * Export org chart as editable PPTX using PptxGenJS shapes.
 * Dynamically imports PptxGenJS to keep bundle small.
 */
export async function exportPPTX(
  roots: OrgNode[],
  edges: { fromNodeId: string; toNodeId: string; edgeType: string; label: string }[],
  title: string,
  filename = "OrgChart.pptx",
): Promise<void> {
  const PptxGenJS = (await import("pptxgenjs")).default;
  const pres = new PptxGenJS();
  pres.layout = "LAYOUT_16x9";

  // Clone and layout
  const cloned = JSON.parse(JSON.stringify(roots)) as OrgNode[];
  applyRoleLayoutAdjustments(cloned);
  const li = calculateLayout(cloned, 999);

  const SW = 9.5;
  const SH = 4.5;
  const tH = li.actualDepth * BASE_CARD_H + (li.actualDepth - 1) * BASE_GAP_Y;
  const sc = Math.min(1.0, SW / li.totalWidth, SH / tH);
  const CW = BASE_CARD_W * sc;
  const CH = BASE_CARD_H * sc;
  const offX = (10 - li.totalWidth * sc) / 2;
  const offY = 1.2;

  const slide = pres.addSlide();

  // Title
  slide.addText(title, {
    x: 0.5, y: 0.3, w: "80%", h: 0.8,
    fontSize: 22, bold: true, color: "0A192F",
  });

  // Draw nodes recursively
  function drawNode(node: OrgNode, depth: number) {
    const fx = (node.renderX ?? 0) * sc + offX;
    const fy = (node.renderY ?? 0) * sc + offY;
    const tc = getPptTC(node.bgColor);

    // Children connector lines
    const visCh = depth < 999 ? node.children : [];
    if (visCh.length > 0) {
      const pBY = fy + CH;
      const cTY = (visCh[0].renderY ?? 0) * sc + offY;
      const mY = pBY + (cTY - pBY) / 2;
      const pCX = fx + CW / 2;

      // Vertical line from parent to mid
      slide.addShape(pres.ShapeType.line, {
        x: pCX, y: pBY, w: 0, h: mY - pBY,
        line: { color: "CBD5E1", width: 1.5 },
      });

      // Horizontal line across children
      const fCX = (visCh[0].renderX ?? 0) * sc + offX + CW / 2;
      const lCX = (visCh[visCh.length - 1].renderX ?? 0) * sc + offX + CW / 2;
      if (lCX - fCX > 0) {
        slide.addShape(pres.ShapeType.line, {
          x: fCX, y: mY, w: lCX - fCX, h: 0,
          line: { color: "CBD5E1", width: 1.5 },
        });
      }

      // Vertical lines down to each child
      visCh.forEach((ch) => {
        const chCX = (ch.renderX ?? 0) * sc + offX + CW / 2;
        slide.addShape(pres.ShapeType.line, {
          x: chCX, y: mY, w: 0, h: cTY - mY,
          line: { color: "CBD5E1", width: 1.5 },
        });
        drawNode(ch, depth + 1);
      });
    }

    // Node rectangle
    const lineOpts = node.roleType === "vacant"
      ? { color: tc.border, width: 1.0, dashType: "dash" as const }
      : { color: tc.border, width: 1.0 };

    slide.addShape(pres.ShapeType.rect, {
      x: fx, y: fy, w: CW, h: CH,
      fill: { color: node.bgColor.replace("#", "") },
      line: lineOpts,
    });

    // Node text
    const nameLine = node.roleType === "vacant"
      ? `[Vacant] ${node.title || ""}`
      : `${node.name} (${node.title})`;

    slide.addText([
      { text: node.dept + "\n", options: { fontSize: Math.max(7, 10 * sc), color: tc.dept, bold: true } },
      { text: nameLine, options: { fontSize: Math.max(8, 11 * sc), color: tc.name } },
    ], {
      x: fx, y: fy, w: CW, h: CH,
      align: "center", valign: "middle",
    });
  }

  cloned.forEach((r) => drawNode(r, 1));

  // Draw dotted-line edges
  edges.forEach((edge) => {
    const from = findNodeById(cloned, edge.fromNodeId);
    const to = findNodeById(cloned, edge.toNodeId);
    if (!from || !to) return;

    const p1 = { x: (from.renderX ?? 0) * sc + offX + CW / 2, y: (from.renderY ?? 0) * sc + offY + CH / 2 };
    const p2 = { x: (to.renderX ?? 0) * sc + offX + CW / 2, y: (to.renderY ?? 0) * sc + offY + CH / 2 };

    const color = edge.edgeType === "project" ? "7C3AED"
      : edge.edgeType === "advisory" ? "F59E0B" : "94A3B8";

    slide.addShape(pres.ShapeType.line, {
      x: Math.min(p1.x, p2.x),
      y: Math.min(p1.y, p2.y),
      w: Math.abs(p2.x - p1.x) || 0.01,
      h: Math.abs(p2.y - p1.y) || 0.01,
      line: { color, width: 1.2, dashType: "dash" },
    });
  });

  pres.writeFile({ fileName: filename });
}
