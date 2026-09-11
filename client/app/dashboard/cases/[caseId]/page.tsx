"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";

import {
  getCaseById,
  getDocuments,
  getAuditEvents,
} from "@/lib/api";

import type {
  Case,
  DocumentRecord,
  AuditEvent,
} from "@/lib/types";

import DocumentTable from "@/components/DocumentTable";
import StatusBadge from "@/components/StatusBadge";
import { LoadingState } from "@/components/LoadingState";
import EmptyState from "@/components/EmptyState";
import { formatDate, formatDateTime } from "@/lib/format";

const TABS = [
  "Overview",
  "Documents",
  "People",
  "Activity",
] as const;

const STATUS_TONE = {
  active: "verified",
  review: "review",
  closed: "info",
} as const;

type CaseAssignmentView = {
  id?: string;
  userId?: string;
  assignedRole?: string;
  assignedAt?: string;
  assignedBy?: string;
  user?: {
    id?: string;
    customUserId?: string;
    fullName?: string;
    role?: string;
    badgeNumber?: string;
    email?: string;
  };
};

type PersonView = {
  id: string;
  name: string;
  role: string;
  badgeNumber?: string;
  email?: string;
  source?: string;
};

type ActivityView = {
  id: string;
  action: string;
  user: string;
  documentName: string;
  timestamp: string;
  hash?: string;
  status?: string;
};

