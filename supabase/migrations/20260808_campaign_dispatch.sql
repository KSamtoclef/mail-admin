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

create index if not exists idx_campaigns_dispatch_status
  on campaigns(status, scheduled_at, created_at);

create index if not exists idx_campaign_recipients_dispatch
  on campaign_recipients(campaign_id, delivery_status, id);

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
