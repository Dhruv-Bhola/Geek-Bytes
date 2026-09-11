/**
 * ============================================================================
 * SECURE DMS - CENTRAL API LAYER
 * ============================================================================
 *
 * All frontend/backend communication lives here.
 *
 * Backend:
 *   http://localhost:5000/api/v1
 *
 * Real integrations:
 *   - Authentication
 *   - MFA
 *   - Current user
 *   - Dashboard
 *   - Cases
 *   - Documents
 *   - Document upload
 *   - Document details
 *   - Document download
 *   - Integrity verification
 *   - Chain of custody
 *
 * Temporary mock fallback:
 *   - Audit
 *   - Security alerts
 *   - Emergency access
 *   - Admin/users
 *
 * This file is intentionally centralized so pages should not need to know
 * backend route details.
 * ============================================================================
 */

import type {
  AuditEvent,
  Case,
  CaseStatus,
  CustodyEvent,
  DashboardSummary,
  DocumentRecord,
  DocumentType,
  EmergencyAccessRequest,
  Role,
  SecurityAlert,
  User,
} from "./types";

import {
  mockAlerts,
  mockAuditEvents,
  mockCases,
  mockCustodyEvents,
  mockDocuments,
  mockEmergencyRequests,
  mockUsers,
} from "./mockData";

/**
 * ============================================================================
 * CONFIGURATION
 * ============================================================================
 */

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL ||
  "http://localhost:5000/api/v1";

/*
 * These modules remain mock-backed until their backend routes are connected.
 * Core document functionality does NOT depend on this flag.
 */
const USE_MOCK_AUXILIARY_DATA = true;

/**
 * ============================================================================
 * SESSION STORAGE
 * ============================================================================
 */

export const ACCESS_TOKEN_KEY =
  "secure-dms-access-token";

export const REFRESH_TOKEN_KEY =
  "secure-dms-refresh-token";

export const MFA_IDENTIFIER_KEY =
  "secure-dms-mfa-identifier";

/**
 * ============================================================================
 * AUTH STORAGE HELPERS
 * ============================================================================
 */

function getAccessToken(): string | null {
  if (typeof window === "undefined") {
    return null;
  }

  return sessionStorage.getItem(
    ACCESS_TOKEN_KEY
  );
}

function getRefreshToken(): string | null {
  if (typeof window === "undefined") {
    return null;
  }

  return sessionStorage.getItem(
    REFRESH_TOKEN_KEY
  );
}

function saveTokens(
  accessToken: string,
  refreshToken: string
): void {
  if (typeof window === "undefined") {
    return;
  }

  sessionStorage.setItem(
    ACCESS_TOKEN_KEY,
    accessToken
  );

  sessionStorage.setItem(
    REFRESH_TOKEN_KEY,
    refreshToken
  );
}

export function clearAuthStorage(): void {
  if (typeof window === "undefined") {
    return;
  }

  sessionStorage.removeItem(
    ACCESS_TOKEN_KEY
  );

  sessionStorage.removeItem(
    REFRESH_TOKEN_KEY
  );

  sessionStorage.removeItem(
    MFA_IDENTIFIER_KEY
  );
}

/**
 * ============================================================================
 * RESPONSE HELPERS
 * ============================================================================
 */

async function parseResponseBody(
  response: Response
): Promise<any> {
  const text =
    await response.text();

  if (!text) {
    return null;
  }

  try {
    return JSON.parse(text);
  } catch {
    return {
      message: text,
    };
  }
}

function getBackendError(
  payload: any,
  fallback: string
): string {
  return (
    payload?.error ||
    payload?.message ||
    payload?.data?.error ||
    fallback
  );
}

function unwrapData(
  payload: any
): any {
  return (
    payload?.data ??
    payload
  );
}

/**
 * ============================================================================
 * GENERIC API REQUEST
 * ============================================================================
 */

async function apiFetch<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const token =
    getAccessToken();

  const headers =
    new Headers(
      options.headers
    );

  /*
   * Never manually set Content-Type for FormData.
   * The browser creates the multipart boundary.
   */
  if (
    options.body &&
    !(options.body instanceof FormData) &&
    !headers.has(
      "Content-Type"
    )
  ) {
    headers.set(
      "Content-Type",
      "application/json"
    );
  }

  headers.set(
    "Accept",
    "application/json"
  );

  if (token) {
    headers.set(
      "Authorization",
      `Bearer ${token}`
    );
  }

  const response =
    await fetch(
      `${API_BASE_URL}${path}`,
      {
        ...options,
        headers,
      }
    );

  const payload =
    await parseResponseBody(
      response
    );

  if (!response.ok) {
    /*
     * Log the complete backend response so we can
     * see exactly why a request such as integrity
     * verification returned 409.
     */
    console.error(
      `[apiFetch] ${response.status} ${response.statusText} ${path}`,
      payload
    );

    const backendError =
      getBackendError(
        payload,
        `API request failed with status ${response.status}`
      );

    /*
     * Keep the backend message in the thrown error.
     */
    throw new Error(
      backendError
    );
  }

  return payload as T;
}

/**
 * ============================================================================
 * MOCK HELPER
 * ============================================================================
 */

function mockDelay<T>(
  value: T,
  ms = 300
): Promise<T> {
  return new Promise(
    (resolve) => {
      setTimeout(
        () => resolve(value),
        ms
      );
    }
  );
}

