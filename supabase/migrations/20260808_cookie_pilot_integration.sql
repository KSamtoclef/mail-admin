create table if not exists cookie_pilot_checks (
  id uuid primary key default gen_random_uuid(),
  purpose text not null check (purpose in ('test','pre_send')),
  campaign_id uuid references campaigns(id) on delete set null,
  broadcast_wave_id uuid references campaign_broadcast_waves(id) on delete set null,
  ok boolean not null default false,
  skipped boolean not null default false,
  http_status integer,
  duration_ms integer not null default 0 check (duration_ms >= 0),
  response_preview text,
  error text,
  created_at timestamptz not null default now()
);

create index if not exists idx_cookie_pilot_checks_created
  on cookie_pilot_checks(created_at desc);

create index if not exists idx_cookie_pilot_checks_wave
  on cookie_pilot_checks(broadcast_wave_id, purpose, created_at desc);
