-- Replay das policies que já foram compiladas e revisadas em migration_preview.
-- Destino é protegido: NÃO conceder GRANT nem mudar roles ou mapping durante este passo.
-- O helper migration_auth.legacy_uid() continua NULL até ativação/verificação explícita.
DO $atletic_rls$
DECLARE rec record; stmt text; role_names text;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='migration_preview') THEN
    RAISE EXCEPTION 'Preview RLS ausente; recusar criação';
  END IF;
  IF EXISTS (SELECT 1 FROM migration_preview.legacy_auth_users WHERE migrated_user_id IS NOT NULL) THEN
    RAISE EXCEPTION 'Identidades já ativadas; exige auditoria antes do replay';
  END IF;
  IF EXISTS (
    SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='public' AND c.relkind='r' AND
      (has_table_privilege('anonymous',c.oid,'SELECT') OR
       has_table_privilege('authenticated',c.oid,'SELECT'))
  ) THEN
    RAISE EXCEPTION 'Há tabela liberada; interromper';
  END IF;
  FOR rec IN SELECT * FROM pg_policies WHERE schemaname='migration_preview' ORDER BY tablename,policyname LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_policies
       WHERE schemaname='public' AND tablename=rec.tablename AND policyname=rec.policyname) THEN
      SELECT string_agg(format('%I', r), ',') INTO role_names FROM unnest(rec.roles) r;
      stmt := format('CREATE POLICY %I ON public.%I AS %s FOR %s TO %s',
        rec.policyname,rec.tablename,rec.permissive,rec.cmd,role_names);
      IF rec.qual IS NOT NULL AND rec.cmd IN ('SELECT','UPDATE','DELETE','ALL') THEN
        stmt := stmt || format(' USING (%s)',replace(rec.qual,'migration_preview.','public.'));
      END IF;
      IF rec.with_check IS NOT NULL AND rec.cmd IN ('INSERT','UPDATE','ALL') THEN
        stmt := stmt || format(' WITH CHECK (%s)',replace(rec.with_check,'migration_preview.','public.'));
      END IF;
      EXECUTE stmt;
    END IF;
  END LOOP;
  IF (SELECT count(*) FROM pg_policies WHERE schemaname='public') !=
     (SELECT count(*) FROM pg_policies WHERE schemaname='migration_preview') THEN
    RAISE EXCEPTION 'Policy count mismatch';
  END IF;
END $atletic_rls$;