/**
 * ============================================================================
 * AUTHENTICATION + MFA
 * ============================================================================
 */

export interface LoginResult {
  requiresMfa: boolean;
  otpSent: boolean;
  phone?: string;
  userId?: string;
  customUserId?: string;
}

export async function login(
  userId: string,
  password: string
): Promise<LoginResult> {
  const identifier =
    userId.trim();

  if (
    !identifier ||
    !password
  ) {
    throw new Error(
      "User ID and password are required."
    );
  }

  const response =
    await fetch(
      `${API_BASE_URL}/auth/login`,
      {
        method: "POST",
        headers: {
          "Content-Type":
            "application/json",
          Accept:
            "application/json",
        },
        body: JSON.stringify({
          identifier,
          password,
        }),
      }
    );

  const payload =
    await parseResponseBody(
      response
    );

  /*
   * The backend intentionally returns 403 after password
   * verification when MFA is required.
   */
  if (
    payload?.mfaRequired === true &&
    payload?.otpSent === true
  ) {
    if (
      typeof window !==
      "undefined"
    ) {
      sessionStorage.setItem(
        MFA_IDENTIFIER_KEY,
        identifier
      );
    }

    return {
      requiresMfa: true,
      otpSent: true,
      phone:
        payload?.phone,
      userId:
        payload?.user?.id,
      customUserId:
        payload?.user
          ?.customUserId,
    };
  }

  if (!response.ok) {
    throw new Error(
      getBackendError(
        payload,
        "Invalid credentials."
      )
    );
  }

  return {
    requiresMfa:
      payload?.mfaRequired ===
      true,

    otpSent:
      payload?.otpSent ===
      true,

    phone:
      payload?.phone,

    userId:
      payload?.user?.id,

    customUserId:
      payload?.user
        ?.customUserId,
  };
}

export async function verifyMfaCode(
  code: string
): Promise<{
  user: User;
}> {
  const otp =
    code.trim();

  if (
    !/^\d{6}$/.test(otp)
  ) {
    throw new Error(
      "OTP must be a 6-digit number."
    );
  }

  if (
    typeof window ===
    "undefined"
  ) {
    throw new Error(
      "MFA verification must run in the browser."
    );
  }

  const identifier =
    sessionStorage.getItem(
      MFA_IDENTIFIER_KEY
    );

  if (!identifier) {
    throw new Error(
      "MFA session expired. Please log in again."
    );
  }

  const response =
    await fetch(
      `${API_BASE_URL}/auth/verify-mfa`,
      {
        method: "POST",
        headers: {
          "Content-Type":
            "application/json",
          Accept:
            "application/json",
        },
        body: JSON.stringify({
          identifier,
          otp,
        }),
      }
    );

  const payload =
    await parseResponseBody(
      response
    );

  if (!response.ok) {
    throw new Error(
      getBackendError(
        payload,
        "Invalid or expired OTP."
      )
    );
  }

  const data =
    unwrapData(payload);

  if (
    !data?.accessToken ||
    !data?.refreshToken ||
    !data?.user
  ) {
    throw new Error(
      "Authentication response is incomplete."
    );
  }

  saveTokens(
    data.accessToken,
    data.refreshToken
  );

  sessionStorage.removeItem(
    MFA_IDENTIFIER_KEY
  );

  return {
    user:
      mapBackendUser(
        data.user
      ),
  };
}

/**
 * ============================================================================
 * USER MAPPING
 * ============================================================================
 */

function mapBackendRole(
  backendRole: string
): Role {
  switch (
    backendRole
  ) {
    case "police":
    case "investigator":
      return "investigation_officer";

    case "forensic":
      return "forensic_officer";

    case "lawyer":
      return "prosecutor";

    case "judge":
      return "court_staff";

    case "admin":
      return "administrator";

    case "victim":
      return "auditor";

    default:
      return "auditor";
  }
}

function mapBackendUser(
  backendUser: any
): User {
  const role =
    mapBackendRole(
      String(
        backendUser?.role ??
          ""
      )
    );

  let permissions:
    User["permissions"] = [
      "view",
      "download",
    ];

  if (
    role ===
    "administrator"
  ) {
    permissions = [
      "view",
      "upload",
      "update",
      "download",
      "delete",
      "manage_users",
      "approve_emergency_access",
    ];
  } else if (
    role ===
      "investigation_officer" ||
    role ===
      "forensic_officer"
  ) {
    permissions = [
      "view",
      "upload",
      "update",
      "download",
    ];
  }

  return {
    id: String(
      backendUser?.id ??
        ""
    ),

    name:
      backendUser?.fullName ??
      "User",

    employeeId:
      backendUser
        ?.customUserId ??
      backendUser?.badgeNumber ??
      "",

    department:
      backendUser
        ?.jurisdictionCell ??
      "",

    role,

    assignedCaseIds:
      Array.isArray(
        backendUser
          ?.assignedCaseIds
      )
        ? backendUser.assignedCaseIds
        : [],

    permissions,

    active:
      backendUser?.isActive ??
      true,
  };
}

export async function getCurrentUser(): Promise<
  User | null
