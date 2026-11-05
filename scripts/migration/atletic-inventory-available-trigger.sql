-- ATLETIC: trigger non-destructive de quantidade disponível
-- Aplicar SOMENTE no destino Neon durante homologação. Não afeta Supabase.
-- Este trigger mantém o valor automaticamente; não converte a coluna em GENERATED ALWAYS.
CREATE SCHEMA IF NOT EXISTS atletic_internal;
REVOKE ALL ON SCHEMA atletic_internal FROM PUBLIC;
CREATE FUNCTION atletic_internal.inventory_available_on_write()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog
AS $$
BEGIN
  NEW.quantity_available := NEW.quantity_on_hand - NEW.quantity_reserved;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION atletic_internal.inventory_available_on_write() FROM PUBLIC;
CREATE TRIGGER atletic_inventory_calculate_available
  BEFORE INSERT OR UPDATE ON public.inventory
  FOR EACH ROW
  EXECUTE FUNCTION atletic_internal.inventory_available_on_write();
ALTER TABLE public.inventory
  ADD CONSTRAINT atletic_inventory_available_matches_balances
  CHECK (quantity_available IS NOT NULL AND quantity_available = quantity_on_hand - quantity_reserved);
-- O estado completo como GENERATED ALWAYS requer outra migração controlada,
-- com backup e janela de manutenção. Não DROP COLUMN nesta etapa.
