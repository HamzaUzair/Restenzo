"use client";

import React, { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { BadgePercent, ChevronRight, PlusCircle } from "lucide-react";
import DashboardLayout from "@/components/layout/DashboardLayout";
import type { Deal } from "@/types/deal";
import { apiFetch, getAuthSession } from "@/lib/auth-client";
import {
  loadOrderTakerCart,
  saveOrderTakerCart,
  type DealCartLine,
  type OrderTakerCartLine,
} from "@/lib/order-taker-cart";

export default function OrderTakerDealsPage() {
  const router = useRouter();
  const [authorized, setAuthorized] = useState(false);
  const [branchId, setBranchId] = useState<number | null>(null);
  const [branchName, setBranchName] = useState("");
  const [deals, setDeals] = useState<Deal[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");

  useEffect(() => {
    const session = getAuthSession();
    if (!session) {
      router.replace("/login");
      return;
    }
    if (session.role !== "ORDER_TAKER") {
      router.replace("/dashboard");
      return;
    }
    if (!session.branchId) {
      router.replace("/dashboard");
      return;
    }
    setBranchId(session.branchId);
    setBranchName(session.branchName ?? "");
    setAuthorized(true);
  }, [router]);

  const fetchDeals = useCallback(async () => {
    if (!branchId) return;
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams();
      params.set("branchId", String(branchId));
      params.set("status", "active");
      const res = await apiFetch(`/api/deals?${params.toString()}`);
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || "Failed to load deals");
      }
      const data = (await res.json()) as Deal[];
      setDeals(data.filter((d) => d.status === "active"));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load deals");
      setDeals([]);
    } finally {
      setLoading(false);
    }
  }, [branchId]);

  useEffect(() => {
    if (!authorized || !branchId) return;
    void fetchDeals();
  }, [authorized, branchId, fetchDeals]);

  const addDealToCart = (deal: Deal) => {
    const key = `deal:${deal.id}`;
    const lines = loadOrderTakerCart();
    const existing = lines.find((l) => l.kind === "deal" && l.key === key) as DealCartLine | undefined;
    let next: OrderTakerCartLine[];
    if (existing) {
      next = lines.map((l) =>
        l.kind === "deal" && l.key === key ? { ...l, qty: l.qty + 1 } : l
      );
    } else {
      const line: DealCartLine = {
        kind: "deal",
        key,
        dealId: Number(deal.id),
        dealName: deal.name,
        dealType: deal.type,
        branchName: deal.branchName,
        unitPrice: deal.price,
        qty: 1,
        components: deal.items.map((i) => ({
          dishId: Number(i.id),
          name: i.name,
          quantity: i.quantity,
        })),
      };
      next = [...lines, line];
    }
    saveOrderTakerCart(next);
    setToast(`“${deal.name}” added to your order cart.`);
    window.setTimeout(() => setToast(""), 3500);
  };

  if (!authorized) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="animate-spin h-8 w-8 border-4 border-[#ff5a1f] border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <DashboardLayout title="Deals">
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5 mb-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-lg bg-[#ff5a1f]/10 flex items-center justify-center shrink-0">
              <BadgePercent className="text-[#ff5a1f]" size={22} />
            </div>
            <div>
              <h2 className="text-xl font-bold text-gray-800">Active deals</h2>
              <p className="text-sm text-gray-500 mt-0.5">
                Add combo offers to your cart, then complete the order in{" "}
                <span className="font-medium text-gray-700">New Order / POS</span>.
              </p>
              {branchName && (
                <p className="text-xs text-gray-400 mt-2">Branch: {branchName}</p>
              )}
            </div>
          </div>
          <Link
            href="/create-order"
            className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-[#ff5a1f] text-white text-sm font-semibold hover:bg-[#e04e18] shrink-0"
          >
            Open POS
            <ChevronRight size={18} />
          </Link>
        </div>
      </div>

      {toast && (
        <div className="mb-4 rounded-lg border border-green-200 bg-green-50 text-green-800 text-sm px-4 py-3">
          {toast}
        </div>
      )}

      {error && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 text-red-700 text-sm px-4 py-3">
          {error}
        </div>
      )}

      {loading ? (
        <div className="bg-white rounded-xl border border-gray-100 p-12 text-center text-gray-500 text-sm">
          Loading deals…
        </div>
      ) : deals.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-100 p-12 text-center text-gray-500 text-sm">
          No active deals for this branch.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {deals.map((deal) => (
            <div
              key={deal.id}
              className="bg-white rounded-xl border border-gray-100 shadow-sm p-5 flex flex-col"
            >
              <p className="text-xs font-semibold uppercase tracking-wider text-[#ff5a1f]">
                {deal.type}
              </p>
              <h3 className="text-lg font-bold text-gray-900 mt-1">{deal.name}</h3>
              {deal.description && (
                <p className="text-sm text-gray-500 mt-2 line-clamp-3">{deal.description}</p>
              )}
              <p className="text-xl font-bold text-[#ff5a1f] mt-3">
                PKR {deal.price.toLocaleString()}
              </p>
              <div className="mt-3 flex-1">
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1.5">
                  Includes
                </p>
                <ul className="text-sm text-gray-700 space-y-1">
                  {deal.items.map((item) => (
                    <li key={item.lineId ?? `${deal.id}-${item.id}`}>
                      {item.name} × {item.quantity}
                    </li>
                  ))}
                </ul>
              </div>
              <button
                type="button"
                onClick={() => addDealToCart(deal)}
                className="mt-4 w-full inline-flex items-center justify-center gap-2 rounded-lg border border-[#ff5a1f] text-[#ff5a1f] text-sm font-semibold py-2.5 hover:bg-[#ff5a1f]/5"
              >
                <PlusCircle size={18} />
                Add to order
              </button>
            </div>
          ))}
        </div>
      )}
    </DashboardLayout>
  );
}
