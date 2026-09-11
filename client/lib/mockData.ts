/**
 * ============================================================================
 * MOCK DATA
 * ============================================================================
 * This is fake, in-memory, hard-coded data used ONLY so the UI has something
 * to show before the real backend exists. Nothing here is a security feature.
 * Delete this file's *usage* (not necessarily the file) once lib/api.ts talks
 * to a real backend — see the big comment at the top of lib/api.ts.
 * ============================================================================
 */

import type {
  AuditEvent,
  Case,
  CustodyEvent,
  DashboardSummary,
  DocumentRecord,
  EmergencyAccessRequest,
  SecurityAlert,
  User,
} from "./types";

export const mockUsers: User[] = [
  {
    id: "u1",
    name: "Officer A",
    employeeId: "EMP-1001",
    department: "Police",
    role: "investigation_officer",
    assignedCaseIds: ["1024", "1027"],
    permissions: ["view", "upload", "download"],
    active: true,
  },
  {
    id: "u2",
    name: "Forensic Officer B",
    employeeId: "EMP-2002",
    department: "Forensics",
    role: "forensic_officer",
    assignedCaseIds: ["1024"],
    permissions: ["view", "upload", "update", "download"],
    active: true,
  },
  {
    id: "u3",
    name: "Prosecutor C",
    employeeId: "EMP-3003",
    department: "Prosecution",
    role: "prosecutor",
    assignedCaseIds: ["1024"],
    permissions: ["view", "download"],
    active: true,
  },
  {
    id: "u4",
    name: "Court Staff D",
    employeeId: "EMP-4004",
    department: "Court",
    role: "court_staff",
    assignedCaseIds: ["1024"],
    permissions: ["view"],
    active: true,
  },
  {
    id: "u5",
    name: "Admin User",
    employeeId: "EMP-0001",
    department: "IT Administration",
    role: "administrator",
    assignedCaseIds: [],
    permissions: [
      "view",
      "upload",
      "update",
      "download",
      "delete",
      "manage_users",
      "approve_emergency_access",
    ],
    active: true,
  },
];

export const mockCases: Case[] = [
  {
    id: "1024",
    firNumber: "FIR-2026-1024",
    title: "Theft Investigation",
    department: "Police",
    status: "active",
    policeStation: "XYZ Police Station",
    investigatingOfficer: "Officer A",
    createdAt: "2026-09-04T09:00:00Z",
    documentSummary: {
      fir: 1,
      investigationReports: 4,
      witnessStatements: 7,
      forensicReports: 2,
      courtDocuments: 3,
      evidenceFiles: 12,
    },
  },
  {
    id: "1025",
    firNumber: "FIR-2026-1025",
    title: "Cyber Fraud",
    department: "Cyber Cell",
    status: "active",
    policeStation: "Cyber Cell HQ",
    investigatingOfficer: "Officer E",
    createdAt: "2026-08-20T09:00:00Z",
    documentSummary: {
      fir: 1,
      investigationReports: 2,
      witnessStatements: 3,
      forensicReports: 1,
      courtDocuments: 0,
      evidenceFiles: 5,
    },
  },
  {
    id: "1026",
    firNumber: "FIR-2026-1026",
    title: "Assault Case",
    department: "Police",
    status: "review",
    policeStation: "ABC Police Station",
    investigatingOfficer: "Officer F",
    createdAt: "2026-07-15T09:00:00Z",
    documentSummary: {
      fir: 1,
      investigationReports: 1,
      witnessStatements: 2,
      forensicReports: 0,
      courtDocuments: 1,
      evidenceFiles: 2,
    },
  },
];

export const mockDocuments: DocumentRecord[] = [
  {
    id: "DOC-1001",
    name: "FIR_1024.pdf",
    caseId: "1024",
    type: "FIR",
    version: 1,
    sensitivity: "normal",
    integrityStatus: "verified",
    storedHash: "A73F92E81C...",
    currentHash: "A73F92E81C...",
    uploadedBy: "Officer A",
    uploadedAt: "2026-09-06T10:21:00Z",
    encryptionActive: true,
    blockchainRecorded: true,
  },
  {
    id: "DOC-1002",
    name: "Forensic_1024.pdf",
    caseId: "1024",
    type: "Forensic Report",
    version: 3,
    sensitivity: "highly_confidential",
    integrityStatus: "verified",
    storedHash: "A73F92E81C...",
    currentHash: "A73F92E81C...",
    uploadedBy: "Forensic Officer B",
    uploadedAt: "2026-09-06T14:32:00Z",
    encryptionActive: true,
    blockchainRecorded: true,
  },
  {
    id: "DOC-1003",
    name: "Witness_A.pdf",
    caseId: "1024",
    type: "Witness Statement",
    version: 1,
    sensitivity: "confidential",
    integrityStatus: "verified",
    storedHash: "C10DA221...",
    currentHash: "C10DA221...",
    uploadedBy: "Officer A",
    uploadedAt: "2026-09-05T11:00:00Z",
    encryptionActive: true,
    blockchainRecorded: true,
  },
  {
    id: "DOC-1004",
    name: "ChargeSheet.pdf",
    caseId: "1024",
    type: "Court Document",
    version: 2,
    sensitivity: "confidential",
    integrityStatus: "review",
    storedHash: "A73F92E81C...",
    currentHash: "B91C82AF3E...",
    uploadedBy: "Prosecutor C",
    uploadedAt: "2026-09-07T09:15:00Z",
    encryptionActive: true,
    blockchainRecorded: true,
  },
];

