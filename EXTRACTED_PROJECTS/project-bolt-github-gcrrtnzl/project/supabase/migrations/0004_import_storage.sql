create table public.import_jobs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  source_name text not null,
  source_fingerprint text not null,
  status text not null default 'staged' check (status in ('staged','validating','preview','committing','completed','failed','cancelled')),
  total_rows integer not null default 0 check (total_rows >= 0),
  valid_rows integer not null default 0 check (valid_rows >= 0),
  invalid_rows integer not null default 0 check (invalid_rows >= 0),
  error_summary jsonb not null default '[]'::jsonb,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);
create unique index import_jobs_fingerprint_idx on public.import_jobs(organization_id, source_fingerprint);
create index import_jobs_status_idx on public.import_jobs(organization_id, status, created_at desc);

create table public.import_rows (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  import_job_id uuid not null references public.import_jobs(id) on delete cascade,
  row_number integer not null check (row_number > 0),
  raw_data jsonb not null,
  normalized_data jsonb,
  status text not null default 'pending' check (status in ('pending','valid','invalid','committed')),
  diagnostics jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  unique (import_job_id, row_number)
);
create index import_rows_status_idx on public.import_rows(organization_id, import_job_id, status, row_number);

create table public.export_jobs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  export_type text not null,
  schema_version text not null,
  status text not null default 'pending' check (status in ('pending','running','completed','failed')),
  storage_path text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  error_message text
);
create index export_jobs_idx on public.export_jobs(organization_id, status, created_at desc);

alter table public.import_jobs enable row level security;
alter table public.import_rows enable row level security;
alter table public.export_jobs enable row level security;
create policy import_jobs_staff_read on public.import_jobs for select using (organization_id=public.current_organization_id() and public.is_staff());
create policy import_rows_staff_read on public.import_rows for select using (organization_id=public.current_organization_id() and public.is_staff());
create policy export_jobs_staff_read on public.export_jobs for select using (organization_id=public.current_organization_id() and public.is_staff());

-- Product media is stored under an organization-prefixed path: <organization_id>/<product_id>/<asset>.
insert into storage.buckets(id, name, public) values ('product-media','product-media',false)
on conflict (id) do update set public=false;

create policy product_media_select on storage.objects for select to authenticated
using (bucket_id='product-media' and split_part(name,'/',1)::uuid = public.current_organization_id());

create policy product_media_insert on storage.objects for insert to authenticated
with check (
  bucket_id='product-media'
  and public.is_staff()
  and split_part(name,'/',1)::uuid = public.current_organization_id()
);

create policy product_media_update on storage.objects for update to authenticated
using (bucket_id='product-media' and public.is_staff() and split_part(name,'/',1)::uuid=public.current_organization_id())
with check (bucket_id='product-media' and public.is_staff() and split_part(name,'/',1)::uuid=public.current_organization_id());

create policy product_media_delete on storage.objects for delete to authenticated
using (bucket_id='product-media' and public.is_staff() and split_part(name,'/',1)::uuid=public.current_organization_id());
