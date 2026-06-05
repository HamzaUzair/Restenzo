"use client";

import React, { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { PlusCircle } from "lucide-react";
import DashboardLayout from "@/components/layout/DashboardLayout";
import BranchTable from "@/components/branches/BranchTable";
import CreateBranchModal from "@/components/branches/CreateBranchModal";
import type { Branch, BranchFormData, ApiError } from "@/types/branch";
import { apiFetch, getAuthSession } from "@/lib/auth-client";

interface BranchUsageInfo {
  used: number;
  max: number | null;
  planName: string;
  canCreate: boolean;
}

export default function BranchesPage() {
  const router = useRouter();
  const [authorized, setAuthorized] = useState(false);

  // ── Branch state ──
  const [branches, setBranches] = useState<Branch[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [editingBranch, setEditingBranch] = useState<Branch | null>(null);
  const [usage, setUsage] = useState<BranchUsageInfo | null>(null);

  // ── Auth guard ──
  useEffect(() => {
    if (!getAuthSession()) {
      router.replace("/login");
    } else {
      setAuthorized(true);
    }
  }, [router]);

  // ── Fetch branches from API ──
  const fetchBranches = useCallback(async () => {
    setLoading(true);
    setFetchError("");
    try {
      const res = await apiFetch("/api/branches");
      if (!res.ok) throw new Error("Failed to fetch branches");
      const data: Branch[] = await res.json();
      setBranches(data);
    } catch {
      setFetchError("Could not load branches. Please try again.");
    } finally {
      setLoading(false);
    }
  }, []);

  // ── Fetch plan branch usage / limit ──
  const fetchUsage = useCallback(async () => {
    try {
      const res = await apiFetch("/api/branches/usage");
      if (!res.ok) return;
      const data: BranchUsageInfo = await res.json();
      setUsage(data);
    } catch {
      // non-blocking; the counter just won't render
    }
  }, []);

  useEffect(() => {
    if (authorized) {
      fetchBranches();
      fetchUsage();
    }
  }, [authorized, fetchBranches, fetchUsage]);

  // ── Smooth scroll to hash anchor after branches load ──
  useEffect(() => {
    if (!loading && window.location.hash) {
      const el = document.querySelector(window.location.hash);
      if (el) {
        setTimeout(() => el.scrollIntoView({ behavior: "smooth" }), 100);
      }
    }
  }, [loading]);

  // ── Handlers ──
  const openCreate = () => {
    setEditingBranch(null);
    setModalOpen(true);
  };

  const openEdit = (branch: Branch) => {
    setEditingBranch(branch);
    setModalOpen(true);
  };

  const closeModal = () => {
    setModalOpen(false);
    setEditingBranch(null);
  };

  /** Create or Update — called from modal (throws on API error so modal can show it) */
  const handleSubmit = async (data: BranchFormData) => {
    if (editingBranch) {
      // ── PUT ──
      const res = await apiFetch(`/api/branches/${editingBranch.branch_id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const body: ApiError = await res.json();
        throw new Error(body.error || "Failed to update branch");
      }
      const updated: Branch = await res.json();
      setBranches((prev) =>
        prev.map((b) => (b.branch_id === updated.branch_id ? updated : b))
      );
    } else {
      // ── POST ──
      const res = await apiFetch("/api/branches", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const body: ApiError = await res.json();
        throw new Error(body.error || "Failed to create branch");
      }
      const created: Branch = await res.json();
      setBranches((prev) => [created, ...prev]);
      fetchUsage();
    }
    closeModal();
  };

  const handleDelete = async (branch: Branch) => {
    const confirmed = window.confirm(
      `Are you sure you want to delete "${branch.branch_name}"?`
    );
    if (!confirmed) return;

    try {
      const res = await apiFetch(`/api/branches/${branch.branch_id}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const body: ApiError = await res.json();
        alert(body.error || "Failed to delete branch");
        return;
      }
      setBranches((prev) => prev.filter((b) => b.branch_id !== branch.branch_id));
      fetchUsage();
    } catch {
      alert("Network error. Could not delete branch.");
    }
  };

  if (!authorized) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="animate-spin h-8 w-8 border-4 border-[#ff5a1f] border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <DashboardLayout title="Branches">
      {/* ── Page Header Card ── */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6 mb-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h2 className="text-2xl font-bold text-gray-800">
              Branch Management
            </h2>
            <p className="text-sm text-gray-500 mt-1">
              Create, update, and manage restaurant branches
            </p>
            {usage && usage.max !== null && (
              <p className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-gray-100 px-3 py-1 text-xs font-semibold text-gray-600">
                Branches: {usage.used} / {usage.max} used
                {!usage.canCreate && (
                  <span className="text-[#ff5a1f]">· limit reached</span>
                )}
              </p>
            )}
          </div>

          <div className="flex flex-col items-stretch sm:items-end gap-1.5 shrink-0">
            <button
              onClick={openCreate}
              disabled={usage ? !usage.canCreate : false}
              title={
                usage && !usage.canCreate
                  ? `Your ${usage.planName} plan includes up to ${usage.max} branches. Upgrade to add more.`
                  : undefined
              }
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-[#ff5a1f] text-white text-sm font-semibold hover:bg-[#e04e18] transition-colors cursor-pointer shadow-sm disabled:cursor-not-allowed disabled:opacity-50"
            >
              <PlusCircle size={18} />
              Add Branch
            </button>
            {usage && !usage.canCreate && (
              <p className="max-w-[16rem] text-right text-[11px] text-gray-500">
                Upgrade your plan to add more branches.
              </p>
            )}
          </div>
        </div>
      </div>

      {/* ── Fetch error banner ── */}
      {fetchError && (
        <div className="mb-6 flex items-center gap-2 bg-red-50 border border-red-200 text-red-600 text-sm rounded-lg px-4 py-3">
          {fetchError}
          <button
            onClick={fetchBranches}
            className="ml-auto text-xs font-medium underline hover:no-underline cursor-pointer"
          >
            Retry
          </button>
        </div>
      )}

      {/* ── Branch Table ── */}
      <div id="branches-table" className="scroll-mt-24">
      <BranchTable
        branches={branches}
        loading={loading}
        onEdit={openEdit}
        onDelete={handleDelete}
      />
      </div>

      {/* ── Create / Edit Modal ── */}
      <CreateBranchModal
        isOpen={modalOpen}
        onClose={closeModal}
        onSubmit={handleSubmit}
        editBranch={editingBranch}
      />
    </DashboardLayout>
  );
}
