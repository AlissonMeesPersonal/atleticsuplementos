-- Migration-only legacy user ID bridge for Neon Managed Better Auth.
-- DO NOT run against Supabase. Intended for Neon migration preview only.
-- Production auth, user reactivation, and RLS remain NOT implemented.
-- The existing data stores old Supabase user UUIDs. Neon Auth creates new UUIDs.
-- This function is fail-closed until authorized account mappings are verified.
-- DO NOT put this schema in a Data API exposed schema list.

BEGIN;
CREATE SCHEMA IF NOT EXISTS migration_auth;
REVOKE ALL ON SCHEMA migration_auth FROM PUBLIC;
GRANT USAGE ON SCHEMA migration_auth TO authenticated;

CREATE OR REPLACE FUNCTION migration_auth.legacy_uid()
RETURNS uuid
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT legacy.id
  FROM migration_preview.legacy_auth_users AS legacy
  WHERE legacy.migrated_user_id = (SELECT auth.uid())
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION migration_auth.legacy_uid() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION migration_auth.legacy_uid() TO authenticated;
COMMIT;

-- Security checks (must pass for each Neon database):
SELECT
  migration_auth.legacy_uid() IS NULL AS fails_closed_without_identity,
  has_schema_privilege('anonymous','migration_auth','USAGE') = false AS anonymous_cannot_use_schema,
  has_function_privilege('anonymous','migration_auth.legacy_uid()','EXECUTE') = false AS anonymous_cannot_execute,
  has_function_privilege('authenticated','migration_auth.legacy_uid()','EXECUTE') = true AS signed_in_can_execute,
  has_schema_privilege('authenticated','migration_preview','USAGE') = false AS legacy_table_not_visible;

-- Do not populate migrated_user_id automatically by e-mail alone:
-- require verified ownership, admin-approved role mapping and secure activation.
-- Legacy UUID references validated in migration_preview are NOT Neon Auth sessions.
