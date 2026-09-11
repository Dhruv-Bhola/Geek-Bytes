"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, Loader2 } from "lucide-react";
import { getEmergencyRequests, requestEmergencyAccess, decideEmergencyAccess } from "@/lib/api";
import type { EmergencyAccessRequest } from "@/lib/types";
import { useAuth } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";
import EmergencyModal from "@/components/EmergencyModal";
import StatusBadge from "@/components/StatusBadge";
import { LoadingState } from "@/components/LoadingState";
import EmptyState from "@/components/EmptyState";
import { mockCases, mockDocuments } from "@/lib/mockData";

const DURATIONS = [15, 30, 60, 120];

export default function EmergencyAccessPage() {
  const { user } = useAuth();
  const canApprove = hasPermission(user?.permissions, "approve_emergency_access");

  const [requests, setRequests] = useState<EmergencyAccessRequest[] | null>(null);
  const [selected, setSelected] = useState<EmergencyAccessRequest | null>(null);

  const [caseId, setCaseId] = useState(mockCases[0]?.id ?? "");
  const [documentId, setDocumentId] = useState(mockDocuments[0]?.id ?? "");
  const [reason, setReason] = useState("");
  const [duration, setDuration] = useState(30);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  function loadRequests() {
    getEmergencyRequests().then(setRequests);
  }

  useEffect(loadRequests, []);

  async function handleRequest(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    try {
      await requestEmergencyAccess({ caseId, documentId, reason, durationMinutes: duration });
      setSubmitted(true);
      loadRequests();
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDecision(decision: "approved" | "rejected") {
    if (!selected) return;
    await decideEmergencyAccess(selected.id, decision);
    setSelected(null);
    loadRequests();
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-xl font-semibold text-ink-900">Emergency Access</h1>
        <p className="text-sm text-ink-500">Request temporary access to a restricted document with a reason, approval and automatic expiry.</p>
      </div>

      {!canApprove && (
        <form onSubmit={handleRequest} className="max-w-lg space-y-4 rounded-card border border-surface-border bg-surface-card p-6 shadow-card">
          <h2 className="text-sm font-semibold text-ink-900">EMERGENCY ACCESS REQUEST</h2>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-sm font-medium text-ink-700">Case</label>
              <select value={caseId} onChange={(e) => setCaseId(e.target.value)} className={selectClass}>
                {mockCases.map((c) => <option key={c.id} value={c.id}>Case #{c.id}</option>)}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-ink-700">Document</label>
              <select value={documentId} onChange={(e) => setDocumentId(e.target.value)} className={selectClass}>
                {mockDocuments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
            </div>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-ink-700">Reason</label>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
              placeholder="Required for immediate investigation…"
              className={inputClass}
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-ink-700">Access Duration</label>
            <select value={duration} onChange={(e) => setDuration(Number(e.target.value))} className={selectClass}>
              {DURATIONS.map((d) => <option key={d} value={d}>{d} minutes</option>)}
            </select>
          </div>

          <div className="flex items-start gap-2 rounded-lg bg-status-reviewBg p-3 text-sm text-status-review">
            <AlertTriangle size={16} className="mt-0.5 shrink-0" />
            This action will be permanently audited.
          </div>

          {submitted && (
            <p className="rounded-lg bg-status-verifiedBg px-3 py-2 text-sm text-status-verified">
              Request submitted. An administrator will review it shortly.
            </p>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-navy-800 py-2.5 text-sm font-medium text-white hover:bg-navy-700 disabled:opacity-60"
          >
            {submitting && <Loader2 className="animate-spin" size={16} />}
            Request Emergency Access
          </button>
        </form>
      )}

      <div>
        <h2 className="mb-3 text-sm font-semibold text-ink-900">
          {canApprove ? "Pending Requests" : "Your Requests"}
        </h2>
        {!requests ? (
          <LoadingState label="Loading requests…" />
        ) : requests.length === 0 ? (
          <EmptyState kind="empty" description="No emergency access requests right now." />
        ) : (
          <div className="space-y-3">
            {requests.map((req) => (
              <div
                key={req.id}
                className="flex items-center justify-between rounded-card border border-surface-border bg-surface-card p-4 shadow-card"
              >
                <div>
                  <p className="font-medium text-ink-900">{req.requestedBy} · Case #{req.caseId}</p>
                  <p className="text-sm text-ink-500">{req.reason} — {req.durationMinutes} min</p>
                </div>
                <div className="flex items-center gap-3">
                  <StatusBadge
                    tone={req.status === "approved" ? "verified" : req.status === "rejected" ? "critical" : "review"}
                    label={req.status.toUpperCase()}
                  />
                  {canApprove && req.status === "pending" && (
                    <button
                      onClick={() => setSelected(req)}
                      className="rounded-lg bg-navy-800 px-3 py-1.5 text-sm font-medium text-white hover:bg-navy-700"
                    >
                      Review
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {selected && (
        <EmergencyModal
          request={selected}
          onApprove={() => handleDecision("approved")}
          onReject={() => handleDecision("rejected")}
          onClose={() => setSelected(null)}
        />
      )}
    </div>
  );
}

const inputClass = "w-full rounded-lg border border-surface-border px-3 py-2 text-sm focus:border-navy-600";
const selectClass = inputClass + " bg-white";
