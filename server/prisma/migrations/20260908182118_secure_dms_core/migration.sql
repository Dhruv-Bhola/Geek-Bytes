-- CreateEnum
CREATE TYPE "Role" AS ENUM ('police', 'investigator', 'forensic', 'lawyer', 'judge', 'victim', 'admin');

-- CreateEnum
CREATE TYPE "Severity" AS ENUM ('low', 'medium', 'high', 'critical');

-- CreateEnum
CREATE TYPE "ComplaintStatus" AS ENUM ('submitted', 'classified', 'case_created', 'rejected');

-- CreateEnum
CREATE TYPE "CaseStatus" AS ENUM ('open', 'under_investigation', 'chargesheet_filed', 'court_disposed');

-- CreateEnum
CREATE TYPE "SourceType" AS ENUM ('victim', 'police', 'forensic');

-- CreateEnum
CREATE TYPE "EvidenceType" AS ENUM ('screenshot', 'video', 'audio', 'cctv', 'chat_export', 'document', 'other');

-- CreateEnum
CREATE TYPE "IntegrityStatus" AS ENUM ('verified', 'pending', 'tampered');

-- CreateEnum
CREATE TYPE "CustodyAction" AS ENUM ('uploaded', 'verified', 'accessed', 'received', 'analysis_completed', 'transferred', 'report_generated');

-- CreateEnum
CREATE TYPE "DocumentSensitivity" AS ENUM ('normal', 'confidential', 'highly_confidential', 'restricted');

-- CreateEnum
CREATE TYPE "DocumentAction" AS ENUM ('view', 'download', 'upload', 'update', 'transfer', 'verify');

-- CreateEnum
CREATE TYPE "AssignmentStatus" AS ENUM ('active', 'revoked');

-- CreateEnum
CREATE TYPE "AuditAction" AS ENUM ('login_success', 'login_failed', 'document_uploaded', 'document_viewed', 'document_downloaded', 'document_updated', 'document_verified', 'document_transferred', 'access_denied', 'emergency_access', 'emergency_access_expired');

-- CreateEnum
CREATE TYPE "AlertSeverity" AS ENUM ('low', 'medium', 'high', 'critical');

-- CreateEnum
CREATE TYPE "AlertType" AS ENUM ('integrity_mismatch', 'unauthorized_access', 'repeated_login_failure', 'emergency_access', 'blockchain_failure', 'suspicious_activity');

-- CreateEnum
CREATE TYPE "AlertStatus" AS ENUM ('open', 'acknowledged', 'resolved');

