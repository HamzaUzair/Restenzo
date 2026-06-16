import type { AuthSession } from "@/types/auth";
import type { ItemPerformance } from "@/types/menuSales";
import {
  addTable,
  createA4Doc,
  fmtPkr,
  getPdfScopeFromSession,
  renderHeader,
  renderPageNumbers,
  renderSummaryBox,
} from "@/lib/pdf/pdf-utils";

export type MenuSalesReportFilters = {
  branchLabel: string;
  dateRange: string;
  category: string;
  search: string;
  activeOnly: boolean;
};

export function exportMenuSalesReportPdf(params: {
  session: AuthSession | null;
  filters: MenuSalesReportFilters;
  rows: ItemPerformance[];
}) {
  const { session, filters, rows } = params;
  const doc = createA4Doc();
  const scope = getPdfScopeFromSession(session);

  const totalQty = rows.reduce((s, r) => s + Number(r.soldQty || 0), 0);
  const totalRevenue = rows.reduce((s, r) => s + Number(r.revenue || 0), 0);
  const top = [...rows].sort((a, b) => b.revenue - a.revenue)[0] ?? null;

  let y = renderHeader(doc, {
    title: "Menu Sales Report",
    scope: { restaurantName: scope.restaurantName, branchName: scope.branchName },
    generatedAt: new Date(),
    filters: [
      { label: "Branch", value: filters.branchLabel || "All" },
      { label: "Date", value: filters.dateRange || "—" },
      { label: "Category", value: filters.category || "All" },
      { label: "Search", value: filters.search || "—" },
      { label: "Active Only", value: filters.activeOnly ? "Yes" : "No" },
    ],
  });

  y = renderSummaryBox(doc, y, [
    ["Total Items", String(rows.length)],
    ["Total Quantity Sold", String(totalQty)],
    ["Total Revenue (excl. cancelled)", fmtPkr(totalRevenue)],
    ["Top Item", top ? `${top.itemName} (${fmtPkr(top.revenue)})` : "—"],
  ]);

  addTable(doc, {
    startY: y,
    head: [["Item Name", "Category", "Qty Sold", "Avg Price", "Total Revenue", "Active"]],
    body: rows.map((r) => [
      r.itemName,
      r.category,
      String(r.soldQty),
      fmtPkr(r.avgPrice),
      fmtPkr(r.revenue),
      r.isActive ? "Yes" : "No",
    ]),
    columnStyles: {
      0: { cellWidth: 180 },
      1: { cellWidth: 90 },
      2: { cellWidth: 55, halign: "right" },
      3: { cellWidth: 75, halign: "right" },
      4: { cellWidth: 85, halign: "right" },
      5: { cellWidth: 45, halign: "center" },
    },
  });

  renderPageNumbers(doc);
  const filename = `menu-sales-report-${new Date().toISOString().slice(0, 10)}.pdf`;
  doc.save(filename);
}