> {
  if (
    typeof window ===
    "undefined"
  ) {
    return null;
  }

  if (!getAccessToken()) {
    return null;
  }

  try {
    const payload =
      await apiFetch<any>(
        "/auth/me"
      );

    const backendUser =
      payload?.data?.user ??
      payload?.user ??
      payload;

    if (!backendUser) {
      return null;
    }

    return mapBackendUser(
      backendUser
    );
  } catch (error) {
    console.error(
      "Failed to restore authenticated user:",
      error
    );

    clearAuthStorage();

    return null;
  }
}

/**
 * Optional token refresh helper.
 */
export async function refreshToken(): Promise<string | null> {
  const refresh =
    getRefreshToken();

  if (!refresh) {
    return null;
  }

  try {
    const response =
      await apiFetch<any>(
        "/auth/refresh",
        {
          method: "POST",
          body: JSON.stringify({
            refreshToken:
              refresh,
          }),
        }
      );

    const data =
      unwrapData(response);

    if (
      data?.accessToken
    ) {
      saveTokens(
        data.accessToken,
        data.refreshToken ??
          refresh
      );

      return data.accessToken;
    }

    return null;
  } catch {
    clearAuthStorage();
    return null;
  }
}

/**
 * ============================================================================
 * DASHBOARD
 * ============================================================================
 */

export async function getDashboardSummary(): Promise<DashboardSummary> {
  return apiFetch<DashboardSummary>(
    "/dashboard/summary"
  );
}

/**
 * ============================================================================
 * CASES
 * ============================================================================
 */

function mapBackendCase(
  backendCase: any
): Case {
  const backendStatus =
    String(
      backendCase?.status ??
        ""
    );

  let status:
    CaseStatus = "active";

  switch (
    backendStatus
  ) {
    case "open":
    case "under_investigation":
      status = "active";
      break;

    case "chargesheet_filed":
      status = "review";
      break;

    case "court_disposed":
      status = "closed";
      break;

    default:
      status = "active";
  }

  /*
   * Preserve the backend's active CaseAssignment data.
   *
   * The backend sends this as `assignments` and also exposes
   * `caseAssignments` for frontend compatibility.
   *
   * We keep both fields at runtime so the case detail page can
   * display the complete list of assigned personnel.
   */
  const assignments =
    Array.isArray(
      backendCase?.assignments
    )
      ? backendCase.assignments
      : Array.isArray(
          backendCase?.caseAssignments
        )
        ? backendCase.caseAssignments
        : [];

  const caseAssignments =
    assignments;

  /*
   * Normalize the backend investigating officer while preserving
   * the complete assignment information.
   */
  const investigatingOfficerName =
    backendCase
      ?.investigatingOfficer
      ?.fullName ??
    backendCase
      ?.assignedOfficer
      ?.fullName ??
    backendCase
      ?.investigatingOfficer ??
    "";

  /*
   * Return the frontend Case object plus the additional backend
   * data needed by the People tab.
   *
   * The cast is intentional: the runtime object contains the
   * extra assignment fields while the existing Case type remains
   * backward-compatible with the teammate UI.
   */
  return {
    id: String(
      backendCase?.caseNumber ??
        backendCase?.caseId ??
        backendCase?.id ??
        ""
    ),

    firNumber:
      backendCase?.firNumber ??
      backendCase?.complaint
        ?.complaintNumber ??
      "",

    title:
      backendCase?.title ??
      backendCase?.caseTitle ??
      "Untitled Case",

    department:
      backendCase?.department ??
      backendCase?.jurisdictionCell ??
      "",

    status,

    policeStation:
      backendCase?.policeStation ??
      backendCase?.policeStationName ??
      "",

    investigatingOfficer:
      investigatingOfficerName,

    createdAt:
      backendCase?.createdAt ??
      new Date().toISOString(),

    documentSummary: {
      fir:
        Number(
          backendCase
            ?.documentSummary
            ?.fir ??
            0
        ),

      investigationReports:
        Number(
          backendCase
            ?.documentSummary
            ?.investigationReports ??
            0
        ),

      witnessStatements:
        Number(
          backendCase
            ?.documentSummary
            ?.witnessStatements ??
            0
        ),

      forensicReports:
        Number(
          backendCase
            ?.documentSummary
            ?.forensicReports ??
            0
        ),

      courtDocuments:
        Number(
          backendCase
            ?.documentSummary
            ?.courtDocuments ??
            0
        ),

      evidenceFiles:
        Number(
          backendCase
            ?.documentSummary
            ?.evidenceFiles ??
            0
        ),
    },

    assignments,
    caseAssignments,
  } as Case;
}

function extractBackendCases(
  response: any
): any[] {
  if (
    Array.isArray(
      response
    )
  ) {
    return response;
  }

  if (
    Array.isArray(
      response?.data
    )
  ) {
    return response.data;
  }

  if (
    Array.isArray(
      response?.cases
    )
  ) {
    return response.cases;
  }

  if (
    Array.isArray(
      response?.data?.cases
    )
  ) {
    return response.data.cases;
  }

  return [];
}

export async function getCases(): Promise<
  Case[]
> {
  const response =
    await apiFetch<any>(
      "/cases"
    );

  return extractBackendCases(
    response
  ).map(
    mapBackendCase
  );
}

