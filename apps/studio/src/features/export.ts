// Export functions for Studio — PNG, PDF, PPTX
// PNG/PDF: html-to-image capture of React Flow canvas
// PPTX: core data → core Canvas renderer → PptxGenJS shapes (vector, editable)

/**
 * Export the React Flow canvas as a high-resolution PNG.
 * Uses html-to-image library (to be installed as needed).
 */
export async function exportPNG(
  flowElement: HTMLElement,
  filename = "OrgChart.png",
): Promise<void> {
  // Dynamic import to keep bundle small
  const { toPng } = await import("html-to-image");

  const dataUrl = await toPng(flowElement, {
    backgroundColor: "#FFFFFF",
    pixelRatio: 3, // High DPI
    filter: (node: Element) => {
      // Exclude React Flow controls and minimap from export
      const classes = (node as HTMLElement).className ?? "";
      if (typeof classes === "string") {
        if (classes.includes("react-flow__controls")) return false;
        if (classes.includes("react-flow__minimap")) return false;
        if (classes.includes("react-flow__attribution")) return false;
      }
      return true;
    },
  });

  const link = document.createElement("a");
  link.download = filename;
  link.href = dataUrl;
  link.click();
}

/**
 * Export as PDF using html-to-image → jsPDF.
 */
export async function exportPDF(
  flowElement: HTMLElement,
  filename = "OrgChart.pdf",
): Promise<void> {
  const { toPng } = await import("html-to-image");
  const { jsPDF } = await import("jspdf");

  const dataUrl = await toPng(flowElement, {
    backgroundColor: "#FFFFFF",
    pixelRatio: 3,
    filter: (node: Element) => {
      const classes = (node as HTMLElement).className ?? "";
      if (typeof classes === "string") {
        if (classes.includes("react-flow__controls")) return false;
        if (classes.includes("react-flow__minimap")) return false;
        if (classes.includes("react-flow__attribution")) return false;
      }
      return true;
    },
  });

  // Create PDF in landscape, sized to the image
  const img = new Image();
  img.src = dataUrl;
  await new Promise((resolve, reject) => { img.onload = resolve; img.onerror = reject; });

  const pxToMm = 0.264583;
  const width = (img.width / 3) * pxToMm;
  const height = (img.height / 3) * pxToMm;

  const pdf = new jsPDF({
    orientation: width > height ? "landscape" : "portrait",
    unit: "mm",
    format: [width, height],
  });

  pdf.addImage(dataUrl, "PNG", 0, 0, width, height);
  pdf.save(filename);
}

/**
 * Get the React Flow viewport element for export.
 * Call this from the component that has access to the DOM.
 */
export function getFlowViewport(): HTMLElement | null {
  return document.querySelector(".react-flow__viewport") as HTMLElement | null;
}
