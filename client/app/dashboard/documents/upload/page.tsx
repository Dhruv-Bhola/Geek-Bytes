"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  UploadCloud,
  Lock,
  CheckCircle2,
  Loader2,
} from "lucide-react";
import {
  uploadDocument,
  type UploadDocumentResult,
} from "@/lib/api";

const DOC_TYPES = [
  "FIR",
  "Investigation Report",
  "Witness Statement",
  "Forensic Report",
  "Court Document",
  "Evidence",
];

const SENSITIVITIES = [
  {
    value: "normal",
    label: "Normal",
  },
  {
    value: "confidential",
    label: "Confidential",
  },
  {
    value: "highly_confidential",
    label: "Highly Confidential",
  },
];

interface CaseOption {
  id: string;
  displayId: string;
  title: string;
}

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL ||
  "http://localhost:5000/api/v1";

const ACCESS_TOKEN_KEY =
  "secure-dms-access-token";

export default function UploadPage() {
  const [cases, setCases] = useState<CaseOption[]>([]);
  const [caseId, setCaseId] = useState("");
  const [loadingCases, setLoadingCases] = useState(true);

  const [type, setType] =
    useState(DOC_TYPES[0]);

  const [title, setTitle] =
    useState("");

  const [description, setDescription] =
    useState("");

  const [sensitivity, setSensitivity] =
    useState("normal");

  const [file, setFile] =
    useState<File | null>(null);

  const [dragOver, setDragOver] =
    useState(false);

  const [uploading, setUploading] =
    useState(false);

  const [result, setResult] =
    useState<UploadDocumentResult | null>(
      null
    );

  const [error, setError] =
    useState("");

  /**
   * Load real cases from backend.
   *
   * Important:
   * - `id` = PostgreSQL UUID
   * - `case_id` / `caseNumber` = human-friendly case identifier
   *
   * We send the UUID to the upload endpoint because the backend
   * resolves the actual case record using its database ID.
   */
  useEffect(() => {
    async function loadCases() {
      try {
        setLoadingCases(true);
        setError("");

        const token =
          sessionStorage.getItem(
            ACCESS_TOKEN_KEY
          );

        const response =
          await fetch(
            `${API_BASE_URL}/cases`,
            {
              method: "GET",
              headers: {
                Accept:
                  "application/json",
                ...(token
                  ? {
                      Authorization:
                        `Bearer ${token}`,
                    }
                  : {}),
              },
            }
          );

        const text =
          await response.text();

        let payload: any = null;

        if (text) {
          try {
            payload = JSON.parse(text);
          } catch {
            payload = {
              message: text,
            };
          }
        }

        if (!response.ok) {
          throw new Error(
            payload?.error ||
              payload?.message ||
              `Failed to load cases (${response.status})`
          );
        }

        const backendCases =
          Array.isArray(payload)
            ? payload
            : Array.isArray(
                  payload?.data
                )
              ? payload.data
              : Array.isArray(
                    payload?.data?.cases
                  )
                ? payload.data.cases
                : Array.isArray(
                      payload?.cases
                    )
                  ? payload.cases
                  : [];

        const mappedCases: CaseOption[] =
          backendCases
            .map((item: any) => {
              const databaseId =
                item?.id ??
                item?._id;

              if (!databaseId) {
                return null;
              }

              const displayId =
                item?.caseId ??
                item?.case_id ??
                item?.caseNumber ??
                item?.caseCode ??
                item?.number ??
                String(databaseId);

              const title =
                item?.caseTitle ??
                item?.title ??
                "Untitled Case";

              return {
                id: String(
                  databaseId
                ),
                displayId: String(
                  displayId
                ),
                title: String(
                  title
                ),
              };
            })
         .filter(
  (
    item: CaseOption | null
  ): item is CaseOption =>
    item !== null
);
        setCases(mappedCases);

        if (
          mappedCases.length > 0
        ) {
          setCaseId(
            mappedCases[0].id
          );
        }
      } catch (err) {
        console.error(
          "Failed to load cases:",
          err
        );

        setError(
          err instanceof Error
            ? err.message
            : "Unable to load cases."
        );
      } finally {
        setLoadingCases(false);
      }
    }

    loadCases();
  }, []);

  async function handleSubmit(
    e: React.FormEvent
  ) {
    e.preventDefault();

    setError("");

    if (!caseId) {
      setError(
        "Please select a case before uploading."
      );
      return;
    }

    if (!title.trim() || !file) {
      setError(
        "Add a document title and choose a file before uploading."
      );
      return;
    }

    setUploading(true);

    try {
      const res =
        await uploadDocument({
          caseId,
          type,
          title: title.trim(),
          description:
            description.trim(),
          sensitivity,
          file,
        });

      setResult(res);
    } catch (err) {
      console.error(
        "Document upload failed:",
        err
      );

      setError(
        err instanceof Error
          ? err.message
          : "Upload failed. Please try again."
      );
    } finally {
      setUploading(false);
    }
  }

  if (result) {
    return (
      <div className="mx-auto max-w-lg rounded-card border border-surface-border bg-surface-card p-8 text-center shadow-card">
        <CheckCircle2
          className="mx-auto text-status-verified"
          size={40}
        />

        <h1 className="mt-3 text-lg font-semibold text-ink-900">
          DOCUMENT SECURED
        </h1>

        <ul className="mx-auto mt-4 max-w-xs space-y-1.5 text-left text-sm text-ink-700">
          <li>
            ✓ Authorization verified
          </li>
          <li>
            ✓ File encrypted
          </li>
          <li>
            ✓ SHA-256 hash generated
          </li>
          <li>
            ✓ Metadata stored
          </li>
          <li>
            ✓ Blockchain record created
          </li>
        </ul>

        <div className="mx-auto mt-5 max-w-xs space-y-2 rounded-lg bg-surface-muted p-4 text-left text-sm">
          <Row
            label="Document ID"
            value={result.documentId}
          />

          <Row
            label="Integrity Hash"
            value={result.integrityHash}
            mono
          />

          <Row
            label="Version"
            value={String(
              result.version
            )}
          />
        </div>

        <div className="mt-6 flex justify-center gap-3">
          <Link
            href={`/dashboard/documents/${result.documentId}`}
            className="rounded-lg bg-navy-800 px-4 py-2 text-sm font-medium text-white hover:bg-navy-700"
          >
            View Document
          </Link>

          <button
            onClick={() => {
              setResult(null);
              setTitle("");
              setDescription("");
              setFile(null);

              /*
               * Keep the currently selected real case.
               */
            }}
            className="rounded-lg border border-surface-border px-4 py-2 text-sm font-medium text-ink-700 hover:bg-surface-muted"
          >
            Upload Another
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <div>
        <h1 className="text-xl font-semibold text-ink-900">
          Upload Document
        </h1>

        <p className="text-sm text-ink-500">
          Select → Validate → Permission check → Secure processing → Audit.
        </p>
      </div>

      <form
        onSubmit={handleSubmit}
        className="space-y-5 rounded-card border border-surface-border bg-surface-card p-6 shadow-card"
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Case">
            <select
              value={caseId}
              onChange={(e) =>
                setCaseId(
                  e.target.value
                )
              }
              disabled={
                loadingCases ||
                cases.length === 0
              }
              className={
                selectClass +
                " disabled:cursor-not-allowed disabled:opacity-60"
              }
            >
              {loadingCases ? (
                <option value="">
                  Loading cases...
                </option>
              ) : cases.length === 0 ? (
                <option value="">
                  No authorized cases found
                </option>
              ) : (
                cases.map((c) => (
                  <option
                    key={c.id}
                    value={c.id}
                  >
                    Case #{c.displayId} —{" "}
                    {c.title}
                  </option>
                ))
              )}
            </select>
          </Field>

          <Field label="Document Type">
            <select
              value={type}
              onChange={(e) =>
                setType(
                  e.target.value
                )
              }
              className={selectClass}
            >
              {DOC_TYPES.map(
                (t) => (
                  <option
                    key={t}
                    value={t}
                  >
                    {t}
                  </option>
                )
              )}
            </select>
          </Field>
        </div>

        <Field label="Document Title">
          <input
            value={title}
            onChange={(e) =>
              setTitle(
                e.target.value
              )
            }
            className={inputClass}
            placeholder="Enter document title"
          />
        </Field>

        <Field label="Description">
          <textarea
            value={description}
            onChange={(e) =>
              setDescription(
                e.target.value
              )
            }
            rows={3}
            className={inputClass}
            placeholder="Enter document description"
          />
        </Field>

        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() =>
            setDragOver(false)
          }
          onDrop={(e) => {
            e.preventDefault();
            setDragOver(false);

            const droppedFile =
              e.dataTransfer
                .files?.[0];

            if (droppedFile) {
              setFile(
                droppedFile
              );
              setError("");
            }
          }}
          className={`flex flex-col items-center gap-2 rounded-card border-2 border-dashed p-8 text-center ${
            dragOver
              ? "border-navy-600 bg-surface-muted"
              : "border-surface-border"
          }`}
        >
          <UploadCloud
            className="text-ink-400"
            size={28}
          />

          <p className="text-sm text-ink-700">
            {file
              ? file.name
              : "Drag & drop a file here"}
          </p>

          <label className="cursor-pointer rounded-lg border border-surface-border bg-white px-3 py-1.5 text-sm font-medium text-ink-700 hover:bg-surface-muted">
            Browse Files

            <input
              type="file"
              className="hidden"
              onChange={(e) => {
                setFile(
                  e.target.files?.[0] ??
                    null
                );
                setError("");
              }}
            />
          </label>

          {file && (
            <p className="text-xs text-ink-500">
              {(file.size / 1024).toFixed(
                1
              )}{" "}
              KB
            </p>
          )}
        </div>

        <Field label="Sensitivity">
          <div className="flex flex-wrap gap-4">
            {SENSITIVITIES.map(
              (s) => (
                <label
                  key={s.value}
                  className="flex items-center gap-2 text-sm text-ink-700"
                >
                  <input
                    type="radio"
                    name="sensitivity"
                    value={s.value}
                    checked={
                      sensitivity ===
                      s.value
                    }
                    onChange={() =>
                      setSensitivity(
                        s.value
                      )
                    }
                  />

                  {s.label}
                </label>
              )
            )}
          </div>
        </Field>

        {error && (
          <p
            role="alert"
            className="rounded-lg bg-status-criticalBg px-3 py-2 text-sm text-status-critical"
          >
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={
            uploading ||
            loadingCases ||
            !caseId ||
            cases.length === 0
          }
          className="flex w-full items-center justify-center gap-2 rounded-lg bg-navy-800 py-2.5 text-sm font-medium text-white hover:bg-navy-700 disabled:opacity-60"
        >
          {uploading ? (
            <Loader2
              className="animate-spin"
              size={16}
            />
          ) : (
            <Lock size={16} />
          )}

          {uploading
            ? "Encrypting & Uploading…"
            : "Encrypt & Upload"}
        </button>
      </form>
    </div>
  );
}

const inputClass =
  "w-full rounded-lg border border-surface-border px-3 py-2 text-sm focus:border-navy-600";

const selectClass =
  inputClass + " bg-white";

interface FieldProps {
  label: string;
  children: React.ReactNode;
}

function Field({
  label,
  children,
}: FieldProps) {
  return (
    <div>
      <label className="mb-1 block text-sm font-medium text-ink-700">
        {label}
      </label>

      {children}
    </div>
  );
}

interface RowProps {
  label: string;
  value: string;
  mono?: boolean;
}

function Row({
  label,
  value,
  mono,
}: RowProps) {
  return (
    <div className="flex justify-between gap-4">
      <span className="text-ink-500">
        {label}
      </span>

      <span
        className={`break-all text-right font-medium text-ink-900 ${
          mono
            ? "font-mono text-xs"
            : ""
        }`}
      >
        {value}
      </span>
    </div>
  );
}