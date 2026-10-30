revoke all on table public.product_families from public, anon, authenticated;
grant select, insert, update on table public.product_families to authenticated;

revoke all on sequence public.product_families_id_seq from public, anon, authenticated;
grant usage, select on sequence public.product_families_id_seq to authenticated;
