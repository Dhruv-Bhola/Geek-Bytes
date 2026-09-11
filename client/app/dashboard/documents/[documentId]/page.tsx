"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { motion } from "framer-motion";
import {
  Download,
  ShieldCheck,
  FileText,
  Loader2,
} from "lucide-react";

import {
  getDocumentById,
  getCustodyEvents,
  verifyIntegrity,
  downloadDocument,
} from "@/lib/api";

import type {
  DocumentRecord,
  CustodyEvent,
} from "@/lib/types";

import StatusBadge from "@/components/StatusBadge";
import CustodyChain from "@/components/CustodyChain";
import { LoadingState } from "@/components/LoadingState";
import EmptyState from "@/components/EmptyState";
import { formatDateTime } from "@/lib/format";

const TABS = [
  "View",
  "Versions",
  "Chain of Custody",
  "Details",
] as const;

export default function DocumentViewerPage() {
  const params =
    useParams<{
      documentId: string;
    }>();

  const documentId =
    params?.documentId ?? "";

  const [doc, setDoc] =
    useState<
      DocumentRecord | null | undefined
    >(undefined);

  const [custody, setCustody] =
    useState<CustodyEvent[]>([]);

  const [tab, setTab] =
    useState<(typeof TABS)[number]>(
      "View"
    );

  const [verifying, setVerifying] =
    useState(false);

  const [downloading, setDownloading] =
    useState(false);

  const [loadingCustody, setLoadingCustody] =
    useState(false);

  const [error, setError] =
    useState("");

  const [verifyMessage, setVerifyMessage] =
    useState("");

  /**
   * Load document metadata.
   */
  useEffect(() => {
    if (!documentId) {
      return;
    }

    let cancelled = false;

    async function loadDocument() {
      try {
        setError("");
        setDoc(undefined);

        const document =
          await getDocumentById(
            documentId
          );

        if (cancelled) {
          return;
        }

        setDoc(document);
      } catch (err) {
        if (cancelled) {
          return;
        }

        console.error(
          "Failed to load document:",
          err
        );

        setError(
          err instanceof Error
            ? err.message
            : "Unable to load this document."
        );

        setDoc(null);
      }
    }

    loadDocument();

    return () => {
      cancelled = true;
    };
  }, [documentId]);

  /**
   * Load chain-of-custody events.
   */
  useEffect(() => {
    if (!documentId) {
      return;
    }

    let cancelled = false;

    async function loadCustody() {
      try {
        setLoadingCustody(true);

        const events =
          await getCustodyEvents(
            documentId
          );

        if (!cancelled) {
          setCustody(
            Array.isArray(events)
              ? events
              : []
          );
        }
      } catch (err) {
        console.error(
          "Failed to load custody events:",
          err
        );

        if (!cancelled) {
          setCustody([]);
        }
      } finally {
        if (!cancelled) {
          setLoadingCustody(false);
        }
      }
    }

    loadCustody();

    return () => {
      cancelled = true;
    };
  }, [documentId]);

  /**
   * Real backend integrity verification.
   */
  async function handleReverify() {
    if (!documentId) {
      return;
    }

    setVerifying(true);
    setVerifyMessage("");
    setError("");

    try {
      const result =
        await verifyIntegrity(
          documentId
        );

      setDoc((previous) => {
        if (!previous) {
          return previous;
        }

        return {
          ...previous,
          currentHash:
            result.currentHash,
          integrityStatus:
            result.match
              ? "verified"
              : "mismatch",
        };
      });

      setVerifyMessage(
        result.match
          ? "Integrity verified successfully. The current hash matches the stored SHA-256 hash."
          : "Integrity mismatch detected. The current hash does not match the stored SHA-256 hash."
      );
    } catch (err) {
      console.error(
        "Integrity verification failed:",
        err
      );

      setError(
        err instanceof Error
          ? err.message
          : "Integrity verification failed."
      );
    } finally {
      setVerifying(false);
    }
  }

  /**
   * Secure backend download.
   */
  async function handleDownload() {
    if (!documentId) {
      return;
    }

    setDownloading(true);
    setError("");

    try {
      await downloadDocument(
        documentId
      );
    } catch (err) {
      console.error(
        "Document download failed:",
        err
      );

      setError(
        err instanceof Error
          ? err.message
          : "Unable to download document."
      );
    } finally {
      setDownloading(false);
    }
  }

  if (doc === undefined) {
    return (
      <LoadingState
        label="Loading document…"
      />
    );
  }

  if (doc === null) {
    return (
      <div className="space-y-4">
        {error && (
          <p
            role="alert"
            className="rounded-lg bg-status-criticalBg px-4 py-3 text-sm text-status-critical"
          >
            {error}
          </p>
        )}

        <EmptyState
          kind="unauthorized"
          description="This document doesn't exist or you don't have permission to view it."
        />
      </div>
    );
  }

  const isVerified =
    doc.integrityStatus ===
    "verified";

  const isMismatch =
    doc.integrityStatus ===
    "mismatch";

  /**
   * Permission-aware UI.
   *
   * The backend remains the final security barrier.
   * These flags only control which actions are visible
   * to the current user.
   */
  const documentPermissions = (
    doc as DocumentRecord & {
      permissions?: unknown;
    }
  ).permissions;

  const permissions =
    Array.isArray(documentPermissions)
      ? documentPermissions.map((permission: unknown) =>
          String(permission).toLowerCase()
        )
      : ["view"];

  const canDownload =
    permissions.includes("download");

  const canVerify =
    permissions.includes("verify");

  const canUpdate =
    permissions.includes("update");

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-wrap items-center gap-3">
        <FileText
          className="text-ink-500"
          size={20}
        />

        <h1 className="text-lg font-semibold text-ink-900">
          {doc.name}
        </h1>

        <span className="text-sm text-ink-500">
          v{doc.version}
        </span>

        <StatusBadge
          tone={
            isVerified
              ? "verified"
              : doc.integrityStatus ===
                  "review"
                ? "review"
                : "critical"
          }
          label={
            isVerified
              ? "VERIFIED"
              : doc.integrityStatus ===
                  "review"
                ? "REVIEW"
                : "MISMATCH"
          }
        />
      </div>

      {/* Error message */}
      {error && (
        <p
          role="alert"
          className="rounded-lg bg-status-criticalBg px-4 py-3 text-sm text-status-critical"
        >
          {error}
        </p>
      )}

      {/* Integrity verification result */}
      {verifyMessage && (
        <p
          role="status"
          className={`rounded-lg px-4 py-3 text-sm ${
            isMismatch
              ? "bg-status-criticalBg text-status-critical"
              : "bg-status-verifiedBg text-status-verified"
          }`}
        >
          {verifyMessage}
        </p>
      )}

      {/* Tabs */}
      <div className="flex gap-1 border-b border-surface-border">
        {TABS.map((t) => (
          <button
            key={t}
            type="button"
            onClick={() =>
              setTab(t)
            }
            className={`px-4 py-2 text-sm font-medium ${
              tab === t
                ? "border-b-2 border-navy-700 text-navy-800"
                : "text-ink-500 hover:text-ink-900"
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {/* ================================================================ */}
      {/* VIEW TAB                                                         */}
      {/* ================================================================ */}

      {tab === "View" && (
        <div className="grid gap-4 lg:grid-cols-3">
          {/* Secure document preview placeholder */}
          <div className="flex h-96 items-center justify-center rounded-card border border-surface-border bg-surface-card text-sm text-ink-400 lg:col-span-2">
            PDF preview renders here once the backend returns a secure,
            time-limited file URL.
          </div>

          {/* Document security */}
          <div className="rounded-card border border-surface-border bg-surface-card p-5 shadow-card">
            <h3 className="mb-4 text-sm font-semibold text-ink-900">
              Document Security
            </h3>

            <dl className="space-y-3 text-sm">
              {/* Integrity */}
              <Row label="Integrity">
                <StatusBadge
                  tone={
                    isVerified
                      ? "verified"
                      : "critical"
                  }
                  label={
                    isVerified
                      ? "VERIFIED"
                      : "MISMATCH"
                  }
                />
              </Row>

              {/* Encryption */}
              <Row label="Encryption">
                <StatusBadge
                  tone={
                    doc.encryptionActive
                      ? "verified"
                      : "critical"
                  }
                  label={
                    doc.encryptionActive
                      ? "ACTIVE"
                      : "INACTIVE"
                  }
                />
              </Row>

              {/* Version */}
              <PlainRow
                label="Version"
                value={`v${doc.version}`}
              />

              {/* Hash */}
              <PlainRow
                label="SHA-256"
                value={
                  doc.currentHash ||
                  doc.storedHash ||
                  "Not available"
                }
                mono
              />

              {/* Uploaded by */}
              <PlainRow
                label="Uploaded by"
                value={
                  doc.uploadedBy ||
                  "Unknown"
                }
              />

              {/* Uploaded */}
              <PlainRow
                label="Uploaded"
                value={
                  doc.uploadedAt
                    ? formatDateTime(
                        doc.uploadedAt
                      )
                    : "Unknown"
                }
              />

              {/* Blockchain */}
              <Row label="Blockchain">
                <StatusBadge
                  tone={
                    doc.blockchainRecorded
                      ? "verified"
                      : "review"
                  }
                  label={
                    doc.blockchainRecorded
                      ? "RECORDED"
                      : "PENDING"
                  }
                />
              </Row>
            </dl>

            {/* ========================================================== */}
            {/* PERMISSION-AWARE ACTIONS                                  */}
            {/* ========================================================== */}

            <div className="mt-5 flex flex-col gap-2">
              {/* Download
                  Visible only when user has download permission.
               */}
              {canDownload && (
                <button
                  type="button"
                  onClick={
                    handleDownload
                  }
                  disabled={
                    downloading
                  }
                  className="flex items-center justify-center gap-2 rounded-lg border border-surface-border py-2 text-sm font-medium text-ink-700 hover:bg-surface-muted disabled:opacity-60"
                >
                  {downloading ? (
                    <Loader2
                      className="animate-spin"
                      size={15}
                    />
                  ) : (
                    <Download
                      size={15}
                    />
                  )}

                  {downloading
                    ? "Preparing…"
                    : "Download"}
                </button>
              )}

              {/* Verify integrity
                  Visible only when user has verify permission.
               */}
              {canVerify && (
                <motion.button
                  type="button"
                  whileHover={{
                    scale: 1.01,
                  }}
                  whileTap={{
                    scale: 0.98,
                  }}
                  onClick={
                    handleReverify
                  }
                  disabled={
                    verifying
                  }
                  className="flex items-center justify-center gap-2 rounded-lg bg-navy-800 py-2 text-sm font-medium text-white hover:bg-navy-700 disabled:opacity-60"
                >
                  <motion.span
                    animate={
                      verifying
                        ? {
                            rotate: 360,
                          }
                        : {}
                    }
                    transition={
                      verifying
                        ? {
                            repeat:
                              Infinity,
                            duration: 0.8,
                            ease: "linear",
                          }
                        : {}
                    }
                  >
                    <ShieldCheck
                      size={15}
                    />
                  </motion.span>

                  {verifying
                    ? "Verifying…"
                    : "Verify Integrity"}
                </motion.button>
              )}

              {/* Update
                  There is currently no Update UI/action implemented
                  on this page. We only keep the permission available
                  for future use.
               */}
              {canUpdate && (
                <div className="hidden">
                  Update permission available
                </div>
              )}

              {/* No additional actions */}
              {!canDownload &&
                !canVerify && (
                  <p className="rounded-lg bg-surface-muted px-3 py-2 text-center text-xs text-ink-500">
                    You have view-only access to this document.
                  </p>
                )}
            </div>
          </div>
        </div>
      )}

      {/* ================================================================ */}
      {/* VERSIONS TAB                                                     */}
      {/* ================================================================ */}

      {tab === "Versions" && (
        <EmptyState
          kind="empty"
          description="Previous versions of this document will be listed here, each with its own hash and audit trail."
        />
      )}

      {/* ================================================================ */}
      {/* CHAIN OF CUSTODY TAB                                             */}
      {/* ================================================================ */}

      {tab === "Chain of Custody" &&
        (loadingCustody ? (
          <LoadingState
            label="Loading custody history…"
          />
        ) : custody.length === 0 ? (
          <EmptyState
            kind="empty"
            description="No custody events recorded yet."
          />
        ) : (
          <div className="rounded-card border border-surface-border bg-surface-card p-2 shadow-card">
            <CustodyChain
              events={custody}
            />
          </div>
        ))}

      {/* ================================================================ */}
      {/* DETAILS TAB                                                      */}
      {/* ================================================================ */}

      {tab === "Details" && (
        <div className="rounded-card border border-surface-border bg-surface-card p-5 shadow-card">
          <dl className="grid gap-3 text-sm sm:grid-cols-2">
            <PlainRow
              label="Document ID"
              value={doc.id}
              mono
            />

            <PlainRow
              label="Case"
              value={`#${doc.caseId}`}
            />

            <PlainRow
              label="Type"
              value={doc.type}
            />

            <PlainRow
              label="Sensitivity"
              value={doc.sensitivity
                .replace(
                  "_",
                  " "
                )
                .replace(
                  /\b\w/g,
                  (char) =>
                    char.toUpperCase()
                )}
            />

            <PlainRow
              label="Stored SHA-256"
              value={
                doc.storedHash ||
                "Not available"
              }
              mono
            />

            <PlainRow
              label="Current SHA-256"
              value={
                doc.currentHash ||
                "Not available"
              }
              mono
            />

            <PlainRow
              label="Encryption"
              value={
                doc.encryptionActive
                  ? "Active"
                  : "Inactive"
              }
            />

            <PlainRow
              label="Blockchain"
              value={
                doc.blockchainRecorded
                  ? "Recorded"
                  : "Pending"
              }
            />

            <PlainRow
              label="Your Permissions"
              value={
                permissions
                  .map(
                    (permission: string) =>
                      permission
                        .replace(
                          "_",
                          " "
                        )
                        .replace(
                          /\b\w/g,
                          (char) =>
                            char.toUpperCase()
                        )
                  )
                  .join(", ") ||
                "View"
              }
            />
          </dl>
        </div>
      )}
    </div>
  );
}

/**
 * Reusable status row.
 */
function Row({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-surface-border pb-2 last:border-0">
      <dt className="text-ink-500">
        {label}
      </dt>

      <dd>
        {children}
      </dd>
    </div>
  );
}

/**
 * Reusable text row.
 */
function PlainRow({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-surface-border pb-2 last:border-0">
      <dt className="text-ink-500">
        {label}
      </dt>

      <dd
        className={`break-all text-right font-medium text-ink-900 ${
          mono
            ? "font-mono text-xs"
            : ""
        }`}
      >
        {value}
      </dd>
    </div>
  );
}