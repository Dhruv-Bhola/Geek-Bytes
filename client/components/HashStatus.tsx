import { CheckCircle2, XCircle } from "lucide-react";

export default function HashStatus({
  storedHash,
  currentHash,
}: {
  storedHash: string;
  currentHash: string;
}) {
  const match = storedHash === currentHash;
  return (
    <div className="rounded-card border border-surface-border bg-surface-card p-6">
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-ink-400">Stored SHA-256</p>
          <p className="mt-1 font-mono text-sm text-ink-900">{storedHash}</p>
        </div>
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-ink-400">Current SHA-256</p>
          <p className="mt-1 font-mono text-sm text-ink-900">{currentHash}</p>
        </div>
      </div>
      <div
        className={`mt-6 flex flex-col items-center gap-1 rounded-card py-6 ${
          match ? "bg-status-verifiedBg" : "bg-status-criticalBg"
        }`}
      >
        {match ? (
          <CheckCircle2 className="text-status-verified" size={32} />
        ) : (
          <XCircle className="text-status-critical" size={32} />
        )}
        <p className={`font-semibold ${match ? "text-status-verified" : "text-status-critical"}`}>
          {match ? "HASH MATCH" : "HASH MISMATCH"}
        </p>
        <p className="text-sm text-ink-700">
          {match ? "Document integrity verified. No modification detected." : "Possible unauthorized modification detected."}
        </p>
      </div>
    </div>
  );
}
