-- Migration: 002_add_partitioning.sql
-- Partition audit_logs by month for performance on large datasets

-- Note: This migration is for production scaling.
-- Run after initial schema creation and when audit_logs exceeds 1M rows.

-- Create partitioned audit_logs table (if migrating from non-partitioned)
-- ALTER TABLE audit_logs RENAME TO audit_logs_old;

-- CREATE TABLE audit_logs (
--     id UUID DEFAULT uuid_generate_v4(),
--     action VARCHAR(50) NOT NULL,
--     entity_type VARCHAR(50) NOT NULL,
--     entity_id UUID NOT NULL,
--     user_id UUID REFERENCES users(id) ON DELETE SET NULL,
--     details JSONB,
--     ip_address VARCHAR(45),
--     tx_hash VARCHAR(100),
--     created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
--     PRIMARY KEY (id, created_at)
-- ) PARTITION BY RANGE (created_at);

-- Create monthly partitions
-- CREATE TABLE audit_logs_2026_01 PARTITION OF audit_logs
--     FOR VALUES FROM ('2026-01-01') TO ('2026-02-01');
-- CREATE TABLE audit_logs_2026_02 PARTITION OF audit_logs
--     FOR VALUES FROM ('2026-02-01') TO ('2026-03-01');
-- ... (auto-generate with pg_partman)

-- Enable pg_partman for automatic partition management
CREATE EXTENSION IF NOT EXISTS pg_partman;