export const mockCustodyEvents: CustodyEvent[] = [
  { id: "c1", documentId: "DOC-1002", actor: "Officer A", action: "UPLOADED DOCUMENT", hash: "A73F92...", timestamp: "2026-09-06T10:21:00Z" },
  { id: "c2", documentId: "DOC-1002", actor: "Forensic Officer B", action: "VIEWED DOCUMENT", timestamp: "2026-09-06T11:04:00Z" },
  { id: "c3", documentId: "DOC-1002", actor: "Forensic Officer B", action: "CREATED VERSION", hash: "B82AC1...", timestamp: "2026-09-06T14:32:00Z" },
  { id: "c4", documentId: "DOC-1002", actor: "Prosecutor C", action: "DOWNLOADED DOCUMENT", timestamp: "2026-09-06T16:10:00Z" },
  { id: "c5", documentId: "DOC-1002", actor: "Court Staff D", action: "VIEWED DOCUMENT", timestamp: "2026-09-07T09:15:00Z" },
];

export const mockAuditEvents: AuditEvent[] = [
  { id: "BLK-829391", documentId: "DOC-1001", documentName: "FIR_1024.pdf", user: "Officer A", action: "UPLOAD", timestamp: "2026-09-06T10:21:32Z", documentHash: "A73F92...", ledgerStatus: "verified" },
  { id: "BLK-829392", documentId: "DOC-1001", documentName: "FIR_1024.pdf", user: "Officer B", action: "VIEW", timestamp: "2026-09-06T11:04:00Z", documentHash: "A73F92...", ledgerStatus: "verified" },
  { id: "BLK-829393", documentId: "DOC-1002", documentName: "Forensic_1024.pdf", user: "Officer B", action: "UPDATE", timestamp: "2026-09-06T14:32:00Z", documentHash: "B82AC1...", ledgerStatus: "verified" },
  { id: "BLK-829394", documentId: "DOC-1004", documentName: "ChargeSheet.pdf", user: "Prosecutor C", action: "DOWNLOAD", timestamp: "2026-09-06T16:10:00Z", documentHash: "B91C82AF3E...", ledgerStatus: "flagged" },
];

export const mockAlerts: SecurityAlert[] = [
  {
    id: "al1",
    severity: "critical",
    title: "Document integrity mismatch",
    detail: "ChargeSheet.pdf — hash mismatch detected",
    caseId: "1024",
    documentId: "DOC-1004",
    detectedAt: "2026-09-07T14:32:00Z",
  },
  {
    id: "al2",
    severity: "high",
    title: "Unauthorized access attempt",
    detail: "Case #1027 — user Officer C",
    caseId: "1027",
    detectedAt: "2026-09-06T09:12:00Z",
  },
  {
    id: "al3",
    severity: "resolved",
    title: "Emergency access request",
    detail: "Case #1024 — approved by Admin",
    caseId: "1024",
    detectedAt: "2026-09-05T08:00:00Z",
    resolvedBy: "Admin User",
  },
];

export const mockEmergencyRequests: EmergencyAccessRequest[] = [
  {
    id: "em1",
    caseId: "1024",
    documentId: "DOC-1003",
    requestedBy: "Officer A",
    reason: "Required for immediate investigation",
    durationMinutes: 30,
    status: "pending",
    requestedAt: "2026-09-07T10:00:00Z",
  },
];

export const mockDashboardSummary: DashboardSummary = {
  totalDocuments: 128,
  activeCases: 42,
  securityAlerts: 3,
  integrityIssues: 2,
  recentActivity: [
    { id: "a1", actor: "Officer A", action: "uploaded", documentName: "FIR_1024.pdf", timestamp: "2026-09-06T10:21:00Z" },
    { id: "a2", actor: "Forensic B", action: "viewed", documentName: "Report_1024.pdf", timestamp: "2026-09-06T11:04:00Z" },
    { id: "a3", actor: "Prosecutor C", action: "downloaded", documentName: "ChargeSheet.pdf", timestamp: "2026-09-06T16:10:00Z" },
  ],
  systemSecurity: {
    encryption: true,
    teeSecurity: true,
    blockchainLedger: true,
    integrityMonitoring: true,
    accessControl: true,
  },
  weeklyActivity: [
    { day: "Mon", uploads: 8, views: 22 },
    { day: "Tue", uploads: 12, views: 30 },
    { day: "Wed", uploads: 6, views: 18 },
    { day: "Thu", uploads: 15, views: 34 },
    { day: "Fri", uploads: 10, views: 26 },
    { day: "Sat", uploads: 3, views: 9 },
    { day: "Sun", uploads: 5, views: 14 },
  ],
};