-- CreateEnum
CREATE TYPE "EmergencyAccessStatus" AS ENUM ('pending', 'approved', 'rejected', 'expired', 'revoked');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "custom_user_id" TEXT NOT NULL,
    "full_name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT,
    "password_hash" TEXT NOT NULL,
    "role" "Role" NOT NULL,
    "badge_number" TEXT,
    "jurisdiction_cell" TEXT,
    "mfa_secret" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "failed_login_count" INTEGER NOT NULL DEFAULT 0,
    "locked_until" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "complaints" (
    "id" TEXT NOT NULL,
    "complaint_id" TEXT NOT NULL,
    "victim_id" TEXT NOT NULL,
    "victim_name" TEXT NOT NULL,
    "contact_number" TEXT NOT NULL,
    "incident_date" TIMESTAMP(3) NOT NULL,
    "platform" TEXT NOT NULL,
    "crime_description" TEXT NOT NULL,
    "location" TEXT,
    "additional_details" TEXT,
    "ai_predicted_category" TEXT NOT NULL,
    "ai_confidence" DOUBLE PRECISION NOT NULL DEFAULT 0.0,
    "severity" "Severity" NOT NULL DEFAULT 'medium',
    "assigned_cell" TEXT,
    "status" "ComplaintStatus" NOT NULL DEFAULT 'submitted',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "complaints_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cases" (
    "id" TEXT NOT NULL,
    "case_id" TEXT NOT NULL,
    "complaint_id" TEXT NOT NULL,
    "assigned_officer_id" TEXT NOT NULL,
    "case_title" TEXT NOT NULL,
    "status" "CaseStatus" NOT NULL DEFAULT 'open',
    "risk_score" DOUBLE PRECISION NOT NULL DEFAULT 0.0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "cases_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "case_assignments" (
    "id" TEXT NOT NULL,
    "case_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "assigned_role" "Role" NOT NULL,
    "assigned_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "assigned_by" TEXT NOT NULL,
    "status" "AssignmentStatus" NOT NULL DEFAULT 'active',

    CONSTRAINT "case_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "documents" (
    "id" TEXT NOT NULL,
    "document_id" TEXT NOT NULL,
    "case_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "document_type" TEXT NOT NULL,
    "sensitivity" "DocumentSensitivity" NOT NULL DEFAULT 'confidential',
    "description" TEXT,
    "current_version" INTEGER NOT NULL DEFAULT 1,
    "integrity_status" "IntegrityStatus" NOT NULL DEFAULT 'pending',
    "created_by_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "document_versions" (
    "id" TEXT NOT NULL,
    "document_id" TEXT NOT NULL,
    "version_number" INTEGER NOT NULL,
    "original_file_name" TEXT NOT NULL,
    "mime_type" TEXT NOT NULL,
    "file_size" BIGINT NOT NULL,
    "storage_path" TEXT NOT NULL,
    "sha256_hash" TEXT NOT NULL,
    "encryption_metadata" JSONB,
    "uploaded_by_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "document_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "document_permissions" (
    "id" TEXT NOT NULL,
    "document_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "action" "DocumentAction" NOT NULL,
    "granted_by_id" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "document_permissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_events" (
    "id" TEXT NOT NULL,
    "user_id" TEXT,
    "case_id" TEXT,
    "document_id" TEXT,
    "version_id" TEXT,
    "action" "AuditAction" NOT NULL,
    "sha256_hash" TEXT,
    "blockchain_tx_hash" TEXT,
    "blockchain_block" INTEGER,
    "metadata" JSONB,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "security_alerts" (
    "id" TEXT NOT NULL,
    "type" "AlertType" NOT NULL,
    "severity" "AlertSeverity" NOT NULL,
    "message" TEXT NOT NULL,
    "document_id" TEXT,
    "case_id" TEXT,
    "user_id" TEXT,
    "status" "AlertStatus" NOT NULL DEFAULT 'open',
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolved_at" TIMESTAMP(3),

    CONSTRAINT "security_alerts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "emergency_access" (
    "id" TEXT NOT NULL,
    "document_id" TEXT NOT NULL,
    "requester_id" TEXT NOT NULL,
    "approver_id" TEXT,
    "reason" TEXT NOT NULL,
    "status" "EmergencyAccessStatus" NOT NULL DEFAULT 'pending',
    "requested_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "approved_at" TIMESTAMP(3),
    "expires_at" TIMESTAMP(3),
    "revoked_at" TIMESTAMP(3),

    CONSTRAINT "emergency_access_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "evidence" (
    "id" TEXT NOT NULL,
    "evidence_id" TEXT NOT NULL,
    "case_id" TEXT,
    "complaint_id" TEXT NOT NULL,
    "uploaded_by_id" TEXT NOT NULL,
    "source_type" "SourceType" NOT NULL,
    "evidence_type" "EvidenceType" NOT NULL,
    "file_url" TEXT NOT NULL,
    "sha256_hash" TEXT,
    "blockchain_tx_hash" TEXT,
    "blockchain_block" INTEGER,
    "blockchain_status" TEXT,
    "integrity_status" "IntegrityStatus" NOT NULL DEFAULT 'pending',
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "evidence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "chain_of_custody_logs" (
    "id" TEXT NOT NULL,
    "evidence_id" TEXT NOT NULL,
    "actor_id" TEXT NOT NULL,
    "actor_role" TEXT NOT NULL,
    "action" "CustodyAction" NOT NULL,
    "recorded_sha256_hash" TEXT NOT NULL,
    "remarks" TEXT,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "chain_of_custody_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_custom_user_id_key" ON "users"("custom_user_id");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "complaints_complaint_id_key" ON "complaints"("complaint_id");

-- CreateIndex
CREATE UNIQUE INDEX "cases_case_id_key" ON "cases"("case_id");

-- CreateIndex
CREATE UNIQUE INDEX "cases_complaint_id_key" ON "cases"("complaint_id");

-- CreateIndex
CREATE INDEX "case_assignments_user_id_idx" ON "case_assignments"("user_id");

-- CreateIndex
CREATE INDEX "case_assignments_case_id_idx" ON "case_assignments"("case_id");

-- CreateIndex
CREATE INDEX "case_assignments_status_idx" ON "case_assignments"("status");

-- CreateIndex
CREATE UNIQUE INDEX "case_assignments_case_id_user_id_key" ON "case_assignments"("case_id", "user_id");

-- CreateIndex
CREATE UNIQUE INDEX "documents_document_id_key" ON "documents"("document_id");

-- CreateIndex
CREATE INDEX "documents_case_id_idx" ON "documents"("case_id");

-- CreateIndex
CREATE INDEX "documents_document_type_idx" ON "documents"("document_type");

-- CreateIndex
CREATE INDEX "documents_sensitivity_idx" ON "documents"("sensitivity");

-- CreateIndex
CREATE INDEX "documents_integrity_status_idx" ON "documents"("integrity_status");

-- CreateIndex
CREATE INDEX "document_versions_document_id_idx" ON "document_versions"("document_id");

-- CreateIndex
CREATE INDEX "document_versions_uploaded_by_id_idx" ON "document_versions"("uploaded_by_id");

-- CreateIndex
CREATE INDEX "document_versions_sha256_hash_idx" ON "document_versions"("sha256_hash");

-- CreateIndex
CREATE UNIQUE INDEX "document_versions_document_id_version_number_key" ON "document_versions"("document_id", "version_number");

-- CreateIndex
CREATE INDEX "document_permissions_user_id_idx" ON "document_permissions"("user_id");

-- CreateIndex
CREATE INDEX "document_permissions_document_id_idx" ON "document_permissions"("document_id");

-- CreateIndex
CREATE INDEX "document_permissions_expires_at_idx" ON "document_permissions"("expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "document_permissions_document_id_user_id_action_key" ON "document_permissions"("document_id", "user_id", "action");

-- CreateIndex
CREATE INDEX "audit_events_user_id_idx" ON "audit_events"("user_id");

-- CreateIndex
CREATE INDEX "audit_events_case_id_idx" ON "audit_events"("case_id");

-- CreateIndex
CREATE INDEX "audit_events_document_id_idx" ON "audit_events"("document_id");

-- CreateIndex
CREATE INDEX "audit_events_version_id_idx" ON "audit_events"("version_id");

-- CreateIndex
CREATE INDEX "audit_events_action_idx" ON "audit_events"("action");

-- CreateIndex
CREATE INDEX "audit_events_timestamp_idx" ON "audit_events"("timestamp");

-- CreateIndex
CREATE INDEX "security_alerts_severity_idx" ON "security_alerts"("severity");

-- CreateIndex
CREATE INDEX "security_alerts_status_idx" ON "security_alerts"("status");

-- CreateIndex
CREATE INDEX "security_alerts_document_id_idx" ON "security_alerts"("document_id");

-- CreateIndex
CREATE INDEX "security_alerts_case_id_idx" ON "security_alerts"("case_id");

-- CreateIndex
CREATE INDEX "security_alerts_user_id_idx" ON "security_alerts"("user_id");

-- CreateIndex
CREATE INDEX "security_alerts_created_at_idx" ON "security_alerts"("created_at");

-- CreateIndex
CREATE INDEX "emergency_access_document_id_idx" ON "emergency_access"("document_id");

-- CreateIndex
CREATE INDEX "emergency_access_requester_id_idx" ON "emergency_access"("requester_id");

-- CreateIndex
CREATE INDEX "emergency_access_approver_id_idx" ON "emergency_access"("approver_id");

-- CreateIndex
CREATE INDEX "emergency_access_status_idx" ON "emergency_access"("status");

-- CreateIndex
CREATE INDEX "emergency_access_expires_at_idx" ON "emergency_access"("expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "evidence_evidence_id_key" ON "evidence"("evidence_id");

-- CreateIndex
CREATE INDEX "evidence_case_id_idx" ON "evidence"("case_id");

-- CreateIndex
CREATE INDEX "evidence_complaint_id_idx" ON "evidence"("complaint_id");

-- CreateIndex
CREATE INDEX "evidence_uploaded_by_id_idx" ON "evidence"("uploaded_by_id");

-- CreateIndex
CREATE INDEX "evidence_sha256_hash_idx" ON "evidence"("sha256_hash");

-- CreateIndex
CREATE INDEX "chain_of_custody_logs_evidence_id_idx" ON "chain_of_custody_logs"("evidence_id");

-- CreateIndex
CREATE INDEX "chain_of_custody_logs_actor_id_idx" ON "chain_of_custody_logs"("actor_id");

-- CreateIndex
CREATE INDEX "chain_of_custody_logs_timestamp_idx" ON "chain_of_custody_logs"("timestamp");

-- AddForeignKey
ALTER TABLE "complaints" ADD CONSTRAINT "complaints_victim_id_fkey" FOREIGN KEY ("victim_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cases" ADD CONSTRAINT "cases_complaint_id_fkey" FOREIGN KEY ("complaint_id") REFERENCES "complaints"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cases" ADD CONSTRAINT "cases_assigned_officer_id_fkey" FOREIGN KEY ("assigned_officer_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "case_assignments" ADD CONSTRAINT "case_assignments_case_id_fkey" FOREIGN KEY ("case_id") REFERENCES "cases"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "case_assignments" ADD CONSTRAINT "case_assignments_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "case_assignments" ADD CONSTRAINT "case_assignments_assigned_by_fkey" FOREIGN KEY ("assigned_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documents" ADD CONSTRAINT "documents_case_id_fkey" FOREIGN KEY ("case_id") REFERENCES "cases"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documents" ADD CONSTRAINT "documents_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_versions" ADD CONSTRAINT "document_versions_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "documents"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_versions" ADD CONSTRAINT "document_versions_uploaded_by_id_fkey" FOREIGN KEY ("uploaded_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_permissions" ADD CONSTRAINT "document_permissions_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "documents"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_permissions" ADD CONSTRAINT "document_permissions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_permissions" ADD CONSTRAINT "document_permissions_granted_by_id_fkey" FOREIGN KEY ("granted_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_case_id_fkey" FOREIGN KEY ("case_id") REFERENCES "cases"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "documents"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_version_id_fkey" FOREIGN KEY ("version_id") REFERENCES "document_versions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "security_alerts" ADD CONSTRAINT "security_alerts_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "documents"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "security_alerts" ADD CONSTRAINT "security_alerts_case_id_fkey" FOREIGN KEY ("case_id") REFERENCES "cases"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "security_alerts" ADD CONSTRAINT "security_alerts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "emergency_access" ADD CONSTRAINT "emergency_access_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "documents"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "emergency_access" ADD CONSTRAINT "emergency_access_requester_id_fkey" FOREIGN KEY ("requester_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "emergency_access" ADD CONSTRAINT "emergency_access_approver_id_fkey" FOREIGN KEY ("approver_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evidence" ADD CONSTRAINT "evidence_case_id_fkey" FOREIGN KEY ("case_id") REFERENCES "cases"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evidence" ADD CONSTRAINT "evidence_complaint_id_fkey" FOREIGN KEY ("complaint_id") REFERENCES "complaints"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evidence" ADD CONSTRAINT "evidence_uploaded_by_id_fkey" FOREIGN KEY ("uploaded_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chain_of_custody_logs" ADD CONSTRAINT "chain_of_custody_logs_evidence_id_fkey" FOREIGN KEY ("evidence_id") REFERENCES "evidence"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chain_of_custody_logs" ADD CONSTRAINT "chain_of_custody_logs_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