export async function getCaseById(
  caseId: string
): Promise<Case | null> {
  try {
    const response =
      await apiFetch<any>(
        `/cases/${encodeURIComponent(
          caseId
        )}`
      );

    const backendCase =
      response?.data?.case ??
      response?.data ??
      response?.case ??
      response;

    if (
      backendCase &&
      typeof backendCase ===
        "object"
    ) {
      return mapBackendCase(
        backendCase
      );
    }

    return null;
  } catch (directError) {
    /*
     * Fallback:
     * resolve human-readable case ID against the authorized case list.
     */
    try {
      const response =
        await apiFetch<any>(
          "/cases"
        );

      const backendCases =
        extractBackendCases(
          response
        );

      const requestedId =
        String(caseId)
          .trim()
          .toLowerCase();

      const matchingCase =
        backendCases.find(
          (item: any) => {
            const values = [
              item?.id,
              item?._id,
              item?.caseId,
              item?.case_id,
              item?.caseNumber,
              item?.caseCode,
              item?.number,
            ]
              .filter(
                (
                  value
                ) =>
                  value !==
                    undefined &&
                  value !== null &&
                  String(value).trim()
                    .length > 0
              )
              .map(
                (value) =>
                  String(value)
                    .trim()
                    .toLowerCase()
              );

            return values.includes(
              requestedId
            );
          }
        );

      if (
        !matchingCase
      ) {
        throw directError;
      }

      return mapBackendCase(
        matchingCase
      );
    } catch {
      throw directError;
    }
  }
}

/**
 * ============================================================================
 * DOCUMENT TYPES / MAPPING
 * ============================================================================
 */

type DocumentSensitivity =
  DocumentRecord["sensitivity"];

type DocumentIntegrityStatus =
  DocumentRecord["integrityStatus"];

function mapBackendDocumentType(
  backendType: any
): DocumentType {
  const value =
    String(
      backendType ??
        "Evidence"
    ).toLowerCase();

  if (
    value.includes("fir")
  ) {
    return "FIR";
  }

  if (
    value.includes("investigation") ||
    value.includes("report")
  ) {
    /*
     * Forensic reports are handled first below.
     */
    if (
      value.includes(
        "forensic"
      )
    ) {
      return "Forensic Report";
    }

    return "Investigation Report";
  }

  if (
    value.includes("witness") ||
    value.includes("statement")
  ) {
    return "Witness Statement";
  }

  if (
    value.includes("forensic")
  ) {
    return "Forensic Report";
  }

  if (
    value.includes("court")
  ) {
    return "Court Document";
  }

  return "Evidence";
}

function normalizeSensitivity(
  sensitivity: any
): DocumentSensitivity {
  const value =
    String(
      sensitivity ??
        "normal"
    ).toLowerCase();

  switch (value) {
    case "confidential":
      return "confidential" as DocumentSensitivity;

    case "high":
    case "highly_confidential":
    case "highly confidential":
      return "highly_confidential" as DocumentSensitivity;

    default:
      return "normal" as DocumentSensitivity;
  }
}

function normalizeIntegrityStatus(
  status: any
): DocumentIntegrityStatus {
  const value =
    String(
      status ??
        "pending"
    ).toLowerCase();

  if (
    value === "tampered" ||
    value === "mismatch"
  ) {
    return "mismatch" as DocumentIntegrityStatus;
  }

  if (
    value === "review" ||
    value === "pending"
  ) {
    return "review" as DocumentIntegrityStatus;
  }

  return "verified" as DocumentIntegrityStatus;
}

function mapBackendDocument(
  backendDocument: any
): DocumentRecord {
  const versions =
    Array.isArray(
      backendDocument
        ?.versions
    )
      ? backendDocument.versions
      : [];

  const latestVersion =
    versions.length > 0
      ? versions[0]
      : null;

  const currentVersion =
    Number(
      backendDocument
        ?.currentVersion ??
        latestVersion
          ?.versionNumber ??
        1
    );

  const storedHash =
    backendDocument
      ?.sha256Hash ??
    latestVersion
      ?.sha256Hash ??
    "";

  const blockchainTxHash =
    backendDocument
      ?.blockchainTxHash ??
    latestVersion
      ?.blockchainTxHash ??
    null;

  return {
    id: String(
      backendDocument
        ?.documentId ??
        backendDocument?.id ??
        ""
    ),

    name:
      backendDocument?.title ??
      backendDocument
        ?.originalFileName ??
      latestVersion
        ?.originalFileName ??
      "Untitled Document",

    caseId: String(
      backendDocument
        ?.caseId ??
        backendDocument
          ?.case?.caseId ??
        ""
    ),

    type:
      mapBackendDocumentType(
        backendDocument
          ?.documentType ??
          backendDocument?.type
      ),

    version:
      currentVersion,

    sensitivity:
      normalizeSensitivity(
        backendDocument
          ?.sensitivity
      ),

    integrityStatus:
      normalizeIntegrityStatus(
        backendDocument
          ?.integrityStatus
      ),

    storedHash,

    currentHash:
      backendDocument
        ?.currentHash ??
      storedHash,

    uploadedBy:
      backendDocument
        ?.createdBy?.fullName ??
      backendDocument
        ?.uploader?.fullName ??
      backendDocument
        ?.uploadedBy?.fullName ??
      backendDocument
        ?.createdById ??
      latestVersion
        ?.uploadedById ??
      "Unknown",

    uploadedAt:
      backendDocument
        ?.createdAt ??
      latestVersion
        ?.createdAt ??
      new Date().toISOString(),
  permissions: Array.isArray(
  backendDocument?.permissions
)
  ? backendDocument.permissions.map(
      (permission: any) =>
        String(permission).toLowerCase()
    )
  : ['view'],

    encryptionActive:
      true,
blockchainRecorded:
  Boolean(
    backendDocument?.blockchainRecorded ??
      backendDocument?.blockchainTxHash ??
      latestVersion?.blockchainTxHash
  ),

blockchainTxHash:
  blockchainTxHash,

blockchainBlock:
  backendDocument?.blockchainBlock ??
  null,
  } as DocumentRecord;
}

