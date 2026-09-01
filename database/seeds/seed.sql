-- Secure Evidence DMS Seed Data (SQL)
-- Run AFTER database/schema.sql:  \i seeds/seed.sql
-- Mirrors database/seeds/seed.js (the canonical Node seed).

-- ======================
-- DEMO USERS
-- ======================

-- bcrypt hash of "password123" (12 rounds)
-- $2a$12$GJ2zKJvU7vQ6xGqJvFpUJO8lB6fV3k1mJ9TzXyPzH1c2d3e4f5g6h7i8j

INSERT INTO users (custom_user_id, full_name, email, phone, password_hash, role, badge_number, jurisdiction_cell) VALUES
    ('victim_jane',     'Jane Doe',                'jane@example.com',        '+91-9812345678', '$2a$12$GJ2zKJvU7vQ6xGqJvFpUJO8lB6fV3k1mJ9TzXyPzH1c2d3e4f5g6h7i8j', 'victim',       NULL,             NULL),
    ('officer_rahul',   'Inspector Rahul Sharma',  'rahul.sharma@cyber.gov',  '+91-9123456780', '$2a$12$GJ2zKJvU7vQ6xGqJvFpUJO8lB6fV3k1mJ9TzXyPzH1c2d3e4f5g6h7i8j', 'police',       'BH-CRC-1847',    'Cyber Crime / Women Safety Cell'),
    ('forensic_anil',   'Forensic Officer Anil Kumar', 'anil@forensic.gov',   '+91-9988776655', '$2a$12$GJ2zKJvU7vQ6xGqJvFpUJO8lB6fV3k1mJ9TzXyPzH1c2d3e4f5g6h7i8j', 'investigator', 'DFL-0291',       'Digital Forensics Lab'),
    ('legal_verma',     'Advocate Amit Verma',      'verma@legal.gov',         '+91-9887766554', '$2a$12$GJ2zKJvU7vQ6xGqJvFpUJO8lB6fV3k1mJ9TzXyPzH1c2d3e4f5g6h7i8j', 'lawyer',       'PPO-1203',       'Public Prosecutor Office')
ON CONFLICT (custom_user_id) DO NOTHING;

-- ======================
-- DEMO COMPLAINT (CC-10482)
-- ======================

-- victim: victim_jane
INSERT INTO complaints (
    complaint_id, victim_id, victim_name, contact_number, incident_date,
    platform, crime_description, location, additional_details,
    ai_predicted_category, ai_confidence, severity, assigned_cell, status
)
SELECT
    'CC-10482',
    u.id,
    'Jane Doe',
    '+91-9812345678',
    '2026-01-15 09:30:00+00',
    'Instagram',
    'Unauthorized access to my Instagram account. The account was used to send phishing messages to my contacts and images from my profile were stolen and posted elsewhere without consent.',
    'Mumbai, Maharashtra',
    'Suspected the attacker gained access via a phishing link received on WhatsApp. No financial loss but privacy compromised significantly.',
    'online_account_hacking',
    0.91,
    'high',
    'Cyber Crime / Women Safety Cell',
    'case_created'
FROM users u
WHERE u.custom_user_id = 'victim_jane'
ON CONFLICT (complaint_id) DO NOTHING;

-- ======================
-- DEMO CASE (CYB-1042)
-- ======================

INSERT INTO cases (case_id, complaint_id, assigned_officer_id, case_title, status, risk_score)
SELECT
    'CYB-1042', c.id, o.id,
    'Instagram Account Takeover & Cyber Harassment',
    'under_investigation', 0.78
FROM complaints c
JOIN users o ON o.custom_user_id = 'officer_rahul'
WHERE c.complaint_id = 'CC-10482'
ON CONFLICT (case_id) DO NOTHING;

-- ======================
-- DEMO EVIDENCE (E-001, E-002, E-009)
-- ======================

INSERT INTO evidence (
    evidence_id, case_id, complaint_id, uploaded_by_id, source_type,
    evidence_type, file_url, sha256_hash, integrity_status, metadata
)
SELECT
    'E-001', cas.id, c.id, u.id,
    'victim', 'screenshot', 's3://dms-evidence/E-001_screenshot.jpg',
    'a7ffc6f8bf1ed76651c14756a061d662f580ff4de43b49fa82d80a4b80f8434a',
    'verified',
    '{"deviceInfo":"iPhone 13","captureTimestamp":"2026-01-15T12:00:00Z","sourceUrl":"https://instagram.com/p/ab12"}'::jsonb
FROM complaints c
JOIN cases cas ON cas.complaint_id = c.id
JOIN users u ON u.custom_user_id = 'victim_jane'
WHERE c.complaint_id = 'CC-10482'
ON CONFLICT (evidence_id) DO NOTHING;

