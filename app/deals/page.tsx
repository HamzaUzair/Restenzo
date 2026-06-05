 "use client";

 import React, {
   useCallback,
   useEffect,
   useMemo,
   useState,
 } from "react";
 import { useRouter } from "next/navigation";
 import { PlusCircle, BadgePercent } from "lucide-react";
import DashboardLayout from "@/components/layout/DashboardLayout";
import ReadOnlyBanner from "@/components/layout/ReadOnlyBanner";
import type { Branch } from "@/types/branch";
import type { Deal, DealFormData } from "@/types/deal";
import type { AuthSession } from "@/types/auth";
import DealsToolbar, {
  type DealStatusFilter,
} from "@/components/deals/DealsToolbar";
import DealCard from "@/components/deals/DealCard";
import DealModal from "@/components/deals/DealModal";
import DeleteDealModal from "@/components/deals/DeleteDealModal";
import DealsTable from "@/components/deals/DealsTable";
import type { ViewMode } from "@/components/menu/ViewToggle";
import {
  apiFetch,
  getAuthSession,
  isOperationalReadOnly,
} from "@/lib/auth-client";

 export default function DealsPage() {
   const router = useRouter();
   const [authorized, setAuthorized] = useState(false);
  const [sessionBranchId, setSessionBranchId] = useState<number | null>(null);
  const [session, setSession] = useState<AuthSession | null>(null);
  const readOnly = isOperationalReadOnly(session);

   /* Branches from API */
   const [branches, setBranches] = useState<Branch[]>([]);
   const [branchesLoading, setBranchesLoading] = useState(true);

   /* Deals (UI-only, local state) */
   const [deals, setDeals] = useState<Deal[]>([]);
  const [dealsLoading, setDealsLoading] = useState(true);

   /* Filters & view */
   const [filterBranchId, setFilterBranchId] = useState<number | "all">("all");
   const [statusFilter, setStatusFilter] = useState<DealStatusFilter>("all");
   const [search, setSearch] = useState("");
   const [view, setView] = useState<ViewMode>("grid");

   /* Modals */
   const [dealModalOpen, setDealModalOpen] = useState(false);
   const [editingDeal, setEditingDeal] = useState<Deal | null>(null);
   const [deleteTarget, setDeleteTarget] = useState<Deal | null>(null);

   /* Auth guard */
   useEffect(() => {
    const s = getAuthSession();
    if (!s) {
       router.replace("/login");
     } else {
      setSession(s);
      setSessionBranchId(s.branchId ?? null);
      if (s.branchId) {
        setFilterBranchId(s.branchId);
      }
       setAuthorized(true);
     }
   }, [router]);

   /* Fetch branches */
   const fetchBranches = useCallback(async () => {
     setBranchesLoading(true);
     try {
      const res = await apiFetch("/api/branches");
       if (!res.ok) throw new Error();
       const data: Branch[] = await res.json();
       setBranches(data.filter((b) => b.status === "Active"));
     } catch {
       setBranches([]);
     } finally {
       setBranchesLoading(false);
     }
   }, []);

   useEffect(() => {
     if (authorized) fetchBranches();
   }, [authorized, fetchBranches]);

  /* Fetch deals from API */
  const fetchDeals = useCallback(async () => {
    setDealsLoading(true);
    try {
      const params = new URLSearchParams();
      const effectiveBranchId =
        sessionBranchId !== null
          ? sessionBranchId
          : filterBranchId;
      if (effectiveBranchId !== "all") params.set("branchId", String(effectiveBranchId));
      if (statusFilter !== "all") params.set("status", statusFilter);
      if (search.trim()) params.set("search", search.trim());

      const res = await apiFetch(`/api/deals${params.toString() ? `?${params}` : ""}`);
      if (!res.ok) throw new Error("Failed to fetch deals");
      const data: Deal[] = await res.json();
      setDeals(data);
    } catch (error) {
      console.error("Error fetching deals:", error);
      setDeals([]);
    } finally {
      setDealsLoading(false);
    }
  }, [filterBranchId, statusFilter, search, sessionBranchId]);

  useEffect(() => {
    if (authorized && !branchesLoading) {
      fetchDeals();
    }
  }, [authorized, branchesLoading, fetchDeals]);

   const noBranches = !branchesLoading && branches.length === 0;

   /* Derived stats */
   const totalDeals = deals.length;
   const activeDeals = deals.filter((d) => d.status === "active").length;
   const inactiveDeals = deals.filter((d) => d.status === "inactive").length;

  const filteredDeals = useMemo(() => deals, [deals]);

   /* CRUD handlers (UI-only) */
   const openAddDeal = () => {
     if (readOnly) return;
     setEditingDeal(null);
     setDealModalOpen(true);
   };

   const openEditDeal = (deal: Deal) => {
     if (readOnly) return;
     setEditingDeal(deal);
     setDealModalOpen(true);
   };

  const handleSaveDeal = async (data: DealFormData) => {
    try {
      const payload = {
        name: data.name.trim(),
        type: data.type.trim(),
        description: data.description.trim() || null,
        branchId: data.branchId,
        price: data.price,
        status: data.status,
        items: data.items.map((i) => ({
          id: i.id,
          name: i.name,
          variationId: i.variationId ?? null,
          quantity: i.quantity,
        })),
      };

      const url = editingDeal ? `/api/deals/${editingDeal.id}` : "/api/deals";
      const method = editingDeal ? "PUT" : "POST";

      const res = await apiFetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const error = await res.json().catch(() => ({}));
        throw new Error(error.error || "Failed to save deal");
      }

      await fetchDeals();
      setDealModalOpen(false);
      setEditingDeal(null);
    } catch (error) {
      console.error("Error saving deal:", error);
      alert(error instanceof Error ? error.message : "Failed to save deal");
    }
  };

   const requestDeleteDeal = (deal: Deal) => {
     if (readOnly) return;
     setDeleteTarget(deal);
   };

  const confirmDeleteDeal = async () => {
     if (!deleteTarget) return;
    try {
      const res = await apiFetch(`/api/deals/${deleteTarget.id}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const error = await res.json().catch(() => ({}));
        throw new Error(error.error || "Failed to delete deal");
      }
      await fetchDeals();
      setDeleteTarget(null);
    } catch (error) {
      console.error("Error deleting deal:", error);
      alert(error instanceof Error ? error.message : "Failed to delete deal");
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
     <DashboardLayout title="Deals">
      {readOnly && <ReadOnlyBanner module="deals" />}

       {/* Header card */}
       <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6 mb-6">
         <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
           <div>
             <h2 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
               <span className="inline-flex items-center justify-center w-9 h-9 rounded-lg bg-[#ff5a1f]/10 text-[#ff5a1f]">
                 <BadgePercent size={18} />
               </span>
               Deals Management
             </h2>
             <p className="text-sm text-gray-500 mt-1">
               {readOnly
                 ? "Review combo offers, bundles, and special deals across branches."
                 : "Manage combo offers, bundles, and special deals across branches."}
             </p>

             <div className="flex items-center gap-4 mt-3 text-xs text-gray-500">
               <span>
                 Total deals:{" "}
                 <span className="font-semibold text-gray-700">
                   {totalDeals}
                 </span>
               </span>
               <span className="inline-flex items-center gap-1 text-green-600">
                 ● Active: <span className="font-semibold">{activeDeals}</span>
               </span>
               <span className="inline-flex items-center gap-1 text-gray-400">
                 ○ Inactive:{" "}
                 <span className="font-semibold text-gray-500">
                   {inactiveDeals}
                 </span>
               </span>
             </div>
           </div>

           {!readOnly && (
             <div className="flex flex-col items-end gap-1">
               <button
                 onClick={openAddDeal}
                 disabled={noBranches}
                 className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-[#ff5a1f] text-white text-sm font-semibold hover:bg-[#e04e18] transition-colors cursor-pointer shadow-sm shrink-0 disabled:opacity-50 disabled:cursor-not-allowed"
               >
                 <PlusCircle size={18} />
                 + Add Deal
               </button>
               {noBranches && (
                 <p className="text-xs text-red-500">
                   Create an active branch first
                 </p>
               )}
             </div>
           )}
         </div>
       </div>

       {/* Filters */}
       <DealsToolbar
         branches={branches}
         branchesLoading={branchesLoading}
         filterBranchId={filterBranchId}
        onBranchChange={(v) => {
          if (sessionBranchId !== null) return;
          setFilterBranchId(v);
        }}
        branchLocked={sessionBranchId !== null}
         statusFilter={statusFilter}
         onStatusChange={setStatusFilter}
         search={search}
         onSearchChange={setSearch}
         view={view}
         onViewChange={setView}
       />

       {/* Content */}
      {branchesLoading || dealsLoading ? (
         <div className="flex items-center justify-center py-20">
           <div className="animate-spin h-8 w-8 border-4 border-[#ff5a1f] border-t-transparent rounded-full" />
         </div>
       ) : view === "grid" ? (
         filteredDeals.length === 0 ? (
           <div className="bg-white rounded-xl border border-gray-100 shadow-sm">
             <div className="px-6 py-16 flex flex-col items-center gap-3 text-center">
               <div className="w-16 h-16 rounded-full bg-gray-100 flex items-center justify-center">
                 <BadgePercent size={28} className="text-gray-400" />
               </div>
               <p className="text-sm text-gray-500 max-w-xs">
                 No deals found. Try adjusting your filters or create a new
                 deal.
               </p>
             </div>
           </div>
         ) : (
           <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
             {filteredDeals.map((deal) => (
               <DealCard
                 key={deal.id}
                 deal={deal}
                 onEdit={openEditDeal}
                 onDelete={requestDeleteDeal}
                 readOnly={readOnly}
               />
             ))}
           </div>
         )
       ) : (
         <DealsTable
           deals={filteredDeals}
           onEdit={openEditDeal}
           onDelete={requestDeleteDeal}
           readOnly={readOnly}
         />
       )}

       {/* Add / Edit Deal modal */}
       <DealModal
         isOpen={dealModalOpen}
         onClose={() => {
           setDealModalOpen(false);
           setEditingDeal(null);
         }}
         onSave={handleSaveDeal}
         editDeal={editingDeal}
         branches={branches}
         branchesLoading={branchesLoading}
        lockedBranchId={sessionBranchId}
       />

       {/* Delete confirmation modal */}
       <DeleteDealModal
         isOpen={!!deleteTarget}
         dealName={deleteTarget?.name ?? null}
         onCancel={() => setDeleteTarget(null)}
         onConfirm={confirmDeleteDeal}
       />
     </DashboardLayout>
   );
 }