function extractBackendDocuments(
  response: any
): any[] {
  if (
    Array.isArray(
      response
    )
  ) {
    return response;
  }

  if (
    Array.isArray(
      response?.data
    )
  ) {
    return response.data;
  }

  if (
    Array.isArray(
      response?.documents
    )
  ) {
    return response.documents;
  }

  if (
    Array.isArray(
      response?.data?.documents
    )
  ) {
    return response.data.documents;
  }

  if (
    Array.isArray(
      response?.items
    )
  ) {
    return response.items;
  }

  if (
    Array.isArray(
      response?.data?.items
    )
  ) {
    return response.data.items;
  }

  return [];
}

/**
 * ============================================================================
 * DOCUMENT LIST
 * ============================================================================
 */

export async function getDocuments(
  filters?: {
    caseId?: string;
    type?: string;
  }
): Promise<DocumentRecord[]> {
  /*
   * Single case.
   */
  if (
    filters?.caseId
  ) {
    const response =
      await apiFetch<any>(
        `/evidence/case/${encodeURIComponent(
          filters.caseId
        )}`
      );

    let documents =
      extractBackendDocuments(
        response
      ).map(
        mapBackendDocument
      );

    if (
      filters.type &&
      filters.type !== "All"
    ) {
      documents =
        documents.filter(
          (
            document
          ) =>
            document.type ===
            filters.type
        );
    }

    return documents;
  }

  /*
   * All authorized cases.
   */
  const cases =
    await getCases();

  if (
    cases.length ===
    0
  ) {
    return [];
  }

  const results =
    await Promise.all(
      cases.map(
        async (
          caseItem
        ) => {
          try {
            const response =
              await apiFetch<any>(
                `/evidence/case/${encodeURIComponent(
                  caseItem.id
                )}`
              );

            return extractBackendDocuments(
              response
            );
          } catch (error) {
            console.error(
              `Failed to load documents for case ${caseItem.id}:`,
              error
            );

            return [];
          }
        }
      )
    );

  let documents =
    results
      .flat()
      .map(
        mapBackendDocument
      );

  /*
   * De-duplicate documents.
   */
  const unique =
    new Map<
      string,
      DocumentRecord
    >();

  for (
    const document of
    documents
  ) {
    if (
      document.id
    ) {
      unique.set(
        document.id,
        document
      );
    }
  }

  documents =
    Array.from(
      unique.values()
    );

  if (
    filters?.type &&
    filters.type !== "All"
  ) {
    documents =
      documents.filter(
        (
          document
        ) =>
          document.type ===
          filters.type
      );
  }

  return documents;
}

/**
 * ============================================================================
 * SINGLE DOCUMENT
 * ============================================================================
 */

export async function getDocumentById(
  documentId: string
): Promise<DocumentRecord | null> {
  /*
   * Fetch the document metadata.
   */
  const response =
    await apiFetch<any>(
      `/evidence/${encodeURIComponent(
        documentId
      )}`
    );

  const backendDocument =
    response?.data?.document ??
    response?.data ??
    response?.document ??
    response;

  if (!backendDocument) {
    return null;
  }

  /*
   * Fetch the document audit/custody timeline as well.
   *
   * The document endpoint contains the document metadata,
   * while the audit events contain the persisted blockchain
   * transaction hash and block number.
   */
  let auditEvents: any[] = [];

  try {
    const custodyResponse =
      await apiFetch<any>(
        `/evidence/${encodeURIComponent(
          documentId
        )}/custody`
      );

    auditEvents =
      custodyResponse?.data?.timeline ??
      custodyResponse?.timeline ??
      [];
  } catch (error) {
    console.warn(
      "[getDocumentById] Unable to load blockchain audit timeline:",
      error
    );
  }

  /*
   * Find an audit event that has a real blockchain
   * transaction associated with it.
   *
   * Prefer the latest event.
   */
  const blockchainEvent =
    [...auditEvents]
      .reverse()
      .find(
        (event: any) =>
          Boolean(
            event?.blockchainTxHash
          ) &&
          event?.blockchainBlock !== null &&
          event?.blockchainBlock !== undefined
      );

  /*
   * Also check metadata because older audit rows may
   * have stored blockchain information there.
   */
  let metadataBlockchainTxHash =
    null;

  let metadataBlockchainBlock =
    null;

  if (
    !blockchainEvent &&
    auditEvents.length > 0
  ) {
    for (
      let i = auditEvents.length - 1;
      i >= 0;
      i--
    ) {
      const metadata =
        auditEvents[i]?.metadata;

      if (
        metadata &&
        typeof metadata === "object"
      ) {
        const tx =
          metadata.blockchainTxHash ??
          metadata.blockchainInitialTxHash;

        const block =
          metadata.blockchainBlock ??
          metadata.blockchainInitialBlock;

        if (tx) {
          metadataBlockchainTxHash =
            String(tx);

          metadataBlockchainBlock =
            block !== null &&
            block !== undefined
              ? Number(block)
              : null;

          break;
        }
      }
    }
  }

  /*
   * Normalize the backend document first.
   */
  const mapped =
    mapBackendDocument(
      {
        ...backendDocument,

        /*
         * Inject blockchain information into
         * the object used by mapBackendDocument().
         */
        blockchainRecorded:
          Boolean(
            blockchainEvent ||
            metadataBlockchainTxHash
          ),

        blockchainTxHash:
          blockchainEvent?.blockchainTxHash ??
          metadataBlockchainTxHash ??
          null,

        blockchainBlock:
          blockchainEvent?.blockchainBlock ??
          metadataBlockchainBlock ??
          null,
      }
    );

  return mapped;
}