INSERT INTO evidence (
    evidence_id, case_id, complaint_id, uploaded_by_id, source_type,
    evidence_type, file_url, sha256_hash, integrity_status, metadata
)
SELECT
    'E-002', cas.id, c.id, u.id,
    'victim', 'chat_export', 's3://dms-evidence/E-002_whatsapp_export.txt',
    'b286bfb3e7e43b46be50e8790e243c48c0b1f20e85d3f3e9f3c88e0a5b67d1e2',
    'verified',
    '{"platform":"WhatsApp","captureTimestamp":"2026-01-15T13:00:00Z","sourceUrl":"https://wa.me/919876543210"}'::jsonb
FROM complaints c
JOIN cases cas ON cas.complaint_id = c.id
JOIN users u ON u.custom_user_id = 'victim_jane'
WHERE c.complaint_id = 'CC-10482'
ON CONFLICT (evidence_id) DO NOTHING;

INSERT INTO evidence (
    evidence_id, case_id, complaint_id, uploaded_by_id, source_type,
    evidence_type, file_url, sha256_hash, integrity_status, metadata
)
SELECT
    'E-009', cas.id, c.id, u.id,
    'forensic', 'document', 's3://dms-evidence/E-009_forensic_report.pdf',
    'c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c3d4',
    'verified',
    '{"labName":"Digital Forensics Lab","analysisType":"account_activity_analysis","captureTimestamp":"2026-01-20T10:00:00Z"}'::jsonb
FROM complaints c
JOIN cases cas ON cas.complaint_id = c.id
JOIN users u ON u.custom_user_id = 'forensic_anil'
WHERE c.complaint_id = 'CC-10482'
ON CONFLICT (evidence_id) DO NOTHING;

-- ======================
-- HISTORICAL CHAIN-OF-CUSTODY
-- ======================

INSERT INTO chain_of_custody_logs (evidence_id, actor_id, actor_role, action, recorded_sha256_hash, remarks, timestamp)
SELECT e.id, u.id, 'victim', 'uploaded', e.sha256_hash, 'Evidence uploaded by victim',
       '2026-01-15 12:05:00+00'
FROM evidence e
JOIN users u ON u.custom_user_id = 'victim_jane'
WHERE e.evidence_id = 'E-001'
ON CONFLICT DO NOTHING;

INSERT INTO chain_of_custody_logs (evidence_id, actor_id, actor_role, action, recorded_sha256_hash, remarks, timestamp)
SELECT e.id, u.id, 'police', 'received', e.sha256_hash, 'Received by Cyber Cell',
       '2026-01-15 14:00:00+00'
FROM evidence e
JOIN users u ON u.custom_user_id = 'officer_rahul'
WHERE e.evidence_id = 'E-001'
ON CONFLICT DO NOTHING;

INSERT INTO chain_of_custody_logs (evidence_id, actor_id, actor_role, action, recorded_sha256_hash, remarks, timestamp)
SELECT e.id, u.id, 'police', 'verified', e.sha256_hash, 'Hash matched onchain anchor',
       '2026-01-15 14:30:00+00'
FROM evidence e
JOIN users u ON u.custom_user_id = 'officer_rahul'
WHERE e.evidence_id = 'E-001'
ON CONFLICT DO NOTHING;

INSERT INTO chain_of_custody_logs (evidence_id, actor_id, actor_role, action, recorded_sha256_hash, remarks, timestamp)
SELECT e.id, u.id, 'victim', 'uploaded', e.sha256_hash, 'Evidence uploaded by victim',
       '2026-01-15 15:10:00+00'
FROM evidence e
JOIN users u ON u.custom_user_id = 'victim_jane'
WHERE e.evidence_id = 'E-002'
ON CONFLICT DO NOTHING;

INSERT INTO chain_of_custody_logs (evidence_id, actor_id, actor_role, action, recorded_sha256_hash, remarks, timestamp)
SELECT e.id, u.id, 'investigator', 'uploaded', e.sha256_hash, 'Forensic report uploaded',
       '2026-01-20 11:00:00+00'
FROM evidence e
JOIN users u ON u.custom_user_id = 'forensic_anil'
WHERE e.evidence_id = 'E-009'
ON CONFLICT DO NOTHING;

INSERT INTO chain_of_custody_logs (evidence_id, actor_id, actor_role, action, recorded_sha256_hash, remarks, timestamp)
SELECT e.id, u.id, 'investigator', 'analysis_completed', e.sha256_hash, 'Account activity analysis completed',
       '2026-01-20 12:00:00+00'
FROM evidence e
JOIN users u ON u.custom_user_id = 'forensic_anil'
WHERE e.evidence_id = 'E-009'
ON CONFLICT DO NOTHING;

INSERT INTO chain_of_custody_logs (evidence_id, actor_id, actor_role, action, recorded_sha256_hash, remarks, timestamp)
SELECT e.id, u.id, 'police', 'received', e.sha256_hash, 'Report received for case file',
       '2026-01-21 09:00:00+00'
FROM evidence e
JOIN users u ON u.custom_user_id = 'officer_rahul'
WHERE e.evidence_id = 'E-009'
ON CONFLICT DO NOTHING;
