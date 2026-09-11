/**
 * ============================================================================
 * SHARED TYPES — FRONTEND/BACKEND CONTRACT
 * ============================================================================
 *
 * These interfaces describe the JSON data consumed by the frontend.
 *
 * They do not communicate directly with PostgreSQL, blockchain or storage.
 * The backend remains responsible for authorization, validation and security.
 * ============================================================================
 */

/* ============================================================================
   ROLES
   ========================================================================== */

export type Role =
  | "investigation_officer"
  | "forensic_officer"
  | "prosecutor"
  | "court_staff"
  | "administrator"
  | "auditor";

/* ============================================================================
   USER
   ========================================================================== */

export interface User {
  id: string;
  name: string;
  employeeId: string;
  department: string;
  role: Role;
  assignedCaseIds: string[];
  permissions: Permission[];
  active: boolean;
}

export type Permission =
  | "view"
  | "upload"
  | "update"
  | "download"
  | "delete"
  | "manage_users"
  | "approve_emergency_access";

/* ============================================================================
   CASE
   ========================================================================== */

export type CaseStatus = "active" | "review" | "closed";

export interface Case {
  id: string;
  firNumber: string;
  title: string;
  department: string;
  status: CaseStatus;
  policeStation: string;
  investigatingOfficer: string;
  createdAt: string;

  documentSummary: {
    fir: number;
    investigationReports: number;
    witnessStatements: number;
    forensicReports: number;
    courtDocuments: number;
    evidenceFiles: number;
  };
}

/* ============================================================================
   DOCUMENT
   ========================================================================== */

export type DocumentType =
  | "FIR"
  | "Investigation Report"
  | "Witness Statement"
  | "Forensic Report"
  | "Court Document"
  | "Evidence";

export type IntegrityStatus =
  | "verified"
  | "review"
  | "mismatch";

export type Sensitivity =
  | "normal"
  | "confidential"
  | "highly_confidential";

export interface DocumentRecord {
  id: string;
  name: string;
  caseId: string;
  type: DocumentType;

  version: number;

  sensitivity: Sensitivity;

  integrityStatus: IntegrityStatus;

  storedHash: string;
  currentHash: string;

  uploadedBy: string;
  uploadedAt: string;

  encryptionActive: boolean;

  blockchainRecorded: boolean;

  /**
   * Actions the authenticated user can perform on this document.
   *
   * Examples:
   * ["view"]
   * ["view", "download"]
   * ["view", "download", "verify", "update"]
   */
  permissions?: string[];

  blockchainTxHash?: string | null;
  blockchainBlock?: number | null;
}

/* ============================================================================
   CHAIN OF CUSTODY
   ========================================================================== */

export type CustodyAction =
  | "UPLOADED DOCUMENT"
  | "VIEWED DOCUMENT"
  | "DOWNLOADED DOCUMENT"
  | "CREATED VERSION"
  | "VERIFIED INTEGRITY";

export interface CustodyEvent {
  id: string;
  documentId: string;
  actor: string;
  action: CustodyAction;
  hash?: string;
  timestamp: string;
}

/* ============================================================================
   AUDIT
   ========================================================================== */

export type AuditAction =
  | "UPLOAD"
  | "VIEW"
  | "UPDATE"
  | "DOWNLOAD"
  | "VERIFY";

export type LedgerStatus =
  | "verified"
  | "pending"
  | "flagged";

export interface AuditEvent {
  id: string;
  timestamp: string;

  action: string;

  /**
   * Public case identifier used by the frontend.
   */
  caseId?: string;

  documentName: string;
  documentId: string;
  documentHash: string;

  ledgerStatus: LedgerStatus;

  user: string;
}

/* ============================================================================
   SECURITY ALERTS
   ========================================================================== */

export type AlertSeverity =
  | "low"
  | "medium"
  | "high"
  | "critical"
  | "resolved";

export interface SecurityAlert {
  id: string;

  severity: AlertSeverity;

  title: string;

  detail: string;

  caseId?: string;

  documentId?: string;

  detectedAt: string;

  resolvedBy?: string;
}

/* ============================================================================
   EMERGENCY ACCESS
   ========================================================================== */

export type EmergencyAccessStatus =
  | "pending"
  | "approved"
  | "rejected"
  | "expired";

export interface EmergencyAccessRequest {
  id: string;

  caseId: string;

  documentId: string;

  requestedBy: string;

  reason: string;

  durationMinutes: number;

  status: EmergencyAccessStatus;

  requestedAt: string;

  decidedBy?: string;

  expiresAt?: string;
}

/* ============================================================================
   SYSTEM SECURITY
   ========================================================================== */

export interface SystemSecurityStatus {
  /**
   * Application-level document encryption.
   */
  encryption: boolean;

  /**
   * Trusted execution environment / security service.
   */
  teeSecurity: boolean;

  /**
   * Blockchain audit ledger availability.
   */
  blockchainLedger: boolean;

  /**
   * SHA-256 document integrity monitoring.
   */
  integrityMonitoring: boolean;

  /**
   * RBAC + case/document authorization.
   */
  accessControl: boolean;
}

/* ============================================================================
   DASHBOARD
   ========================================================================== */

export interface DashboardActivity {
  day: string;
  uploads: number;
  views: number;
}

export interface DashboardRecentActivity {
  id: string;
  actor: string;
  action: string;
  documentName: string;
  timestamp: string;
}

export interface DashboardSummary {
  totalDocuments: number;

  activeCases: number;

  securityAlerts: number;

  integrityIssues: number;

  recentActivity: DashboardRecentActivity[];

  systemSecurity: SystemSecurityStatus;

  /**
   * Last seven days of document activity.
   */
  weeklyActivity: DashboardActivity[];
}

/* ============================================================================
   PAGINATION
   ========================================================================== */

export interface Paginated<T> {
  items: T[];
  total: number;
}