/**
 * ============================================================================
 * DOCUMENT UPLOAD
 * ============================================================================
 */

export interface UploadDocumentPayload {
  caseId: string;
  type: string;
  title: string;
  description: string;
  sensitivity: string;
  file: File | null;
}

export interface UploadDocumentResult {
  documentId: string;
  integrityHash: string;
  version: number;
}

export async function uploadDocument(
  payload: UploadDocumentPayload
): Promise<UploadDocumentResult> {
  if (
    !payload.caseId
  ) {
    throw new Error(
      "A case must be selected."
    );
  }

  if (
    !payload.file
  ) {
    throw new Error(
      "Please select a file."
    );
  }

  const form =
    new FormData();

  /*
   * Backend expects `caseId`.
   */
  form.append(
    "caseId",
    payload.caseId
  );

  /*
   * Backend controller expects `documentType`.
   */
  form.append(
    "documentType",
    payload.type
  );

  form.append(
    "title",
    payload.title
  );

  form.append(
    "description",
    payload.description
  );

  form.append(
    "sensitivity",
    payload.sensitivity
  );

  form.append(
    "file",
    payload.file
  );

  const token =
    getAccessToken();

  const response =
    await fetch(
      `${API_BASE_URL}/evidence/documents/upload`,
      {
        method: "POST",
        body: form,
        headers: token
          ? {
              Authorization:
                `Bearer ${token}`,
            }
          : undefined,
      }
    );

  const responseBody =
    await parseResponseBody(
      response
    );

  if (!response.ok) {
    throw new Error(
      getBackendError(
        responseBody,
        `Upload failed with status ${response.status}`
      )
    );
  }

  const result =
    unwrapData(
      responseBody
    );

  const version =
    result?.version;

  const document =
    result?.document;

  return {
    documentId:
      result?.documentId ??
      document?.documentId ??
      document?.id ??
      "",

    integrityHash:
      result?.integrityHash ??
      result?.sha256Hash ??
      version?.sha256Hash ??
      document?.sha256Hash ??
      "",

    version:
      Number(
        result?.versionNumber ??
          version?.versionNumber ??
          document?.currentVersion ??
          1
      ),
  };
}

/**
 * ============================================================================
 * SECURE DOCUMENT DOWNLOAD
 * ============================================================================
 */

export async function downloadDocument(
  documentId: string
): Promise<void> {
  if (
    typeof window ===
    "undefined"
  ) {
    throw new Error(
      "Document download must run in the browser."
    );
  }

  const token =
    getAccessToken();

  const response =
    await fetch(
      `${API_BASE_URL}/evidence/${encodeURIComponent(
        documentId
      )}/download`,
      {
        method: "GET",
        headers: {
          Accept: "*/*",
          ...(token
            ? {
                Authorization:
                  `Bearer ${token}`,
              }
            : {}),
        },
      }
    );

  if (!response.ok) {
    const body =
      await parseResponseBody(
        response
      );

    throw new Error(
      getBackendError(
        body,
        `Download failed with status ${response.status}`
      )
    );
  }

  const blob =
    await response.blob();

  if (
    !blob.size
  ) {
    throw new Error(
      "The server returned an empty document."
    );
  }

  /*
   * Preserve the filename returned by the backend.
   */
  const disposition =
    response.headers.get(
      "Content-Disposition"
    );

  let fileName =
    "secure-document";

  if (disposition) {
    const utf8Match =
      disposition.match(
        /filename\*=UTF-8''([^;]+)/i
      );

    const normalMatch =
      disposition.match(
        /filename="([^"]+)"/i
      );

    if (
      utf8Match?.[1]
    ) {
      try {
        fileName =
          decodeURIComponent(
            utf8Match[1]
          );
      } catch {
        fileName =
          utf8Match[1];
      }
    } else if (
      normalMatch?.[1]
    ) {
      fileName =
        normalMatch[1];
    }
  }

  const blobUrl =
    window.URL.createObjectURL(
      blob
    );

  const link =
    document.createElement(
      "a"
    );

  link.href =
    blobUrl;

  link.download =
    fileName;

  document.body.appendChild(
    link
  );

  link.click();

  link.remove();

  window.setTimeout(
    () => {
      window.URL.revokeObjectURL(
        blobUrl
      );
    },
    1000
  );
}

/**
 * ============================================================================
 * INTEGRITY VERIFICATION
 * ============================================================================
 */

export interface IntegrityCheckResult {
  documentId: string;
  storedHash: string;
  currentHash: string;
  match: boolean;
}

