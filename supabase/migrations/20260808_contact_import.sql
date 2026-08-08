alter table contacts
  add column if not exists external_session_id text;

create table if not exists contact_imports (
  id uuid primary key default gen_random_uuid(),
  filename text not null,
  total_rows integer not null default 0,
  valid_rows integer not null default 0,
  unique_rows integer not null default 0,
  added_rows integer not null default 0,
  updated_rows integer not null default 0,
  duplicate_rows integer not null default 0,
  invalid_rows integer not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists idx_contact_imports_created_at
  on contact_imports(created_at desc);
