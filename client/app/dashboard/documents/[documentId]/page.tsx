"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { motion } from "framer-motion";

import {
  Download,
  ShieldCheck,
  FileText,
  Loader2,
  ZoomIn,
  ZoomOut,
  RotateCcw,
} from "lucide-react";

import {
  getDocumentById,
  getCustodyEvents,
  verifyIntegrity,
  downloadDocument,
  getDocumentPreviewUrl,
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

  const [previewUrl, setPreviewUrl] =
    useState<string | null>(null);

  const [previewType, setPreviewType] =
    useState<string>("");

  const [previewLoading, setPreviewLoading] =
    useState(false);

  const [previewError, setPreviewError] =
    useState("");

  const [zoom, setZoom] =
    useState(1);

  const [error, setError] =
    useState("");

  const [verifyMessage, setVerifyMessage] =
    useState("");

  // ============================================================
  // LOAD DOCUMENT
  // ============================================================

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

  // ============================================================
  // LOAD CUSTODY
  // ============================================================

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

  // ============================================================
  // LOAD SECURE PREVIEW
  // ============================================================

  useEffect(() => {
    if (!documentId) {
      return;
    }

    let cancelled = false;
    let objectUrl: string | null = null;

    async function loadPreview() {
      try {
        setPreviewLoading(true);
        setPreviewError("");
        setPreviewUrl(null);
        setPreviewType("");
        setZoom(1);

        const preview =
          await getDocumentPreviewUrl(
            documentId
          );

        if (cancelled) {
          window.URL.revokeObjectURL(
            preview.url
          );

          return;
        }

        objectUrl = preview.url;

        setPreviewUrl(
          preview.url
        );

        setPreviewType(
          preview.contentType
        );
      } catch (err) {
        console.error(
          "Failed to load document preview:",
          err
        );

        if (!cancelled) {
          setPreviewError(
            err instanceof Error
              ? err.message
              : "Unable to load document preview."
          );
        }
      } finally {
        if (!cancelled) {
          setPreviewLoading(false);
        }
      }
    }

    loadPreview();

    return () => {
      cancelled = true;

      if (objectUrl) {
        window.URL.revokeObjectURL(
          objectUrl
        );
      }
    };
  }, [documentId]);

  // ============================================================
  // VERIFY INTEGRITY
  // ============================================================

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

  // ============================================================
  // DOWNLOAD
  // ============================================================

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

  // ============================================================
  // LOADING / ERROR
  // ============================================================

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

  const isPdf =
    previewType.includes(
      "application/pdf"
    ) ||
    /\.pdf$/i.test(
      doc.name
    );

  const isImage =
    previewType.startsWith(
      "image/"
    ) ||
    /\.(png|jpg|jpeg|gif|webp)$/i.test(
      doc.name
    );

  return (
    <div className="space-y-5">

      {/* ======================================================
          HEADER
      ======================================================= */}

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

      {/* ======================================================
          ERROR
      ======================================================= */}

      {error && (
        <p
          role="alert"
          className="rounded-lg bg-status-criticalBg px-4 py-3 text-sm text-status-critical"
        >
          {error}
        </p>
      )}

      {/* ======================================================
          VERIFICATION MESSAGE
      ======================================================= */}

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

      {/* ======================================================
          TABS
      ======================================================= */}

      <div className="flex gap-1 border-b border-surface-border">
        {TABS.map((t) => (
          <button
            key={t}
            type="button"
            onClick={() =>
              setTab(t)
            }
            className={`px-4 py-2 text-sm font-medium transition ${
              tab === t
                ? "border-b-2 border-navy-700 text-navy-800"
                : "text-ink-500 hover:text-ink-900"
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {/* ======================================================
          VIEW TAB
      ======================================================= */}

      {tab === "View" && (
        <div className="grid gap-4 lg:grid-cols-3">

          {/* ==================================================
              DOCUMENT PREVIEW
          =================================================== */}

          <div className="overflow-hidden rounded-card border border-surface-border bg-surface-card shadow-card lg:col-span-2">

            {/* Preview Header */}
            <div className="flex items-center justify-between border-b border-surface-border bg-surface-muted px-4 py-3">
              <div className="flex items-center gap-2">
                <FileText
                  size={16}
                  className="text-ink-500"
                />

                <span className="text-sm font-medium text-ink-700">
                  Document Preview
                </span>
              </div>

              {/* Zoom Controls */}
              {isImage && previewUrl && (
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() =>
                      setZoom((value) =>
                        Math.max(
                          0.5,
                          value - 0.1
                        )
                      )
                    }
                    className="rounded-md p-1.5 text-ink-500 hover:bg-white hover:text-ink-900"
                    title="Zoom out"
                  >
                    <ZoomOut size={16} />
                  </button>

                  <span className="min-w-[45px] text-center text-xs text-ink-500">
                    {Math.round(
                      zoom * 100
                    )}
                    %
                  </span>

                  <button
                    type="button"
                    onClick={() =>
                      setZoom((value) =>
                        Math.min(
                          2,
                          value + 0.1
                        )
                      )
                    }
                    className="rounded-md p-1.5 text-ink-500 hover:bg-white hover:text-ink-900"
                    title="Zoom in"
                  >
                    <ZoomIn size={16} />
                  </button>

                  <button
                    type="button"
                    onClick={() =>
                      setZoom(1)
                    }
                    className="rounded-md p-1.5 text-ink-500 hover:bg-white hover:text-ink-900"
                    title="Reset zoom"
                  >
                    <RotateCcw
                      size={15}
                    />
                  </button>
                </div>
              )}
            </div>

            {/* Preview Area */}
            <div className="flex min-h-[620px] items-center justify-center overflow-auto bg-slate-100 p-4">

              {/* Loading */}
              {previewLoading && (
                <div className="flex flex-col items-center gap-3 text-ink-500">
                  <Loader2
                    size={28}
                    className="animate-spin text-navy-700"
                  />

                  <p className="text-sm">
                    Loading secure preview…
                  </p>
                </div>
              )}

              {/* Error */}
              {!previewLoading &&
                previewError && (
                  <div className="max-w-md rounded-xl border border-status-critical/20 bg-white p-6 text-center shadow-sm">
                    <FileText
                      size={36}
                      className="mx-auto mb-3 text-ink-400"
                    />

                    <p className="font-medium text-ink-900">
                      Preview unavailable
                    </p>

                    <p className="mt-1 text-sm text-ink-500">
                      {previewError}
                    </p>

                    <button
                      type="button"
                      onClick={
                        handleDownload
                      }
                      className="mt-4 rounded-lg bg-navy-800 px-4 py-2 text-sm font-medium text-white hover:bg-navy-700"
                    >
                      Download Document
                    </button>
                  </div>
                )}

              {/* PDF */}
              {!previewLoading &&
                !previewError &&
                previewUrl &&
                isPdf && (
                  <iframe
                    src={previewUrl}
                    title={`Preview of ${doc.name}`}
                    className="h-[600px] w-full rounded-lg border border-surface-border bg-white shadow-sm"
                  />
                )}

              {/* Image */}
              {!previewLoading &&
                !previewError &&
                previewUrl &&
                isImage && (
                  <div className="flex min-h-[580px] w-full items-center justify-center overflow-auto rounded-lg bg-white p-6 shadow-sm">
                    <img
                      src={previewUrl}
                      alt={`Preview of ${doc.name}`}
                      className="max-h-[560px] max-w-full object-contain transition-transform duration-200"
                      style={{
                        transform: `scale(${zoom})`,
                      }}
                    />
                  </div>
                )}

              {/* Unsupported file */}
              {!previewLoading &&
                !previewError &&
                previewUrl &&
                !isPdf &&
                !isImage && (
                  <div className="max-w-md rounded-xl border border-surface-border bg-white p-8 text-center shadow-sm">
                    <FileText
                      size={40}
                      className="mx-auto mb-3 text-ink-400"
                    />

                    <h3 className="font-semibold text-ink-900">
                      Preview not supported
                    </h3>

                    <p className="mt-1 text-sm text-ink-500">
                      This file type cannot be previewed
                      directly in the browser.
                    </p>

                    <button
                      type="button"
                      onClick={
                        handleDownload
                      }
                      className="mt-4 rounded-lg bg-navy-800 px-4 py-2 text-sm font-medium text-white hover:bg-navy-700"
                    >
                      Download Document
                    </button>
                  </div>
                )}
            </div>

            {/* Preview Footer */}
            {previewUrl && (
              <div className="flex items-center justify-between border-t border-surface-border bg-white px-4 py-2 text-xs text-ink-500">
                <span>
                  Secure document preview
                </span>

                <span>
                  {isPdf
                    ? "PDF"
                    : isImage
                      ? "Image"
                      : "Document"}
                </span>
              </div>
            )}
          </div>

          {/* ==================================================
              DOCUMENT SECURITY
          =================================================== */}

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

              {/* Uploaded By */}
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

            {/* Actions */}
            <div className="mt-5 flex flex-col gap-2">

              {/* Download */}
              <button
                type="button"
                onClick={
                  handleDownload
                }
                disabled={
                  downloading
                }
                className="
                  flex
                  items-center
                  justify-center
                  gap-2
                  rounded-lg
                  border
                  border-surface-border
                  py-2
                  text-sm
                  font-medium
                  text-ink-700
                  transition
                  hover:bg-surface-muted
                  disabled:opacity-60
                "
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

              {/* Verify Integrity */}
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
                className="
                  flex
                  items-center
                  justify-center
                  gap-2
                  rounded-lg
                  bg-navy-800
                  py-2
                  text-sm
                  font-medium
                  text-white
                  transition
                  hover:bg-navy-700
                  disabled:opacity-60
                "
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
            </div>
          </div>
        </div>
      )}

      {/* ======================================================
          VERSIONS TAB
      ======================================================= */}

      {tab === "Versions" && (
        <EmptyState
          kind="empty"
          description="Previous versions of this document will be listed here, each with its own hash and audit trail."
        />
      )}

      {/* ======================================================
          CHAIN OF CUSTODY TAB
      ======================================================= */}

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

      {/* ======================================================
          DETAILS TAB
      ======================================================= */}

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
          </dl>
        </div>
      )}
    </div>
  );
}

/**
 * ================================================================
 * REUSABLE STATUS ROW
 * ================================================================
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
 * ================================================================
 * REUSABLE TEXT ROW
 * ================================================================
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
        className={`max-w-[65%] break-all text-right font-medium text-ink-900 ${
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