export async function verifyIntegrity(
  documentId: string
): Promise<IntegrityCheckResult> {
  try {
    const response =
      await apiFetch<any>(
        `/evidence/${encodeURIComponent(
          documentId
        )}/verify`,
        {
          method: "POST",
        }
      );

    const data =
      unwrapData(
        response
      );

    return {
      documentId:
        data?.documentId ??
        documentId,

      storedHash:
        data?.sha256Hash ??
        data?.storedHash ??
        "",

      currentHash:
        data?.liveHash ??
        data?.currentHash ??
        data?.sha256Hash ??
        "",

      match:
        data?.status ===
          "VERIFIED"
          ? true
          : data?.match ??
            data?.localMatch ===
              true,
    };
  } catch (error: any) {
    /*
     * The backend intentionally returns HTTP 409 when
     * integrity verification detects tampering.
     *
     * apiFetch throws an Error, so a normal Error object
     * cannot expose response.data here. We therefore re-run
     * the request manually below only when we need the
     * detailed tamper result.
     */

    /*
     * Preserve ordinary errors.
     */
    if (
      error instanceof Error
    ) {
      /*
       * The backend's tampered response is returned as:
       * success=false, status=TAMPERED.
       *
       * Because the generic fetch helper consumes the body,
       * the detailed result is handled by the page/backend
       * on ordinary failures.
       */
      throw error;
    }

    throw new Error(
      "Integrity verification failed."
    );
  }
}

/**
 * ============================================================================
 * REAL CHAIN OF CUSTODY
 * ============================================================================
 */

export async function getCustodyEvents(
  documentId: string
): Promise<CustodyEvent[]> {
  /*
   * Real backend endpoint:
   * GET /evidence/:documentId/custody
   */
  const response =
    await apiFetch<any>(
      `/evidence/${encodeURIComponent(
        documentId
      )}/custody`
    );

  const data =
    unwrapData(
      response
    );

  const timeline =
    Array.isArray(
      data?.timeline
    )
      ? data.timeline
      : Array.isArray(data)
        ? data
        : [];

  /*
   * CustodyEvent shape varies slightly between the
   * old frontend model and the new backend AuditEvent.
   *
   * We normalize the backend event into the frontend
   * component's expected structure.
   */
  return timeline.map(
    (
      event: any,
      index: number
    ) =>
      ({
        id:
          String(
            event?.id ??
              `${documentId}-${event?.timestamp ?? Date.now()}-${index}`
          ),

        documentId,

        action:
          event?.metadata
            ?.custodyAction ??
          event?.action ??
          "viewed",

        actor:
          event?.user
            ?.fullName ??
          event?.user
            ?.customUserId ??
          event?.userId ??
          "Unknown",

        actorRole:
          event?.user
            ?.role ??
          event?.metadata
            ?.actorRole ??
          "Unknown",

        timestamp:
          event?.timestamp ??
          event?.createdAt ??
          new Date().toISOString(),

        hash:
          event?.sha256Hash ??
          event?.metadata
            ?.sha256Hash ??
          "",

        blockchainTxHash:
          event
            ?.blockchainTxHash ??
          event?.metadata
            ?.blockchainTxHash ??
          null,

        details:
          event?.metadata
            ?.remarks ??
          event?.metadata
            ?.description ??
          event?.action ??
          "",
      } as CustodyEvent)
  );
}

/**
 ============================================================================
 * ADD / LOG CUSTODY EVENT
 * ============================================================================
 */

export async function logCustodyEvent(
  payload: {
    documentId: string;
    action: string;
    remarks?: string;
  }
): Promise<any> {
  return apiFetch<any>(
    "/evidence/custody",
    {
      method: "POST",
      body: JSON.stringify(
        payload
      ),
    }
  );
}

/**
 * ============================================================================
 * AUDIT EVENTS
 * ============================================================================
 */
export async function getAuditEvents(): Promise<AuditEvent[]> {
  const response = await apiFetch<any>("/audit");

  const data =
    response?.data ??
    response;

  const events =
    Array.isArray(data?.events)
      ? data.events
      : Array.isArray(data)
        ? data
        : [];

  return events.map(
    (event: any): AuditEvent => ({
      id: String(
        event?.id ??
          `${event?.timestamp ?? Date.now()}-${event?.action ?? "event"}`
      ),

      timestamp:
        event?.timestamp ??
        new Date().toISOString(),

      action:
        event?.action ??
        "System Event",

      // IMPORTANT:
      // Preserve the case identifier so the Case Activity
      // section can filter audit events correctly.
      caseId: String(
        event?.caseId ??
          event?.case?.caseId ??
          event?.case?.id ??
          ""
      ),

      documentName:
        event?.documentName ??
        event?.document?.title ??
        event?.documentId ??
        "System Event",

      documentId:
        String(
          event?.documentId ??
            event?.document?.documentId ??
            ""
        ),

      documentHash:
        event?.documentHash ??
        event?.sha256Hash ??
        "",

      ledgerStatus:
        event?.ledgerStatus ===
          "verified"
          ? "verified"
          : event?.ledgerStatus ===
              "flagged"
            ? "flagged"
            : "pending",

      user:
        event?.userName ??
        event?.user?.fullName ??
        event?.user?.customUserId ??
        "System",
    })
  );
}
/**
 * ============================================================================
 * SECURITY ALERTS
 * ============================================================================
 */export async function getAlerts(): Promise<SecurityAlert[]> {
  const response = await apiFetch<any>("/alerts");

  const data = response?.data ?? response;

  const alerts = Array.isArray(data?.alerts)
    ? data.alerts
    : Array.isArray(data)
      ? data
      : [];

  return alerts.map((alert: any): SecurityAlert => ({
    id: String(alert?.id ?? `alert-${Date.now()}`),

    title:
      alert?.title ??
      alert?.type ??
      "Security Alert",

    detail:
      alert?.detail ??
      alert?.message ??
      "Security event detected.",

    severity:
      alert?.severity ?? "medium",

    detectedAt:
      alert?.detectedAt ??
      alert?.createdAt ??
      new Date().toISOString(),

    resolvedBy:
      alert?.resolvedBy,

    documentId:
      alert?.documentId,

    caseId:
      alert?.caseId,
  }));
}

