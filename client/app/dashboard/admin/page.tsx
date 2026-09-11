"use client";

import { useEffect, useState } from "react";
import {
  UserPlus,
  Shield,
  X,
  Loader2,
  Trash2,
} from "lucide-react";

import {
  getUsers,
  createUser,
  getCases,
  getDocuments,
  getDocumentPermissions,
  grantDocumentPermission,
  revokeDocumentPermission,
} from "@/lib/api";
import type { Role, User, Case } from "@/lib/types";

import { ROLE_LABELS } from "@/lib/permissions";
import { LoadingState } from "@/components/LoadingState";
import StatusBadge from "@/components/StatusBadge";

const ROLES = Object.keys(ROLE_LABELS) as Role[];

const PERMISSIONS = [
  "view",
  "download",
  "upload",
  "update",
  "verify",
] as const;

type PermissionAction = (typeof PERMISSIONS)[number];

type Permission = {
  id: string;
  documentId: string;
  userId: string;
  action: string;
  grantedById?: string;
  expiresAt?: string | null;
};

type DocumentOption = {
  id: string;
  documentId?: string;
  title?: string;
  name?: string;
  caseId?: string;
};

export default function AdminPage() {
  const [users, setUsers] = useState<User[] | null>(null);
  const [cases, setCases] = useState<Case[]>([]);
  const [loadingCases, setLoadingCases] = useState(true);

  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [permissionUser, setPermissionUser] =
    useState<User | null>(null);

  useEffect(() => {
    async function loadAdminData() {
      try {
        setError(null);

        const [loadedUsers, loadedCases] =
          await Promise.all([
            getUsers(),
            getCases(),
          ]);

        setUsers(loadedUsers);
        setCases(loadedCases);
      } catch (err) {
        console.error("[Admin] Load error:", err);

        setError(
          err instanceof Error
            ? err.message
            : "Failed to load administration data"
        );
      } finally {
        setLoadingCases(false);
      }
    }

    loadAdminData();
  }, []);

  return (
    <div className="space-y-6">
      {/* HEADER */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-ink-900">
            Administration
          </h1>

          <p className="text-sm text-ink-500">
            Users, roles, permissions and case assignment.
          </p>
        </div>

        <button
          type="button"
          onClick={() => setShowForm((v) => !v)}
          className="flex items-center gap-2 rounded-lg bg-navy-800 px-4 py-2 text-sm font-medium text-white hover:bg-navy-700"
        >
          <UserPlus size={16} />

          {showForm ? "Close" : "Create User"}
        </button>
      </div>

      {error && (
        <div className="rounded-lg border border-status-critical bg-status-criticalBg px-4 py-3 text-sm text-status-critical">
          {error}
        </div>
      )}

      {/* CREATE USER */}
      {showForm && (
        <CreateUserForm
          cases={cases}
          loadingCases={loadingCases}
          onCreated={(user) => {
            setUsers((prev) =>
              prev ? [user, ...prev] : [user]
            );

            setShowForm(false);
          }}
        />
      )}

      {/* USERS TABLE */}
      {!users ? (
        <LoadingState label="Loading users…" />
      ) : (
        <div className="overflow-x-auto rounded-card border border-surface-border bg-surface-card shadow-card">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-surface-border bg-surface-muted text-ink-500">
                <th className="px-4 py-3 font-medium">
                  Name
                </th>

                <th className="px-4 py-3 font-medium">
                  Role
                </th>

                <th className="px-4 py-3 font-medium">
                  Department
                </th>

                <th className="px-4 py-3 font-medium">
                  Assigned Cases
                </th>

                <th className="px-4 py-3 font-medium">
                  Status
                </th>

                <th className="px-4 py-3 font-medium">
                  Actions
                </th>
              </tr>
            </thead>

            <tbody>
              {users.map((u) => (
                <tr
                  key={u.id}
                  className="border-b border-surface-border last:border-0 hover:bg-surface-muted"
                >
                  <td className="px-4 py-3 font-medium text-ink-900">
                    {u.name}
                  </td>

                  <td className="px-4 py-3 text-ink-700">
                    {ROLE_LABELS[u.role] ?? u.role}
                  </td>

                  <td className="px-4 py-3 text-ink-700">
                    {u.department || "—"}
                  </td>

                  <td className="px-4 py-3 text-ink-700">
                    {getAssignedCaseCount(u)}
                  </td>

                  <td className="px-4 py-3">
                    <StatusBadge
                      tone={
                        u.active
                          ? "verified"
                          : "critical"
                      }
                      label={
                        u.active
                          ? "Active"
                          : "Deactivated"
                      }
                    />
                  </td>

                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-3 text-sm">
                      <button
                        type="button"
                        onClick={() =>
                          setPermissionUser(u)
                        }
                        className="flex items-center gap-1 text-navy-700 hover:underline"
                      >
                        <Shield size={14} />
                        Permissions
                      </button>

                      <button
                        type="button"
                        className="text-navy-700 hover:underline"
                      >
                        Edit
                      </button>

                      {u.active && (
                        <button
                          type="button"
                          className="text-status-critical hover:underline"
                        >
                          Deactivate
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {users.length === 0 && (
            <div className="p-8 text-center text-sm text-ink-500">
              No users found.
            </div>
          )}
        </div>
      )}

      {/* PERMISSION MODAL */}
      {permissionUser && (
        <PermissionModal
          user={permissionUser}
          cases={cases}
          onClose={() => setPermissionUser(null)}
        />
      )}
    </div>
  );
}

/* =========================================================
   PERMISSION MODAL
========================================================= */

function PermissionModal({
  user,
  cases,
  onClose,
}: {
  user: User;
  cases: Case[];
  onClose: () => void;
}) {
  const [selectedCase, setSelectedCase] =
    useState("");

  const [documents, setDocuments] =
    useState<DocumentOption[]>([]);

  const [selectedDocument, setSelectedDocument] =
    useState("");

  const [permissions, setPermissions] =
    useState<Permission[]>([]);

  const [selectedAction, setSelectedAction] =
    useState<PermissionAction>("view");

  const [expiresAt, setExpiresAt] =
    useState("");

  const [loadingDocuments, setLoadingDocuments] =
    useState(false);

  const [loadingPermissions, setLoadingPermissions] =
    useState(false);

  const [submitting, setSubmitting] =
    useState(false);

  const [revokingId, setRevokingId] =
    useState<string | null>(null);

  const [error, setError] =
    useState<string | null>(null);

  const [success, setSuccess] =
    useState<string | null>(null);

  /* LOAD DOCUMENTS WHEN CASE CHANGES */
useEffect(() => {
  if (!selectedCase) {
    setDocuments([]);
    setSelectedDocument("");
    setPermissions([]);
    return;
  }

async function loadDocuments() {
  try {
    setLoadingDocuments(true);
    setError(null);

    const result = await getDocuments({
      caseId: selectedCase,
    });

    console.log(
      "[Admin Permissions] Documents for case:",
      selectedCase,
      result
    );

    const raw = Array.isArray(result)
      ? result
      : [];

    const normalized: DocumentOption[] =
      raw.map((doc: any) => ({
        id: doc.id,
        documentId:
          doc.documentId ?? doc.id,
        title:
          doc.title ??
          doc.name ??
          doc.originalFileName,
        name:
          doc.name ??
          doc.title ??
          doc.originalFileName,
        caseId:
          doc.caseId ?? selectedCase,
      }));

    setDocuments(normalized);

    if (normalized.length > 0) {
      setSelectedDocument(
        normalized[0].id
      );
    } else {
      setSelectedDocument("");
    }
  } catch (err) {
    console.error(
      "[Permissions] Document load error:",
      err
    );

    setError(
      err instanceof Error
        ? err.message
        : "Failed to load documents"
    );

    setDocuments([]);
    setSelectedDocument("");
  } finally {
    setLoadingDocuments(false);
  }
}
  loadDocuments();
}, [selectedCase]);

  /* LOAD PERMISSIONS WHEN DOCUMENT CHANGES */
  useEffect(() => {
    if (!selectedDocument) {
      setPermissions([]);
      return;
    }

    async function loadPermissions() {
      try {
        setLoadingPermissions(true);
        setError(null);

        const result =
          await getDocumentPermissions(
            getBackendDocumentIdentifier(
              documents,
              selectedDocument
            )
          );

        setPermissions(result);
      } catch (err) {
        console.error(
          "[Permissions] Permission load error:",
          err
        );

        setError(
          err instanceof Error
            ? err.message
            : "Failed to load permissions"
        );

        setPermissions([]);
      } finally {
        setLoadingPermissions(false);
      }
    }

    loadPermissions();
  }, [selectedDocument, documents]);

  async function handleGrant() {
    if (!selectedDocument) {
      setError("Please select a document.");
      return;
    }

    try {
      setSubmitting(true);
      setError(null);
      setSuccess(null);

      const documentIdentifier =
        getBackendDocumentIdentifier(
          documents,
          selectedDocument
        );

      await grantDocumentPermission(
        documentIdentifier,
        {
          userId: user.id,
          action: selectedAction,
          expiresAt: expiresAt
            ? new Date(
                expiresAt
              ).toISOString()
            : null,
        }
      );

      setSuccess(
        `${formatPermission(
          selectedAction
        )} permission granted successfully.`
      );

      const updated =
        await getDocumentPermissions(
          documentIdentifier
        );

      setPermissions(updated);
    } catch (err) {
      console.error(
        "[Permissions] Grant error:",
        err
      );

      setError(
        err instanceof Error
          ? err.message
          : "Failed to grant permission"
      );
    } finally {
      setSubmitting(false);
    }
  }

  async function handleRevoke(
    permissionId: string
  ) {
    if (!selectedDocument) return;

    try {
      setRevokingId(permissionId);
      setError(null);
      setSuccess(null);

      const documentIdentifier =
        getBackendDocumentIdentifier(
          documents,
          selectedDocument
        );

      await revokeDocumentPermission(
        documentIdentifier,
        permissionId
      );

      setSuccess(
        "Document permission revoked successfully."
      );

      const updated =
        await getDocumentPermissions(
          documentIdentifier
        );

      setPermissions(updated);
    } catch (err) {
      console.error(
        "[Permissions] Revoke error:",
        err
      );

      setError(
        err instanceof Error
          ? err.message
          : "Failed to revoke permission"
      );
    } finally {
      setRevokingId(null);
    }
  }

  const userPermissions =
    permissions.filter(
      (permission) =>
        permission.userId === user.id
    );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-xl border border-surface-border bg-surface-card shadow-xl">
        {/* MODAL HEADER */}
        <div className="flex items-start justify-between border-b border-surface-border p-5">
          <div>
            <div className="flex items-center gap-2">
              <Shield
                size={20}
                className="text-navy-700"
              />

              <h2 className="text-lg font-semibold text-ink-900">
                Manage Permissions
              </h2>
            </div>

            <p className="mt-1 text-sm text-ink-500">
              {user.name} •{" "}
              {ROLE_LABELS[user.role] ??
                user.role}
            </p>

            {user.department && (
              <p className="text-xs text-ink-400">
                {user.department}
              </p>
            )}
          </div>

          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-2 text-ink-500 hover:bg-surface-muted hover:text-ink-900"
          >
            <X size={20} />
          </button>
        </div>

        <div className="space-y-5 p-5">
          {error && (
            <div className="rounded-lg border border-status-critical bg-status-criticalBg px-3 py-2 text-sm text-status-critical">
              {error}
            </div>
          )}

          {success && (
            <div className="rounded-lg border border-status-verified bg-status-verifiedBg px-3 py-2 text-sm text-status-verified">
              {success}
            </div>
          )}

          {/* CASE */}
          <div>
            <label className="mb-1 block text-sm font-medium text-ink-700">
              Case
            </label>

            <select
              value={selectedCase}
              onChange={(e) =>
                setSelectedCase(
                  e.target.value
                )
              }
              className="w-full rounded-lg border border-surface-border bg-white px-3 py-2 text-sm focus:border-navy-600 focus:outline-none"
            >
              <option value="">
                Select a case
              </option>

              {cases.map((c) => (
                <option
                  key={c.id}
                  value={c.id}
                >
                  {getCaseLabel(c)}
                </option>
              ))}
            </select>
          </div>

          {/* DOCUMENT */}
          <div>
            <label className="mb-1 block text-sm font-medium text-ink-700">
              Document
            </label>

            {!selectedCase ? (
              <p className="text-sm text-ink-500">
                Select a case first.
              </p>
            ) : loadingDocuments ? (
              <div className="flex items-center gap-2 text-sm text-ink-500">
                <Loader2
                  size={15}
                  className="animate-spin"
                />
                Loading documents…
              </div>
            ) : documents.length === 0 ? (
              <p className="rounded-lg border border-dashed border-surface-border p-4 text-sm text-ink-500">
                No documents found for this case.
              </p>
            ) : (
              <>
                <select
                  value={selectedDocument}
                  onChange={(e) =>
                    setSelectedDocument(
                      e.target.value
                    )
                  }
                  className="w-full rounded-lg border border-surface-border bg-white px-3 py-2 text-sm focus:border-navy-600 focus:outline-none"
                >
                  {documents.map((doc) => (
                    <option
                      key={doc.id}
                      value={doc.id}
                    >
                      {getDocumentLabel(doc)}
                    </option>
                  ))}
                </select>

                <p className="mt-1 text-xs text-ink-400">
                  Document ID:{" "}
                  {getBackendDocumentIdentifier(
                    documents,
                    selectedDocument
                  )}
                </p>
              </>
            )}
          </div>

          {/* GRANT */}
          <div className="rounded-lg border border-surface-border bg-surface-muted p-4">
            <h3 className="mb-3 text-sm font-semibold text-ink-900">
              Grant Permission
            </h3>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-sm font-medium text-ink-700">
                  Permission
                </label>

                <select
                  value={selectedAction}
                  onChange={(e) =>
                    setSelectedAction(
                      e.target
                        .value as PermissionAction
                    )
                  }
                  className="w-full rounded-lg border border-surface-border bg-white px-3 py-2 text-sm focus:border-navy-600 focus:outline-none"
                >
                  {PERMISSIONS.map(
                    (permission) => (
                      <option
                        key={permission}
                        value={permission}
                      >
                        {formatPermission(
                          permission
                        )}
                      </option>
                    )
                  )}
                </select>
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-ink-700">
                  Expiration (optional)
                </label>

                <input
                  type="datetime-local"
                  value={expiresAt}
                  onChange={(e) =>
                    setExpiresAt(
                      e.target.value
                    )
                  }
                  className="w-full rounded-lg border border-surface-border bg-white px-3 py-2 text-sm focus:border-navy-600 focus:outline-none"
                />
              </div>
            </div>

            <button
              type="button"
              onClick={handleGrant}
              disabled={
                submitting ||
                !selectedDocument
              }
              className="mt-4 flex items-center gap-2 rounded-lg bg-navy-800 px-4 py-2 text-sm font-medium text-white hover:bg-navy-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {submitting && (
                <Loader2
                  size={15}
                  className="animate-spin"
                />
              )}

              {submitting
                ? "Granting…"
                : "Grant Permission"}
            </button>
          </div>

          {/* EXISTING PERMISSIONS */}
          <div>
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-ink-900">
                Existing Permissions
              </h3>

              <span className="text-xs text-ink-400">
                {userPermissions.length} permission
                {userPermissions.length === 1
                  ? ""
                  : "s"}
              </span>
            </div>

            {loadingPermissions ? (
              <div className="flex items-center gap-2 py-6 text-sm text-ink-500">
                <Loader2
                  size={16}
                  className="animate-spin"
                />
                Loading permissions…
              </div>
            ) : userPermissions.length === 0 ? (
              <div className="rounded-lg border border-dashed border-surface-border p-6 text-center text-sm text-ink-500">
                No permissions granted to this user for this document.
              </div>
            ) : (
              <div className="overflow-hidden rounded-lg border border-surface-border">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-surface-border bg-surface-muted text-ink-500">
                      <th className="px-3 py-2 font-medium">
                        Permission
                      </th>

                      <th className="px-3 py-2 font-medium">
                        Expires
                      </th>

                      <th className="px-3 py-2 text-right font-medium">
                        Action
                      </th>
                    </tr>
                  </thead>

                  <tbody>
                    {userPermissions.map(
                      (permission) => (
                        <tr
                          key={permission.id}
                          className="border-b border-surface-border last:border-0"
                        >
                          <td className="px-3 py-3 font-medium text-ink-800">
                            {formatPermission(
                              permission.action
                            )}
                          </td>

                          <td className="px-3 py-3 text-ink-500">
                            {permission.expiresAt
                              ? formatDate(
                                  permission.expiresAt
                                )
                              : "Never"}
                          </td>

                          <td className="px-3 py-3 text-right">
                            <button
                              type="button"
                              onClick={() =>
                                handleRevoke(
                                  permission.id
                                )
                              }
                              disabled={
                                revokingId ===
                                permission.id
                              }
                              className="inline-flex items-center gap-1 text-status-critical hover:underline disabled:opacity-50"
                            >
                              {revokingId ===
                              permission.id ? (
                                <Loader2
                                  size={14}
                                  className="animate-spin"
                                />
                              ) : (
                                <Trash2
                                  size={14}
                                />
                              )}

                              Revoke
                            </button>
                          </td>
                        </tr>
                      )
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        <div className="flex justify-end border-t border-surface-border p-5">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-surface-border px-4 py-2 text-sm font-medium text-ink-700 hover:bg-surface-muted"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

/* =========================================================
   CREATE USER
========================================================= */

function CreateUserForm({
  cases,
  loadingCases,
  onCreated,
}: {
  cases: Case[];
  loadingCases: boolean;
  onCreated: (user: User) => void;
}) {
  const [name, setName] = useState("");
  const [employeeId, setEmployeeId] =
    useState("");
  const [email, setEmail] = useState("");
  const [department, setDepartment] =
    useState("");

  const [role, setRole] = useState<Role>(
    "investigation_officer"
  );

  const [assignedCases, setAssignedCases] =
    useState<string[]>([]);

  const [permissions, setPermissions] =
    useState<string[]>(["view"]);

  const [submitting, setSubmitting] =
    useState(false);

  const [error, setError] =
    useState<string | null>(null);

  function toggleCase(id: string) {
    setAssignedCases((prev) =>
      prev.includes(id)
        ? prev.filter((c) => c !== id)
        : [...prev, id]
    );
  }

  function togglePermission(
    permission: string
  ) {
    setPermissions((prev) =>
      prev.includes(permission)
        ? prev.filter((p) => p !== permission)
        : [...prev, permission]
    );
  }

  async function handleSubmit(
    e: React.FormEvent
  ) {
    e.preventDefault();

    setError(null);

    if (
      !name.trim() ||
      !employeeId.trim() ||
      !email.trim() ||
      !department.trim()
    ) {
      setError(
        "Please fill in all required fields."
      );

      return;
    }

    setSubmitting(true);

    try {
      const user = await createUser({
        name: name.trim(),
        employeeId: employeeId.trim(),
        email: email.trim(),
        department: department.trim(),
        role,
        assignedCaseIds: assignedCases,
        permissions,
      });

      onCreated(user);
    } catch (err) {
      console.error(
        "[Admin] Create user failed:",
        err
      );

      setError(
        err instanceof Error
          ? err.message
          : "Failed to create user"
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="max-w-2xl space-y-4 rounded-card border border-surface-border bg-surface-card p-6 shadow-card"
    >
      <h2 className="text-sm font-semibold text-ink-900">
        CREATE USER
      </h2>

      {error && (
        <div className="rounded-lg border border-status-critical bg-status-criticalBg px-3 py-2 text-sm text-status-critical">
          {error}
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Name">
          <input
            required
            value={name}
            onChange={(e) =>
              setName(e.target.value)
            }
            className={inputClass}
            placeholder="Full name"
          />
        </Field>

        <Field label="Employee ID">
          <input
            required
            value={employeeId}
            onChange={(e) =>
              setEmployeeId(e.target.value)
            }
            className={inputClass}
            placeholder="Employee ID"
          />
        </Field>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Email">
          <input
            required
            type="email"
            value={email}
            onChange={(e) =>
              setEmail(e.target.value)
            }
            className={inputClass}
            placeholder="official@example.gov.in"
          />
        </Field>

        <Field label="Department / Jurisdiction">
          <input
            required
            value={department}
            onChange={(e) =>
              setDepartment(e.target.value)
            }
            className={inputClass}
            placeholder="Cyber Crime / Forensics / Court"
          />
        </Field>
      </div>

      <Field label="Role">
        <select
          value={role}
          onChange={(e) =>
            setRole(e.target.value as Role)
          }
          className={
            inputClass + " bg-white"
          }
        >
          {ROLES.map((r) => (
            <option key={r} value={r}>
              {ROLE_LABELS[r] ?? r}
            </option>
          ))}
        </select>
      </Field>

      <Field label="Assigned Cases">
        {loadingCases ? (
          <p className="text-sm text-ink-500">
            Loading cases…
          </p>
        ) : cases.length === 0 ? (
          <p className="text-sm text-ink-500">
            No cases available.
          </p>
        ) : (
          <div className="max-h-48 space-y-2 overflow-y-auto rounded-lg border border-surface-border p-3">
            {cases.map((c) => (
              <label
                key={c.id}
                className="flex cursor-pointer items-center gap-2 text-sm text-ink-700"
              >
                <input
                  type="checkbox"
                  checked={assignedCases.includes(
                    c.id
                  )}
                  onChange={() =>
                    toggleCase(c.id)
                  }
                />

                <span>
                  {getCaseLabel(c)}
                </span>
              </label>
            ))}
          </div>
        )}
      </Field>

      <Field label="Permissions">
        <div className="flex flex-wrap gap-4">
          {PERMISSIONS.map(
            (permission) => (
              <label
                key={permission}
                className="flex cursor-pointer items-center gap-2 text-sm capitalize text-ink-700"
              >
                <input
                  type="checkbox"
                  checked={permissions.includes(
                    permission
                  )}
                  onChange={() =>
                    togglePermission(
                      permission
                    )
                  }
                />

                {permission.replace(
                  "_",
                  " "
                )}
              </label>
            )
          )}
        </div>
      </Field>

      <button
        type="submit"
        disabled={submitting}
        className="rounded-lg bg-navy-800 px-4 py-2 text-sm font-medium text-white hover:bg-navy-700 disabled:opacity-60"
      >
        {submitting
          ? "Creating…"
          : "Create Account"}
      </button>
    </form>
  );
}

/* =========================================================
   HELPERS
========================================================= */

function getAssignedCaseCount(user: User) {
  const assignedCases =
    (user as any)?.assignedCases;

  return Array.isArray(assignedCases)
    ? assignedCases.length
    : 0;
}

function getCaseLabel(c: Case) {
  const value = c as any;

  const caseNumber =
    value.caseNumber ??
    value.caseId ??
    value.id;

  const title =
    value.title ??
    value.name ??
    value.description;

  return title
    ? `Case #${caseNumber} — ${title}`
    : `Case #${caseNumber}`;
}

function getDocumentLabel(
  document: DocumentOption
) {
  return (
    document.title ??
    document.name ??
    document.documentId ??
    document.id
  );
}

function getBackendDocumentIdentifier(
  documents: DocumentOption[],
  selectedId: string
) {
  const document = documents.find(
    (doc) => doc.id === selectedId
  );

  return (
    document?.documentId ??
    document?.id ??
    selectedId
  );
}

function formatPermission(
  permission: string
) {
  return permission
    .replaceAll("_", " ")
    .replace(
      /\b\w/g,
      (char) => char.toUpperCase()
    );
}

function formatDate(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleString();
}

const inputClass =
  "w-full rounded-lg border border-surface-border px-3 py-2 text-sm focus:border-navy-600 focus:outline-none";

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="mb-1 block text-sm font-medium text-ink-700">
        {label}
      </label>

      {children}
    </div>
  );
}