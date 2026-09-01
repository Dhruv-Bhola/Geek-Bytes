-- Secure Evidence DMS PostgreSQL Database Schema
-- Mirrors server/prisma/schema.prisma. Used for direct SQL provisioning
-- (e.g. docker-entrypoint-initdb.d) and as the authoritative reference.

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ======================
-- ENUM TYPES
-- ======================

CREATE TYPE user_role AS ENUM ('police', 'investigator', 'lawyer', 'judge', 'victim', 'admin');
CREATE TYPE severity_level AS ENUM ('low', 'medium', 'high', 'critical');
CREATE TYPE complaint_status AS ENUM ('submitted', 'classified', 'case_created', 'rejected');
CREATE TYPE case_status AS ENUM ('open', 'under_investigation', 'chargesheet_filed', 'court_disposed');
CREATE TYPE source_type AS ENUM ('victim', 'police', 'forensic');
CREATE TYPE evidence_type AS ENUM ('screenshot', 'video', 'audio', 'cctv', 'chat_export', 'document', 'other');
CREATE TYPE integrity_status AS ENUM ('verified', 'pending', 'tampered');
CREATE TYPE custody_action AS ENUM (
    'uploaded', 'verified', 'accessed', 'received',
    'analysis_completed', 'transferred', 'report_generated'
);

-- ======================
-- TABLES
-- ======================

-- 1. Users
CREATE TABLE users (
    id                 UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    custom_user_id     VARCHAR(100) UNIQUE NOT NULL,   -- e.g. officer_rahul, victim_jane
    full_name          VARCHAR(255) NOT NULL,
    email              VARCHAR(255) UNIQUE NOT NULL,
    phone              VARCHAR(20),
    password_hash      VARCHAR(255) NOT NULL,           -- bcrypt, salt rounds = 12
    role               user_role NOT NULL,
    badge_number       VARCHAR(50),
    jurisdiction_cell  VARCHAR(255),                    -- e.g. 'Cyber Crime / Women Safety Cell'
    mfa_secret         VARCHAR(255),
    created_at         TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at         TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_users_role ON users(role);
CREATE INDEX idx_users_jurisdiction ON users(jurisdiction_cell);

-- 2. Complaints
CREATE TABLE complaints (
    id                   UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    complaint_id         VARCHAR(20) UNIQUE NOT NULL,   -- CC-XXXXX
    victim_id            UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    victim_name          VARCHAR(255) NOT NULL,
    contact_number       VARCHAR(20) NOT NULL,
    incident_date        TIMESTAMP WITH TIME ZONE NOT NULL,
    platform             VARCHAR(100) NOT NULL,          -- Instagram, WhatsApp, Telegram
    crime_description    TEXT NOT NULL,
    location             VARCHAR(255),
    additional_details   TEXT,
    ai_predicted_category VARCHAR(100),                   -- from AI engine
    ai_confidence        DOUBLE PRECISION NOT NULL DEFAULT 0.0,
    severity             severity_level NOT NULL DEFAULT 'medium',
    assigned_cell        VARCHAR(255),                    -- e.g. 'Cyber Crime / Women Safety Cell'
    status               complaint_status NOT NULL DEFAULT 'submitted',
    created_at           TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at           TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_complaints_victim_id ON complaints(victim_id);
CREATE INDEX idx_complaints_status ON complaints(status);
CREATE INDEX idx_complaints_cell ON complaints(assigned_cell);

-- 3. Cases
CREATE TABLE cases (
    id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    case_id               VARCHAR(20) UNIQUE NOT NULL,   -- CYB-XXXX
    complaint_id          UUID UNIQUE NOT NULL REFERENCES complaints(id) ON DELETE CASCADE,
    assigned_officer_id   UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    case_title            VARCHAR(500) NOT NULL,
    status                case_status NOT NULL DEFAULT 'open',
    risk_score            DOUBLE PRECISION NOT NULL DEFAULT 0.0,
    created_at            TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at            TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_cases_officer ON cases(assigned_officer_id);
CREATE INDEX idx_cases_status ON cases(status);

-- 4. Evidence
CREATE TABLE evidence (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    evidence_id         VARCHAR(10) UNIQUE NOT NULL,     -- E-XXX
    case_id             UUID REFERENCES cases(id) ON DELETE SET NULL,  -- nullable before case creation
    complaint_id        UUID NOT NULL REFERENCES complaints(id) ON DELETE CASCADE,
    uploaded_by_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    source_type         source_type NOT NULL,            -- victim / police / forensic
    evidence_type       evidence_type NOT NULL,          -- screenshot / video / cctv / ...
    file_url            VARCHAR(1000) NOT NULL,          -- S3 or encrypted local path
    sha256_hash         CHAR(64),                        -- original cryptographic hash
    blockchain_tx_hash  VARCHAR(100),                    -- on-chain anchor reference
    integrity_status    integrity_status NOT NULL DEFAULT 'pending',
    metadata            JSONB,                           -- device info, capture times, OCR text, URLs
    created_at          TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_evidence_case_id ON evidence(case_id);
CREATE INDEX idx_evidence_complaint_id ON evidence(complaint_id);
CREATE INDEX idx_evidence_integrity ON evidence(integrity_status);

-- 5. Chain of Custody Logs (append-only, immutable audit trail)
CREATE TABLE chain_of_custody_logs (
    id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    evidence_id           UUID NOT NULL REFERENCES evidence(id) ON DELETE CASCADE,
    actor_id              UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    actor_role            VARCHAR(100) NOT NULL,
    action                custody_action NOT NULL,
    recorded_sha256_hash  CHAR(64) NOT NULL,
    remarks               TEXT,
    timestamp             TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_coc_evidence_id ON chain_of_custody_logs(evidence_id);
CREATE INDEX idx_coc_timestamp ON chain_of_custody_logs(timestamp);

-- ======================
-- TRIGGERS (auto-update updated_at)
-- ======================

CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_users_updated_at
    BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_complaints_updated_at
    BEFORE UPDATE ON complaints FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_cases_updated_at
    BEFORE UPDATE ON cases FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ======================
-- VIEWS
-- ======================

-- Evidence integrity overview (SHA-256 + blockchain anchor status)
CREATE VIEW v_evidence_integrity AS
SELECT
    e.evidence_id,
    e.evidence_type,
    e.integrity_status,
    e.sha256_hash,
    e.blockchain_tx_hash,
    c.case_id,
    u.custom_user_id AS uploaded_by,
    e.created_at
FROM evidence e
JOIN cases c ON c.id = e.case_id
JOIN users u ON u.id = e.uploaded_by_id;

-- Full chain of custody, denormalized for legal read access
CREATE VIEW v_custody_audit AS
SELECT
    coc.id,
    e.evidence_id,
    e.sha256_hash,
    u.custom_user_id AS actor,
    coc.actor_role,
    coc.action,
    coc.recorded_sha256_hash,
    coc.remarks,
    coc.timestamp
FROM chain_of_custody_logs coc
JOIN evidence e ON e.id = coc.evidence_id
JOIN users u ON u.id = coc.actor_id
ORDER BY coc.timestamp;