export default function CaseDetailsPage() {
  const params =
    useParams<{
      caseId: string;
    }>();

  const caseId =
    params?.caseId;

  const [item, setItem] =
    useState<Case | null | undefined>(
      undefined
    );

  const [documents, setDocuments] =
    useState<DocumentRecord[]>(
      []
    );

  const [auditEvents, setAuditEvents] =
    useState<AuditEvent[]>(
      []
    );

  const [tab, setTab] =
    useState<
      (typeof TABS)[number]
    >("Overview");

  const [error, setError] =
    useState("");

  const [documentsError, setDocumentsError] =
    useState(false);

  const [activityLoading, setActivityLoading] =
    useState(false);

  const [activityError, setActivityError] =
    useState(false);

  useEffect(() => {
    if (!caseId) {
      setError(
        "Invalid case identifier."
      );

      setItem(null);
      return;
    }

    let mounted = true;

    async function loadCase() {
      setError("");
      setItem(undefined);

      try {
        const caseData =
          await getCaseById(
            caseId
          );

        if (!mounted) {
          return;
        }

        setItem(caseData);

        if (!caseData) {
          setError(
            "This case doesn't exist or you don't have access to it."
          );
        }
      } catch (err) {
        if (!mounted) {
          return;
        }

        console.error(
          "Failed to load case:",
          err
        );

        setItem(null);

        setError(
          err instanceof Error
            ? err.message
            : "Could not load this case."
        );
      }
    }

    async function loadDocuments() {
      setDocumentsError(false);

      try {
        const caseDocuments =
          await getDocuments({
            caseId,
          });

        if (!mounted) {
          return;
        }

        setDocuments(
          caseDocuments
        );
      } catch (err) {
        if (!mounted) {
          return;
        }

        console.error(
          "Failed to load case documents:",
          err
        );

        setDocuments([]);

        setDocumentsError(
          true
        );
      }
    }

    async function loadActivity() {
      setActivityLoading(true);
      setActivityError(false);

      try {
        const events =
          await getAuditEvents();

        if (!mounted) {
          return;
        }

        setAuditEvents(
          Array.isArray(events)
            ? events
            : []
        );
      } catch (err) {
        if (!mounted) {
          return;
        }

        console.error(
          "Failed to load case activity:",
          err
        );

        setAuditEvents([]);
        setActivityError(true);
      } finally {
        if (mounted) {
          setActivityLoading(false);
        }
      }
    }

    loadCase();
    loadDocuments();
    loadActivity();

    return () => {
      mounted = false;
    };
  }, [caseId]);

  /**
   * ==========================================================
   * CASE DOCUMENT IDS
   * ==========================================================
   */

  const caseDocumentIds =
    useMemo(() => {
      const ids = new Set<string>();

      for (
        const document of documents
      ) {
        if (document?.id) {
          ids.add(
            String(
              document.id
            )
          );
        }
      }

      return ids;
    }, [documents]);

  /**
   * ==========================================================
   * FILTER CASE ACTIVITY
   * ==========================================================
   *
   * A real audit event can contain caseId directly.
   *
   * For document-related events, we also match against
   * the documents belonging to this case.
   */
  const filteredAuditEvents =
    useMemo(() => {
      return auditEvents.filter(
        (event) => {
          const rawEvent =
            event as AuditEvent & {
              caseId?: string;
              documentId?: string;
            };

          /*
           * Direct case match.
           */
          if (
            rawEvent.caseId &&
            String(
              rawEvent.caseId
            ) === String(caseId)
          ) {
            return true;
          }

          /*
           * Document-level case activity.
           */
          if (
            rawEvent.documentId &&
            caseDocumentIds.has(
              String(
                rawEvent.documentId
              )
            )
          ) {
            return true;
          }

          return false;
        }
      );
    }, [
      auditEvents,
      caseDocumentIds,
      caseId,
    ]);

  /**
   * ==========================================================
   * PEOPLE
   * ==========================================================
   *
   * Prefer the actual active CaseAssignment data returned
   * by the backend.
   *
   * The investigating officer is also included as a fallback.
   *
   * Audit users are included when the backend provides them.
   */
  const people =
    useMemo<PersonView[]>(() => {
      if (!item) {
        return [];
      }

      const result: PersonView[] = [];
      const seen =
        new Set<string>();

      const addPerson = (
        person: PersonView | null
      ) => {
        if (!person) {
          return;
        }

        const key =
          person.id ||
          `${person.name}-${person.role}`;

        if (seen.has(key)) {
          return;
        }

        seen.add(key);
        result.push(person);
      };

      const rawCase =
        item as Case & {
          assignments?: CaseAssignmentView[];
          caseAssignments?: CaseAssignmentView[];

          assignedOfficer?: {
            id?: string;
            customUserId?: string;
            fullName?: string;
            role?: string;
            badgeNumber?: string;
            email?: string;
          } | null;
        };

      /**
       * ------------------------------------------------------
       * ACTIVE CASE ASSIGNMENTS
       * ------------------------------------------------------
       */
      const assignments =
        rawCase.assignments ??
        rawCase.caseAssignments ??
        [];

      for (
        const assignment of assignments
      ) {
        const user =
          assignment?.user;

        if (!user) {
          continue;
        }

        addPerson({
          id:
            user.id ??
            user.customUserId ??
            `assignment-${result.length}`,

          name:
            user.fullName ??
            user.customUserId ??
            "Unknown User",

          role:
            formatRole(
              assignment.assignedRole ??
                user.role
            ),

          badgeNumber:
            user.badgeNumber,

          email:
            user.email,

          source:
            "Active case assignment",
        });
      }

      /**
       * ------------------------------------------------------
       * INVESTIGATING OFFICER FALLBACK
       * ------------------------------------------------------
       */
      const investigatingOfficer =
        rawCase.assignedOfficer;

      if (investigatingOfficer) {
        addPerson({
          id:
            investigatingOfficer.id ??
            investigatingOfficer.customUserId ??
            "investigating-officer",

          name:
            investigatingOfficer.fullName ??
            investigatingOfficer.customUserId ??
            "Unknown Officer",

          role:
            formatRole(
              investigatingOfficer.role ??
                "investigator"
            ),

          badgeNumber:
            investigatingOfficer.badgeNumber,

          email:
            investigatingOfficer.email,

          source:
            "Investigating officer",
        });
      }

      /**
       * ------------------------------------------------------
       * USERS FROM CASE AUDIT ACTIVITY
       * ------------------------------------------------------
       */
      for (
        const event of filteredAuditEvents
      ) {
        if (!event.user) {
          continue;
        }

        addPerson({
          id:
            `audit-${event.user}`,

          name:
            event.user,

          role:
            "Case activity",

          source:
            "Audit activity",
        });
      }

      return result;
    }, [
      item,
      filteredAuditEvents,
    ]);

  /**
   * ==========================================================
   * ACTIVITY
   * ==========================================================
   */

  const activity =
    useMemo<ActivityView[]>(() => {
      return (
        filteredAuditEvents
          .slice()
          .sort(
            (a, b) =>
              new Date(
                b.timestamp
              ).getTime() -
              new Date(
                a.timestamp
              ).getTime()
          )
          .map(
            (event) => ({
              id: event.id,

              action:
                formatAction(
                  event.action
                ),

              user:
                event.user ||
                "System",

              documentName:
                event.documentName ||
                "Case activity",

              timestamp:
                event.timestamp,

              hash:
                event.documentHash ||
                undefined,

              status:
                event.ledgerStatus ||
                "pending",
            })
          )
      );
    }, [
      filteredAuditEvents,
    ]);

  /**
   * ==========================================================
   * LOADING / ERROR
   * ==========================================================
   */

  if (item === undefined) {
    return (
      <LoadingState
        label="Loading case…"
      />
    );
  }

  if (item === null) {
    return (
      <EmptyState
        kind="unauthorized"
        description={
          error ||
          "This case doesn't exist or you don't have access to it."
        }
      />
    );
  }

  /**
   * ==========================================================
   * MAIN PAGE
   * ==========================================================
   */

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-xl font-semibold text-ink-900">
          CASE #{item.id}
        </h1>

        <span className="text-ink-500">
          {item.title}
        </span>

        <StatusBadge
          tone={
            STATUS_TONE[
              item.status
            ]
          }
          label={item.status.toUpperCase()}
        />
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-surface-border">
        {TABS.map(
          (tabName) => (
            <button
              key={tabName}
              type="button"
              onClick={() =>
                setTab(
                  tabName
                )
              }
              className={`px-4 py-2 text-sm font-medium ${
                tab === tabName
                  ? "border-b-2 border-navy-700 text-navy-800"
                  : "text-ink-500 hover:text-ink-900"
              }`}
            >
              {tabName}
            </button>
          )
        )}
      </div>

      {/* ====================================================
          OVERVIEW
          ==================================================== */}
      {tab === "Overview" && (
        <div className="grid gap-4 sm:grid-cols-2">
          {/* Case information */}
          <div className="rounded-card border border-surface-border bg-surface-card p-5 shadow-card">
            <dl className="space-y-3 text-sm">
              <Row
                label="FIR Number"
                value={
                  item.firNumber ||
                  "Not available"
                }
              />

              <Row
                label="Police Station"
                value={
                  item.policeStation ||
                  "Not available"
                }
              />

              <Row
                label="Investigating Officer"
                value={
                  item.investigatingOfficer ||
                  "Not assigned"
                }
              />

              <Row
                label="Created"
                value={formatDate(
                  item.createdAt
                )}
              />
            </dl>
          </div>

          {/* Document summary */}
          <div className="rounded-card border border-surface-border bg-surface-card p-5 shadow-card">
            <h3 className="mb-3 text-sm font-semibold text-ink-900">
              Document Summary
            </h3>

            <dl className="grid grid-cols-2 gap-3 text-sm">
              <Row
                label="FIR"
                value={
                  item.documentSummary
                    ?.fir ?? 0
                }
              />

              <Row
                label="Investigation Reports"
                value={
                  item.documentSummary
                    ?.investigationReports ??
                  0
                }
              />

              <Row
                label="Witness Statements"
                value={
                  item.documentSummary
                    ?.witnessStatements ??
                  0
                }
              />

              <Row
                label="Forensic Reports"
                value={
                  item.documentSummary
                    ?.forensicReports ??
                  0
                }
              />

              <Row
                label="Court Documents"
                value={
                  item.documentSummary
                    ?.courtDocuments ??
                  0
                }
              />

              <Row
                label="Evidence Files"
                value={
                  item.documentSummary
                    ?.evidenceFiles ??
                  0
                }
              />
            </dl>
          </div>
        </div>
      )}

      {/* ====================================================
          DOCUMENTS
          ==================================================== */}
      {tab === "Documents" &&
        (documentsError ? (
          <EmptyState
            kind="error"
            description="Could not load documents for this case."
          />
        ) : documents.length ===
          0 ? (
          <EmptyState
            kind="empty"
            description="No documents have been uploaded to this case yet."
          />
        ) : (
          <DocumentTable
            documents={
              documents
            }
          />
        ))}

      {/* ====================================================
          PEOPLE
          ==================================================== */}
      {tab === "People" && (
        people.length ===
        0 ? (
          <EmptyState
            kind="empty"
            description="No case personnel could be loaded."
          />
        ) : (
          <div className="rounded-card border border-surface-border bg-surface-card p-5 shadow-card">
            <div className="mb-5">
              <h3 className="text-base font-semibold text-ink-900">
                Case Personnel
              </h3>

              <p className="mt-1 text-sm text-ink-500">
                Authorized personnel associated
                with this case.
              </p>
            </div>

            <div className="divide-y divide-surface-border">
              {people.map(
                (person) => (
                  <div
                    key={
                      person.id
                    }
                    className="flex flex-wrap items-center justify-between gap-4 py-4 first:pt-0 last:pb-0"
                  >
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-navy-50">
                        <span className="text-sm font-semibold text-navy-800">
                          {getInitials(
                            person.name
                          )}
                        </span>
                      </div>

                      <div>
                        <p className="font-medium text-ink-900">
                          {person.name}
                        </p>

                        <p className="text-sm text-ink-500">
                          {person.role}
                        </p>

                        {person.badgeNumber && (
                          <p className="text-xs text-ink-400">
                            Badge:{" "}
                            {
                              person.badgeNumber
                            }
                          </p>
                        )}

                        {person.email && (
                          <p className="text-xs text-ink-400">
                            {
                              person.email
                            }
                          </p>
                        )}
                      </div>
                    </div>

                    {person.source && (
                      <span className="rounded-full bg-surface-muted px-3 py-1 text-xs font-medium text-ink-500">
                        {
                          person.source
                        }
                      </span>
                    )}
                  </div>
                )
              )}
            </div>
          </div>
        )
      )}

      {/* ====================================================
          ACTIVITY
          ==================================================== */}
      {tab === "Activity" && (
        activityLoading ? (
          <LoadingState
            label="Loading case activity…"
          />
        ) : activityError ? (
          <EmptyState
            kind="error"
            description="Could not load the case audit activity."
          />
        ) : activity.length ===
          0 ? (
          <EmptyState
            kind="empty"
            description="No audit activity has been recorded for this case yet."
          />
        ) : (
          <div className="rounded-card border border-surface-border bg-surface-card p-5 shadow-card">
            <div className="mb-5">
              <h3 className="text-base font-semibold text-ink-900">
                Case Activity
              </h3>

              <p className="mt-1 text-sm text-ink-500">
                Document and security events
                recorded for this case.
              </p>
            </div>

            <div className="relative">
              {/* Timeline line */}
              <div className="absolute left-4 top-4 bottom-4 w-px bg-surface-border" />

              <div className="space-y-5">
                {activity.map(
                  (event) => (
                    <ActivityItem
                      key={
                        event.id
                      }
                      event={
                        event
                      }
                    />
                  )
                )}
              </div>
            </div>
          </div>
        )
      )}
    </div>
  );
}

