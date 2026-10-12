-- Security hardening applied to Supabase project swilmjgpivwynosvuuqm on 2026-10-12.
-- Keeps admin barcode RPCs available to authenticated users while removing anonymous execution.
-- The functions themselves continue validating admin_users + role before performing any operation.

begin;

revoke all on function public.admin_lookup_barcode(text) from public, anon;
revoke all on function public.admin_receive_inventory(uuid, integer, text) from public, anon;
revoke all on function public.admin_set_inventory_after_erp(uuid, integer, integer, text) from public, anon;

grant execute on function public.admin_lookup_barcode(text) to authenticated;
grant execute on function public.admin_receive_inventory(uuid, integer, text) to authenticated;
grant execute on function public.admin_set_inventory_after_erp(uuid, integer, integer, text) to authenticated;

revoke all privileges on table public.admin_users from anon;
revoke all privileges on table public.inventory from anon;
revoke all privileges on table public.inventory_movements from anon;

revoke insert, update, delete, truncate, references, trigger
  on table public.products, public.product_variants, public.product_images
  from anon;

grant select on table public.products, public.product_variants, public.product_images to anon;

commit;
