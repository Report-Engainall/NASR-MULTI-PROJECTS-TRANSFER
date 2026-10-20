-- 0012 already established these composite uniqueness keys for cross-tenant FKs.
-- Keep one canonical constraint per key to avoid duplicate unique indexes.

alter table public.branches drop constraint if exists branches_id_organization_unique;
alter table public.categories drop constraint if exists categories_id_organization_unique;
alter table public.warehouses drop constraint if exists warehouses_id_organization_unique;
alter table public.products drop constraint if exists products_id_organization_unique;
alter table public.customers drop constraint if exists customers_id_organization_unique;
alter table public.price_lists drop constraint if exists price_lists_id_organization_unique;
alter table public.carts drop constraint if exists carts_id_organization_unique;
alter table public.orders drop constraint if exists orders_id_organization_unique;
alter table public.order_items drop constraint if exists order_items_id_organization_unique;
alter table public.order_status_history drop constraint if exists order_status_history_id_organization_unique;