/**
 * ============================================================
 * ACTIVITY ITEM
 * ============================================================
 */

function ActivityItem({
  event,
}: {
  event: ActivityView;
}) {
  const status =
    String(
      event.status ||
        ""
    ).toLowerCase();

  const statusClasses =
    status ===
    "verified"
      ? "bg-status-verifiedBg text-status-verified"
      : status ===
          "flagged"
        ? "bg-status-criticalBg text-status-critical"
        : "bg-surface-muted text-ink-500";

  return (
    <div className="relative flex gap-4">
      {/* Timeline dot */}
      <div className="relative z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-surface-border bg-surface-card">
        <div className="h-2.5 w-2.5 rounded-full bg-navy-700" />
      </div>

      <div className="min-w-0 flex-1 rounded-lg border border-surface-border bg-surface-muted/40 p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="font-medium text-ink-900">
              {event.action}
            </p>

            <p className="mt-1 text-sm text-ink-500">
              {event.user}
            </p>
          </div>

          <span className="text-xs text-ink-400">
            {formatDateTime(
              event.timestamp
            )}
          </span>
        </div>

        {event.documentName && (
          <div className="mt-3">
            <p className="text-sm text-ink-600">
              Document:{" "}
              <span className="font-medium text-ink-900">
                {
                  event.documentName
                }
              </span>
            </p>
          </div>
        )}

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <span
            className={`rounded-full px-2.5 py-1 text-xs font-semibold ${statusClasses}`}
          >
            {status ===
            "flagged"
              ? "FLAGGED"
              : status ===
                  "verified"
                ? "RECORDED"
                : "RECORDED"}
          </span>

          {event.hash && (
            <span className="max-w-full truncate rounded-md bg-surface-card px-2.5 py-1 font-mono text-[11px] text-ink-400">
              SHA-256:{" "}
              {event.hash}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * ============================================================
 * ROLE FORMATTER
 * ============================================================
 */

function formatRole(
  role?: string
) {
  if (!role) {
    return "Personnel";
  }

  return String(role)
    .replace(
      /_/g,
      " "
    )
    .trim()
    .split(" ")
    .filter(Boolean)
    .map(
      (part) =>
        part
          .charAt(0)
          .toUpperCase() +
        part
          .slice(1)
          .toLowerCase()
    )
    .join(" ");
}

/**
 * ============================================================
 * ACTION FORMATTER
 * ============================================================
 */

function formatAction(
  action?: string
) {
  if (!action) {
    return "Security Event";
  }

  const actionMap: Record<
    string,
    string
  > = {
    login_success:
      "Successful Login",

    login_failed:
      "Failed Login",

    document_uploaded:
      "Document Uploaded",

    document_verified:
      "Integrity Verified",

    document_viewed:
      "Document Viewed",

    document_downloaded:
      "Document Downloaded",

    version_created:
      "Document Version Created",

    document_transferred:
      "Document Transferred",

    permission_granted:
      "Permission Granted",

    permission_revoked:
      "Permission Revoked",

    access_denied:
      "Access Denied",

    integrity_mismatch:
      "Integrity Mismatch",

    document_tampered:
      "Document Tampered",
  };

  if (
    actionMap[action]
  ) {
    return actionMap[
      action
    ];
  }

  return String(action)
    .replace(
      /_/g,
      " "
    )
    .split(" ")
    .filter(Boolean)
    .map(
      (part) =>
        part
          .charAt(0)
          .toUpperCase() +
        part
          .slice(1)
          .toLowerCase()
    )
    .join(" ");
}

/**
 * ============================================================
 * INITIALS
 * ============================================================
 */

function getInitials(
  name: string
) {
  const parts =
    name
      .trim()
      .split(/\s+/)
      .filter(Boolean);

  if (
    parts.length ===
    0
  ) {
    return "U";
  }

  if (
    parts.length ===
    1
  ) {
    return parts[0]
      .slice(0, 2)
      .toUpperCase();
  }

  return (
    parts[0][0] +
    parts[
      parts.length - 1
    ][0]
  ).toUpperCase();
}

/**
 * ============================================================
 * SIMPLE ROW
 * ============================================================
 */

function Row({
  label,
  value,
}: {
  label: string;
  value:
    | string
    | number;
}) {
  return (
    <div className="flex justify-between gap-4 border-b border-surface-border pb-2 last:border-0">
      <dt className="text-ink-500">
        {label}
      </dt>

      <dd className="text-right font-medium text-ink-900">
        {value}
      </dd>
    </div>
  );
}