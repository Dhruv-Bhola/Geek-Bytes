-- Migration: 001_create_indexes.sql
-- Additional performance indexes for high-traffic queries

-- Composite index for evidence lookups by case + status
CREATE INDEX IF NOT EXISTS idx_evidence_case_status
    ON evidence(case_id, status);

-- Composite index for complaint lookup by status + crime type
CREATE INDEX IF NOT EXISTS idx_complaints_status_crime
    ON complaints(status, crime_type);

-- Composite index for audit log queries by entity + time
CREATE INDEX IF NOT EXISTS idx_audit_entity_time
    ON audit_logs(entity_type, entity_id, created_at DESC);

-- Index for custody log timeline queries
CREATE INDEX IF NOT EXISTS idx_custody_timeline
    ON custody_logs(case_id, created_at DESC);

-- Full-text search index on complaint descriptions
CREATE INDEX IF NOT EXISTS idx_complaints_search
    ON complaints USING GIN(to_tsvector('english', title || ' ' || description));

-- Full-text search index on case descriptions
CREATE INDEX IF NOT EXISTS idx_cases_search
    ON cases USING GIN(to_tsvector('english', title || ' ' || COALESCE(description, '')));
