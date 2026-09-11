"use client";

import { AlertTriangle } from "lucide-react";
import type { EmergencyAccessRequest } from "@/lib/types";
import { formatDateTime } from "@/lib/format";

export default function EmergencyModal({
  request,
  onApprove,
  onReject,
  onClose,
}: {
  request: EmergencyAccessRequest;
  onApprove: () => void;
  onReject: () => void;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-ink-900/40 p-4" onClick={onClose}>
      <div
        className="w-full max-w-md rounded-card bg-white p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-lg font-semibold text-ink-900">Admin Approval</h3>
        <dl className="mt-4 space-y-2 text-sm">
          <div className="flex justify-between">
            <dt className="text-ink-500">Officer</dt>
            <dd className="font-medium text-ink-900">{request.requestedBy}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-ink-500">Case</dt>
            <dd className="font-medium text-ink-900">#{request.caseId}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-ink-500">Reason</dt>
            <dd className="font-medium text-ink-900">{request.reason}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-ink-500">Duration</dt>
            <dd className="font-medium text-ink-900">{request.durationMinutes} minutes</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-ink-500">Requested</dt>
            <dd className="font-medium text-ink-900">{formatDateTime(request.requestedAt)}</dd>
          </div>
        </dl>

        <div className="mt-4 flex items-start gap-2 rounded-lg bg-status-reviewBg p-3 text-sm text-status-review">
          <AlertTriangle size={16} className="mt-0.5 shrink-0" />
          This action will be permanently audited.
        </div>

        <div className="mt-6 flex justify-end gap-3">
          <button
            onClick={onReject}
            className="rounded-lg border border-surface-border px-4 py-2 text-sm font-medium text-ink-700 hover:bg-surface-muted"
          >
            Reject
          </button>
          <button
            onClick={onApprove}
            className="rounded-lg bg-navy-800 px-4 py-2 text-sm font-medium text-white hover:bg-navy-700"
          >
            Approve
          </button>
        </div>
      </div>
    </div>
  );
}
