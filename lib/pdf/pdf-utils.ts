import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import type { AuthSession } from "@/types/auth";

export type PdfScope = {
  restaurantName: string;
  branchName?: string | null;
};

export type PdfHeader = {
  title: string;
  scope: PdfScope;
  generatedAt: Date;
  filters: Array<{ label: string; value: string }>;
};

export function fmtPkr(n: number): string {
  return `PKR ${Math.round(n).toLocaleString("en-PK")}`;
}

export function fmtDateTime(ts: number): string {
  return new Date(ts).toLocaleString("en-PK", {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });
}

export function getPdfScopeFromSession(session: AuthSession | null): PdfScope {
  return {
    restaurantName: session?.restaurantName?.trim() || "Restenzo",
    branchName: session?.branchName ?? null,
  };
}

export function createA4Doc(): jsPDF {
  return new jsPDF({
    orientation: "p",
    unit: "pt",
    format: "a4",
  });
}

/**
 * Renders a consistent header block and returns the next Y position.
 * Keep all coordinates in points (pt) since jsPDF is created with unit=pt.
 */
export function renderHeader(doc: jsPDF, header: PdfHeader): number {
  const pageW = doc.internal.pageSize.getWidth();
  const marginX = 40;
  let y = 40;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.text(header.scope.restaurantName, marginX, y);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  const right = pageW - marginX;
  doc.text(
    `Generated: ${header.generatedAt.toLocaleString("en-PK")}`,
    right,
    y,
    { align: "right" }
  );

  y += 18;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.text(header.title, marginX, y);

  y += 14;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  if (header.scope.branchName) {
    doc.text(`Branch: ${header.scope.branchName}`, marginX, y);
    y += 14;
  }

  if (header.filters.length > 0) {
    const filterText = header.filters
      .map((f) => `${f.label}: ${f.value}`)
      .join("  •  ");
    const lines = doc.splitTextToSize(filterText, pageW - marginX * 2);
    doc.text(lines, marginX, y);
    y += lines.length * 12 + 8;
  } else {
    y += 8;
  }

  doc.setDrawColor(220);
  doc.setLineWidth(1);
  doc.line(marginX, y, pageW - marginX, y);
  return y + 18;
}

export function renderSummaryBox(
  doc: jsPDF,
  yStart: number,
  rows: Array<[string, string]>
): number {
  const pageW = doc.internal.pageSize.getWidth();
  const marginX = 40;
  const boxW = pageW - marginX * 2;
  const lineH = 14;
  const padding = 12;
  const boxH = padding * 2 + rows.length * lineH;

  doc.setDrawColor(230);
  doc.setFillColor(248, 250, 252);
  doc.roundedRect(marginX, yStart, boxW, boxH, 6, 6, "FD");

  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  let y = yStart + padding + 10;
  for (const [k, v] of rows) {
    doc.text(k, marginX + padding, y);
    doc.setFont("helvetica", "normal");
    doc.text(v, marginX + boxW - padding, y, { align: "right" });
    doc.setFont("helvetica", "bold");
    y += lineH;
  }

  return yStart + boxH + 16;
}

export function renderPageNumbers(doc: jsPDF) {
  const pageCount = doc.getNumberOfPages();
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const marginX = 40;

  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(120);
    doc.text(`Page ${i} of ${pageCount}`, pageW - marginX, pageH - 24, {
      align: "right",
    });
    doc.setTextColor(0);
  }
}

export function addTable(doc: jsPDF, opts: Parameters<typeof autoTable>[1]) {
  autoTable(doc, {
    styles: {
      font: "helvetica",
      fontSize: 9,
      cellPadding: 4,
      overflow: "linebreak",
      valign: "top",
    },
    headStyles: {
      fillColor: [255, 90, 31],
      textColor: 255,
      fontStyle: "bold",
    },
    alternateRowStyles: {
      fillColor: [248, 250, 252],
    },
    margin: { left: 40, right: 40 },
    ...opts,
  });
}