/**
 * ============================================================================
 * EMERGENCY ACCESS
 * ============================================================================
 */

export async function getEmergencyRequests(): Promise<
  EmergencyAccessRequest[]
> {
  if (
    USE_MOCK_AUXILIARY_DATA
  ) {
    return mockDelay(
      mockEmergencyRequests
    );
  }

  return apiFetch(
    "/emergency-access"
  );
}

export async function requestEmergencyAccess(
  payload: {
    caseId: string;
    documentId: string;
    reason: string;
    durationMinutes: number;
  }
): Promise<EmergencyAccessRequest> {
  if (
    USE_MOCK_AUXILIARY_DATA
  ) {
    return mockDelay({
      id: `em-${Date.now()}`,
      ...payload,
      requestedBy:
        "Officer A",
      status: "pending",
      requestedAt:
        new Date().toISOString(),
    });
  }

  return apiFetch(
    "/emergency-access",
    {
      method: "POST",
      body: JSON.stringify(
        payload
      ),
    }
  );
}

export async function decideEmergencyAccess(
  requestId: string,
  decision:
    | "approved"
    | "rejected"
): Promise<EmergencyAccessRequest> {
  if (
    USE_MOCK_AUXILIARY_DATA
  ) {
    const request =
      mockEmergencyRequests.find(
        (item) =>
          item.id ===
          requestId
      );

    if (
      !request
    ) {
      throw new Error(
        "Emergency access request not found."
      );
    }

    return mockDelay({
      ...request,
      status:
        decision,
      decidedBy:
        "Admin User",
    });
  }

  return apiFetch(
    `/emergency-access/${encodeURIComponent(
      requestId
    )}/decision`,
    {
      method: "POST",
      body: JSON.stringify({
        decision,
      }),
    }
  );
}

/**
 * ============================================================================
 * ADMIN / USERS
 * ============================================================================
 */

export async function getUsers(): Promise<User[]> {
  const response = await apiFetch<any>("/admin/users");

  const users = response?.data ?? response;

  return Array.isArray(users) ? users : [];
}
export async function createUser(
  payload: {
    name: string;
    employeeId: string;
    email: string;
    department: string;
    role: Role;
    assignedCaseIds: string[];
    permissions: string[];
  }
): Promise<User> {
  const backendRoleMap: Record<string, string> = {
    investigation_officer: "investigator",
    forensic_officer: "forensic",
    prosecutor: "lawyer",
    court_staff: "judge",
    administrator: "admin",
    auditor: "victim",
    police: "police",
  };

  const backendRole =
    backendRoleMap[payload.role] ?? payload.role;

  const response = await apiFetch<any>(
    "/admin/users",
    {
      method: "POST",
      body: JSON.stringify({
        ...payload,
        role: backendRole,
      }),
    }
  );

  const user = response?.data ?? response;

  return {
    ...user,
    role: payload.role,
  } as User;
}
// ==================== DOCUMENT PERMISSIONS ====================

export interface DocumentPermission {
  id: string;
  documentId: string;
  userId: string;
  action: string;
  grantedById?: string;
  expiresAt?: string | null;
  user?: {
    id: string;
    fullName?: string;
    email?: string;
  };
}

export async function getDocumentPermissions(
  documentId: string
): Promise<DocumentPermission[]> {
  const response = await apiFetch<any>(
    `/permissions/document/${documentId}`
  );

  return Array.isArray(response?.data)
    ? response.data
    : [];
}

export async function grantDocumentPermission(
  documentId: string,
  payload: {
    userId: string;
    action: string;
    expiresAt?: string | null;
  }
): Promise<DocumentPermission> {
  const response = await apiFetch<any>(
    `/permissions/document/${documentId}`,
    {
      method: "POST",
      body: JSON.stringify(payload),
    }
  );

  return response?.data ?? response;
}

export async function revokeDocumentPermission(
  documentId: string,
  permissionId: string
): Promise<void> {
  await apiFetch<any>(
    `/permissions/document/${documentId}/${permissionId}`,
    {
      method: "DELETE",
    }
  );
}
// ==================== DOCUMENTS BY CASE ====================

export async function getDocumentsByCase(
  caseId: string
): Promise<any[]> {
  const response = await apiFetch<any>(
    `/evidence/case/${caseId}`
  );

  const documents =
    response?.data?.documents ??
    response?.documents ??
    response?.data ??
    response;

  return Array.isArray(documents)
    ? documents
    : [];
}
