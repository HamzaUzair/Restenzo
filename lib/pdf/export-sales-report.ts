import type { AuthSession } from "@/types/auth";
import type { DailySummary, ReportKPIs, ReportOrder } from "@/types/salesReport";
import {
  addTable,
  createA4Doc,
  fmtDateTime,
  fmtPkr,
  getPdfScopeFromSession,
  renderHeader,
  renderPageNumbers,
  renderSummaryBox,
} from "@/lib/pdf/pdf-utils";

export type SalesReportFilters = {
  branchLabel: string;
  dateRange: string;
  includeCancelled: boolean;
};

export function exportSalesReportPdf(params: {
  session: AuthSession | null;
  filters: SalesReportFilters;
  kpis: ReportKPIs;
  orders: ReportOrder[];
  dailyRows: DailySummary[];
}) {
  const { session, filters, kpis, orders, dailyRows } = params;
  const doc = createA4Doc();
  const scope = getPdfScopeFromSession(session);

  let y = renderHeader(doc, {
    title: "Sales Report",
    scope: {
      restaurantName: scope.restaurantName,
      branchName: scope.branchName,
    },
    generatedAt: new Date(),
    filters: [
      { label: "Branch", value: filters.branchLabel || "All" },
      { label: "Date", value: filters.dateRange || "—" },
      { label: "Include Cancelled (table only)", value: filters.includeCancelled ? "Yes" : "No" },
    ],
  });

  y = renderSummaryBox(doc, y, [
    ["Total Sales / Revenue (excl. cancelled)", fmtPkr(kpis.netRevenue)],
    ["Total Valid Orders", String(kpis.totalOrders)],
    ["Cash (count / amount)", `${kpis.cashCount} / ${fmtPkr(kpis.cashAmount)}`],
    ["Card (count / amount)", `${kpis.cardCount} / ${fmtPkr(kpis.cardAmount)}`],
    ["Online (count / amount)", `${kpis.onlineCount} / ${fmtPkr(kpis.onlineAmount)}`],
    ["Average Order Value", fmtPkr(kpis.avgOrderValue)],
  ]);

  addTable(doc, {
    startY: y,
    head: [[
      "Order No",
      "Date & Time",
      "Branch",
      "Payment Method",
      "Order Status",
      "Total",
    ]],
    body: orders.map((o) => [
      o.orderNo,
      fmtDateTime(o.createdAt),
      o.branchName,
      o.paymentMethod,
      o.status,
      fmtPkr(o.total),
    ]),
    columnStyles: {
      0: { cellWidth: 70 },
      1: { cellWidth: 110 },
      2: { cellWidth: 90 },
      3: { cellWidth: 80 },
      4: { cellWidth: 80 },
      5: { cellWidth: 65, halign: "right" },
    },
  });

  // Keep the PDF readable: render the daily summary on a fresh page.
  doc.addPage();
  let y2 = renderHeader(doc, {
    title: "Sales Report — Daily Summary",
    scope: {
      restaurantName: scope.restaurantName,
      branchName: scope.branchName,
    },
    generatedAt: new Date(),
    filters: [
      { label: "Branch", value: filters.branchLabel || "All" },
      { label: "Date", value: filters.dateRange || "—" },
      { label: "Include Cancelled (table only)", value: filters.includeCancelled ? "Yes" : "No" },
    ],
  });

  addTable(doc, {
    startY: y2,
    head: [[
      "Date",
      "Orders",
      "Gross",
      "Discounts",
      "Service Charges",
      "Net",
    ]],
    body: dailyRows.map((r) => [
      r.dateLabel,
      String(r.orders),
      fmtPkr(r.gross),
      fmtPkr(r.discounts),
      fmtPkr(r.serviceCharges),
      fmtPkr(r.net),
    ]),
    columnStyles: {
      0: { cellWidth: 110 },
      1: { cellWidth: 50, halign: "right" },
      2: { cellWidth: 80, halign: "right" },
      3: { cellWidth: 80, halign: "right" },
      4: { cellWidth: 90, halign: "right" },
      5: { cellWidth: 80, halign: "right" },
    },
  });

  renderPageNumbers(doc);

  const filename = `sales-report-${new Date().toISOString().slice(0, 10)}.pdf`;
  doc.save(filename);
}

