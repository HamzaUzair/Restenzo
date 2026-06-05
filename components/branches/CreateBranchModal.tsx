"use client";

import React, { useState, useEffect, useCallback } from "react";
import { X, Save, Loader2 } from "lucide-react";
import BranchForm from "./BranchForm";
import type { Branch, BranchFormData } from "@/types/branch";
import { validateBranchTextField } from "@/lib/branch-field-validation";

const emptyForm: BranchFormData = {
  branch_name: "",
  address: "",
  city: "",
  status: "Active",
};

interface CreateBranchModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: BranchFormData) => Promise<void>;
  editBranch?: Branch | null;
}

const CreateBranchModal: React.FC<CreateBranchModalProps> = ({
  isOpen,
  onClose,
  onSubmit,
  editBranch,
}) => {
  const [formData, setFormData] = useState<BranchFormData>(emptyForm);
  const [errors, setErrors] = useState<Partial<Record<keyof BranchFormData, string>>>({});
  const [apiError, setApiError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const isEditing = !!editBranch;

  // Reset / populate form when modal opens
  useEffect(() => {
    if (isOpen) {
      if (editBranch) {
        setFormData({
          branch_name: editBranch.branch_name,
          address: editBranch.address ?? "",
          city: editBranch.city ?? "",
          status: editBranch.status,
        });
      } else {
        setFormData(emptyForm);
      }
      setErrors({});
      setApiError("");
    }
  }, [isOpen, editBranch]);

  // Close on Escape
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Escape" && !submitting) onClose();
    },
    [onClose, submitting]
  );
  useEffect(() => {
    if (isOpen) {
      document.addEventListener("keydown", handleKeyDown);
      document.body.style.overflow = "hidden";
    }
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = "";
    };
  }, [isOpen, handleKeyDown]);

  const validate = (): boolean => {
    const newErrors: Partial<Record<keyof BranchFormData, string>> = {};

    const branchNameError = validateBranchTextField(
      formData.branch_name,
      "Branch name is required"
    );
    if (branchNameError) newErrors.branch_name = branchNameError;

    const addressError = validateBranchTextField(
      formData.address,
      "Complete address is required"
    );
    if (addressError) newErrors.address = addressError;

    const cityError = validateBranchTextField(formData.city, "City is required");
    if (cityError) newErrors.city = cityError;

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async () => {
    if (!validate()) return;
    setApiError("");
    setSubmitting(true);
    try {
      await onSubmit(formData);
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "Something went wrong";
      setApiError(message);
    } finally {
      setSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      {/* Overlay */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={submitting ? undefined : onClose}
      />

      {/* Modal */}
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 shrink-0">
          <div className="flex items-center gap-2">
            <div className="w-1 h-6 bg-[#ff5a1f] rounded-full" />
            <h2 className="text-lg font-bold text-gray-800">
              {isEditing ? "Edit Branch" : "Create Branch"}
            </h2>
          </div>
          <button
            onClick={onClose}
            disabled={submitting}
            className="p-2 rounded-lg hover:bg-gray-100 text-gray-500 transition-colors cursor-pointer disabled:opacity-50"
            aria-label="Close"
          >
            <X size={20} />
          </button>
        </div>

        {/* Body — scrollable */}
        <div className="flex-1 overflow-y-auto px-6 py-5">
          {/* API error banner */}
          {apiError && (
            <div className="mb-4 flex items-center gap-2 bg-red-50 border border-red-200 text-red-600 text-sm rounded-lg px-4 py-3">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="h-5 w-5 shrink-0"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={1.5}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z"
                />
              </svg>
              {apiError}
            </div>
          )}

          <BranchForm data={formData} onChange={setFormData} errors={errors} />
        </div>

        {/* Footer */}
        <div className="flex items-center justify-center gap-3 px-6 py-4 border-t border-gray-100 shrink-0">
          <button
            onClick={onClose}
            disabled={submitting}
            className="flex items-center gap-2 px-5 py-2.5 rounded-lg border border-[#ff5a1f] text-[#ff5a1f] text-sm font-medium hover:bg-[#ff5a1f]/5 transition-colors cursor-pointer disabled:opacity-50"
          >
            <X size={16} />
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={submitting}
            className="flex items-center gap-2 px-5 py-2.5 rounded-lg bg-[#ff5a1f] text-white text-sm font-medium hover:bg-[#e04e18] transition-colors cursor-pointer shadow-sm disabled:opacity-60"
          >
            {submitting ? (
              <Loader2 size={16} className="animate-spin" />
            ) : (
              <Save size={16} />
            )}
            {isEditing ? "Update" : "Create"}
          </button>
        </div>
      </div>
    </div>
  );
};

export default CreateBranchModal;
