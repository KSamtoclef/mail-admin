create extension if not exists pgcrypto;

create table if not exists contacts (
  id uuid primary key default gen_random_uuid(),
  external_user_id text,
  external_session_id text,
  email text not null,
  email_normalized text generated always as (lower(trim(email))) stored,
  username text,
  country_code text,
  status text not null default 'active' check (status in ('active','suppressed','unsubscribed','bounced')),
  created_at timestamptz not null default now(),
  unique(email_normalized)
);

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

create table if not exists suppression_list (
  id uuid primary key default gen_random_uuid(),
  email_normalized text not null unique,
  reason text not null,
  created_at timestamptz not null default now()
);

create table if not exists campaigns (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  subject text not null,
  from_name text,
  reply_to text,
  html_body text,
  text_body text,
  audience_filter jsonb not null default '{}'::jsonb,
  tracking_mode text not null default 'clicks_and_site',
  status text not null default 'draft' check (status in ('draft','scheduled','sending','sent','paused','failed')),
  scheduled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists campaign_recipients (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references campaigns(id) on delete cascade,
  contact_id uuid not null references contacts(id) on delete cascade,
  provider_message_id text,
  tracking_token uuid not null default gen_random_uuid(),
  delivery_status text not null default 'queued',
  sent_at timestamptz,
  delivered_at timestamptz,
  bounced_at timestamptz,
  complained_at timestamptz,
  unsubscribed_at timestamptz,
  unique(campaign_id, contact_id),
  unique(tracking_token)
);

create table if not exists tracked_links (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references campaigns(id) on delete cascade,
  label text,
  destination_url text not null,
  created_at timestamptz not null default now()
);

create table if not exists tracking_sites (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  site_url text not null,
  origin text not null unique,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists send_settings (
  id smallint primary key default 1 check (id = 1),
  daily_send_limit integer not null default 500 check (daily_send_limit between 1 and 1000000),
  max_batch_size integer not null default 100 check (max_batch_size between 1 and 100),
  timezone text not null default 'Africa/Lagos',
  sending_paused boolean not null default false,
  updated_at timestamptz not null default now()
);

insert into send_settings (id, daily_send_limit, max_batch_size, timezone, sending_paused)
values (1, 500, 100, 'Africa/Lagos', false)
on conflict (id) do nothing;

create table if not exists sessions (
  id uuid primary key default gen_random_uuid(),
  contact_id uuid references contacts(id) on delete set null,
  campaign_id uuid references campaigns(id) on delete set null,
  recipient_id uuid references campaign_recipients(id) on delete set null,
  anonymous_id text,
  started_at timestamptz not null default now(),
  last_seen_at timestamptz,
  country_code text,
  region text,
  device_type text,
  browser text,
  os text
);

create table if not exists events (
  id bigserial primary key,
  occurred_at timestamptz not null default now(),
  event_type text not null,
  campaign_id uuid references campaigns(id) on delete set null,
  recipient_id uuid references campaign_recipients(id) on delete set null,
  contact_id uuid references contacts(id) on delete set null,
  session_id uuid references sessions(id) on delete set null,
  link_id uuid references tracked_links(id) on delete set null,
  page_url text,
  referrer text,
  is_bot boolean not null default false,
  bot_reason text,
  country_code text,
  region text,
  device_type text,
  browser text,
  metadata jsonb not null default '{}'::jsonb
);

create table if not exists provider_webhook_events (
  id bigserial primary key,
  provider text not null,
  provider_event_id text,
  event_type text not null,
  provider_message_id text,
  payload jsonb not null,
  received_at timestamptz not null default now(),
  unique(provider, provider_event_id)
);

alter table campaigns
  add column if not exists primary_link_url text,
  add column if not exists audience_cutoff_at timestamptz,
  add column if not exists audience_offset integer not null default 0,
  add column if not exists audience_total integer,
  add column if not exists dispatch_started_at timestamptz,
  add column if not exists completed_at timestamptz,
  add column if not exists send_confirmed_at timestamptz,
  add column if not exists failed_reason text;

alter table campaign_recipients
  add column if not exists queued_at timestamptz,
  add column if not exists attempt_count integer not null default 0,
  add column if not exists last_error text;

create table if not exists send_daily_counters (
  day_key date not null,
  timezone text not null,
  reserved_count integer not null default 0 check (reserved_count >= 0),
  updated_at timestamptz not null default now(),
  primary key (day_key, timezone)
);

create or replace function mail_reserve_send_quota(requested integer)
returns table (
  allowed integer,
  sent_today bigint,
  daily_send_limit integer,
  remaining_after bigint,
  max_batch_size integer,
  timezone text,
  sending_paused boolean
)
language plpgsql
security definer
set search_path = public
as $$
declare
  s send_settings%rowtype;
  local_day date;
  current_reserved integer;
  grant_count integer;
begin
  if requested is null or requested < 1 then
    raise exception 'requested must be at least 1';
  end if;

  select * into s from send_settings where id = 1 for update;
  if not found then
    raise exception 'send settings are not configured';
  end if;

  local_day := (now() at time zone s.timezone)::date;

  insert into send_daily_counters(day_key, timezone, reserved_count)
  values (local_day, s.timezone, 0)
  on conflict (day_key, timezone) do nothing;

  select reserved_count into current_reserved
  from send_daily_counters
  where day_key = local_day and timezone = s.timezone
  for update;

  if s.sending_paused then
    grant_count := 0;
  else
    grant_count := greatest(
      least(requested, s.max_batch_size, 100, s.daily_send_limit - current_reserved),
      0
    );
  end if;

  if grant_count > 0 then
    update send_daily_counters
    set reserved_count = reserved_count + grant_count,
        updated_at = now()
    where day_key = local_day and timezone = s.timezone;
  end if;

  return query
  select
    grant_count,
    current_reserved::bigint,
    s.daily_send_limit,
    greatest(s.daily_send_limit - current_reserved - grant_count, 0)::bigint,
    s.max_batch_size,
    s.timezone,
    s.sending_paused;
end;
$$;

create or replace function mail_daily_send_usage()
returns table (
  sent_today bigint,
  daily_send_limit integer,
  remaining_today bigint,
  max_batch_size integer,
  timezone text,
  sending_paused boolean
)
language sql
stable
security definer
set search_path = public
as $$
  select
    coalesce(c.reserved_count, 0)::bigint as sent_today,
    s.daily_send_limit,
    greatest(s.daily_send_limit - coalesce(c.reserved_count, 0), 0)::bigint as remaining_today,
    s.max_batch_size,
    s.timezone,
    s.sending_paused
  from send_settings s
  left join send_daily_counters c
    on c.day_key = (now() at time zone s.timezone)::date
   and c.timezone = s.timezone
  where s.id = 1;
$$;

create index if not exists idx_contact_imports_created_at on contact_imports(created_at desc);
create index if not exists idx_campaign_recipients_campaign on campaign_recipients(campaign_id);
create index if not exists idx_campaign_recipients_message on campaign_recipients(provider_message_id);
create index if not exists idx_campaign_recipients_dispatch on campaign_recipients(campaign_id, delivery_status, id);
create index if not exists idx_campaigns_dispatch_status on campaigns(status, scheduled_at, created_at);
create index if not exists idx_tracking_sites_active on tracking_sites(active, created_at desc);
create index if not exists idx_events_campaign_time on events(campaign_id, occurred_at desc);
create index if not exists idx_events_contact_time on events(contact_id, occurred_at desc);
create index if not exists idx_events_session_time on events(session_id, occurred_at desc);
create index if not exists idx_events_type_time on events(event_type, occurred_at desc);
