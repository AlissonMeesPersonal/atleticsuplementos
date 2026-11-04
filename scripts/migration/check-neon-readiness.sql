-- Read-only verification for PostgreSQL 17 Neon migration preview.
-- Run against the intended Neon migration database (NOT a Supabase production database).
-- DO NOT expose migration_preview or migration_staging to the public Data API.

SELECT
 (SELECT count(*) FROM information_schema.tables WHERE table_schema='migration_preview' AND table_type='BASE TABLE') AS preview_tables,
 (SELECT count(*) FROM pg_indexes WHERE schemaname='migration_preview') AS preview_indexes,
 (SELECT count(*) FROM information_schema.table_constraints WHERE table_schema='migration_preview' AND constraint_type IN ('PRIMARY KEY','UNIQUE')) AS unique_primary_constraints,
 (SELECT count(*) FROM information_schema.table_constraints WHERE table_schema='migration_preview' AND constraint_type='CHECK') AS check_constraints,
 (SELECT count(*) FROM information_schema.table_constraints WHERE table_schema='migration_preview' AND constraint_type='FOREIGN KEY') AS internal_foreign_keys,
 (SELECT count(*) FROM migration_staging.schema_artifacts) AS saved_source_objects,
 (SELECT count(*) FROM migration_staging.source_rows) AS staged_business_rows,
 (SELECT sum(source_count) FROM migration_staging.source_metadata) AS snapshot_expected_rows;

-- Verify each table's snapshot count vs private JSON staging count.
SELECT m.source_table,m.source_count AS source_snapshot,
 COALESCE(s.copied,0) AS staging_rows,
 (m.source_count=COALESCE(s.copied,0)) AS matches_snapshot
FROM migration_staging.source_metadata m
LEFT JOIN (SELECT source_table,count(*) AS copied FROM migration_staging.source_rows GROUP BY source_table) s USING(source_table)
ORDER BY matches_snapshot,m.source_table;

-- Constraints that could not be restored or still refer to Supabase schemas.
SELECT constraint_type,status,count(*) AS objects
FROM migration_staging.constraint_validation_log
GROUP BY constraint_type,status
ORDER BY constraint_type,status;

-- The following must remain zero until proper RLS and grants are deployed.
SELECT count(*) AS public_application_tables
FROM information_schema.tables
WHERE table_schema='public' AND table_type='BASE TABLE';

-- Critical: this test does NOT verify login, MFA, user ID remapping, private storage,
-- column generation expressions, SQL functions, cron, API integration, E2E or backups.
