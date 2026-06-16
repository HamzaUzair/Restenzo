import type { AuthSession } from "@/types/auth";
import { isBookedSalesStatus } from "@/lib/order-revenue";
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

export type OrdersReportFilters = {
  branchLabel: string;
  search: string;
  status: string;
  paymentMethod: string;
  dateRange: string;
};

export type OrdersReportRow = {
  orderNo: string;
  branchName: string;
  createdAt: number;
  type: string;
  /** Cash / Card / Online / Credit */
  paymentMethod: string;
  paid?: boolean;
  status: string;
  total: number;
};

export function exportOrdersReportPdf(params: {
  session: AuthSession | null;
  orders: OrdersReportRow[];
  filters: OrdersReportFilters;
}) {
  const { session, orders, filters } = params;
  const doc = createA4Doc();
  const scope = getPdfScopeFromSession(session);

  const booked = orders.filter((o) => isBookedSalesStatus(o.status));
  const revenue = booked.reduce((s, o) => s + Number(o.total || 0), 0);

  const cashBooked = booked.filter((o) => o.paymentMethod === "Cash");
  const cardOnlineBooked = booked.filter(
    (o) => o.paymentMethod === "Card" || o.paymentMethod === "Online"
  );

  let y = renderHeader(doc, {
    title: "Orders Report",
    scope: {
      restaurantName: scope.restaurantName,
      branchName: scope.branchName,
    },
    generatedAt: new Date(),
    filters: [
      { label: "Branch", value: filters.branchLabel || "All" },
      { label: "Status", value: filters.status || "All" },
      { label: "Search", value: filters.search || "—" },
      { label: "Payment", value: filters.paymentMethod || "All" },
      { label: "Date", value: filters.dateRange || "—" },
    ],
  });

  y = renderSummaryBox(doc, y, [
    ["Total Orders", String(orders.length)],
    ["Total Revenue (excl. cancelled)", fmtPkr(revenue)],
    ["Cash (count / amount)", `${cashBooked.length} / ${fmtPkr(cashBooked.reduce((s, o) => s + o.total, 0))}`],
    [
      "Card/Online (count / amount)",
      `${cardOnlineBooked.length} / ${fmtPkr(
        cardOnlineBooked.reduce((s, o) => s + o.total, 0)
      )}`,
    ],
  ]);

  const body = orders.map((o) => {
    const paymentStatus =
      o.status === "Cancelled" ? "Cancelled" : o.paid ? "Paid" : "Unpaid";
    return [
      o.orderNo,
      o.branchName,
      fmtDateTime(o.createdAt),
      o.type,
      o.paymentMethod,
      paymentStatus,
      o.status,
      fmtPkr(o.total),
    ];
  });

  addTable(doc, {
    startY: y,
    head: [
      [
        "Order No",
        "Branch",
        "Date & Time",
        "Order Type",
        "Payment Method",
        "Payment Status",
        "Order Status",
        "Total",
      ],
    ],
    body,
    columnStyles: {
      0: { cellWidth: 70 },
      1: { cellWidth: 90 },
      2: { cellWidth: 110 },
      3: { cellWidth: 65 },
      4: { cellWidth: 65 },
      5: { cellWidth: 70 },
      6: { cellWidth: 70 },
      7: { cellWidth: 65, halign: "right" },
    },
  });

  renderPageNumbers(doc);

  const filename = `orders-report-${new Date().toISOString().slice(0, 10)}.pdf`;
  doc.save(filename);
}

