create table if not exists tracking_sites (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  site_url text not null,
  origin text not null unique,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_tracking_sites_active on tracking_sites(active, created_at desc);

insert into tracking_sites (name, site_url, origin, active)
values ('Earn Chat', 'https://www.earn-chat.com/', 'https://www.earn-chat.com', true)
on conflict (origin) do update set
  name = excluded.name,
  site_url = excluded.site_url,
  active = true,
  updated_at = now();
